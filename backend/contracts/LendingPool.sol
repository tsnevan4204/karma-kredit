// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * LendingPool — ETF-style USDC pools (AgriPool, WomenFoundersPool, KarmaMax, ...)
 *
 *   - Investors deposit USDC into a pool and receive proportional SHARES.
 *   - A backend-controlled ALLOCATOR routes idle pool USDC into LoanMarket loans
 *     via `allocateToLoan()`, which calls `LoanMarket.fundLoan(loanId, amount)`.
 *     The pool itself becomes the lender on-chain; repayments flow back here.
 *   - On repayment, the allocator calls `creditRepayment()` to move USDC from
 *     `outstanding` back to `idle`. Share price (= totalAssets / totalShares)
 *     appreciates as interest is paid in.
 *   - Withdrawals are paid out of `idle` USDC at the current share price.
 *
 * MVP simplifications:
 *   - Pool's `category` and `minKarma` fields are off-chain hints — matching to
 *     loans is done by the backend allocator, not enforced on-chain.
 *   - One pool contract holds many pools (poolId-keyed) to save deploy gas.
 *   - Allocator is set via `setAllocator()` by the owner (no AccessControl).
 */
interface ILoanMarket {
    function registerAsInvestor() external;
    function fundLoan(uint256 loanId, uint256 amount) external;
}

contract LendingPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20      public immutable usdc;
    ILoanMarket public immutable loanMarket;
    address     public allocator;

    uint256 public constant MIN_DEPOSIT = 1_000_000; // $1 USDC for testnet

    struct Pool {
        string  name;            // e.g. "AgriPool"
        string  category;        // e.g. "agriculture" — off-chain label
        uint16  minKarma;        // 0-100, off-chain hint
        uint256 idle;            // USDC sitting in contract for this pool
        uint256 outstanding;     // USDC currently allocated to active loans
        uint256 totalShares;
        bool    active;
    }

    uint256 public poolCount;
    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => uint256)) public sharesOf;          // poolId => user => shares
    mapping(uint256 => mapping(uint256 => uint256)) public allocations;       // poolId => loanId => USDC out

    event PoolCreated(uint256 indexed poolId, string name, string category, uint16 minKarma);
    event PoolPaused(uint256 indexed poolId, bool active);
    event Deposited(uint256 indexed poolId, address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdrawn(uint256 indexed poolId, address indexed user, uint256 amount, uint256 sharesBurned);
    event Allocated(uint256 indexed poolId, uint256 indexed loanId, uint256 amount);
    event RepaymentCredited(uint256 indexed poolId, uint256 indexed loanId, uint256 amount);
    event LossRecorded(uint256 indexed poolId, uint256 indexed loanId, uint256 amount);
    event AllocatorChanged(address indexed newAllocator);

    constructor(address _usdc, address _loanMarket) Ownable(msg.sender) {
        require(_usdc != address(0) && _loanMarket != address(0), "Zero address");
        usdc       = IERC20(_usdc);
        loanMarket = ILoanMarket(_loanMarket);
        allocator  = msg.sender;
    }

    modifier onlyAllocator() {
        require(msg.sender == allocator, "Not allocator");
        _;
    }

    // ── Admin ────────────────────────────────────────────────────────────────────

    /**
     * Must be called once after deploy so the pool can fundLoan() on LoanMarket.
     * Reverts if already registered (LoanMarket.registerAsInvestor reverts).
     */
    function registerWithLoanMarket() external onlyOwner {
        loanMarket.registerAsInvestor();
    }

    function setAllocator(address newAllocator) external onlyOwner {
        require(newAllocator != address(0), "Zero address");
        allocator = newAllocator;
        emit AllocatorChanged(newAllocator);
    }

    function createPool(
        string calldata name,
        string calldata category,
        uint16 minKarma
    ) external onlyOwner returns (uint256 poolId) {
        require(minKarma <= 100, "minKarma 0-100");
        poolId = poolCount++;
        pools[poolId] = Pool({
            name:        name,
            category:    category,
            minKarma:    minKarma,
            idle:        0,
            outstanding: 0,
            totalShares: 0,
            active:      true
        });
        emit PoolCreated(poolId, name, category, minKarma);
    }

    function setPoolActive(uint256 poolId, bool active) external onlyOwner {
        require(poolId < poolCount, "Invalid pool");
        pools[poolId].active = active;
        emit PoolPaused(poolId, active);
    }

    // ── Deposit / Withdraw ───────────────────────────────────────────────────────

    function deposit(uint256 poolId, uint256 amount) external nonReentrant {
        require(poolId < poolCount, "Invalid pool");
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(amount >= MIN_DEPOSIT, "Below minimum");

        uint256 _totalAssets = p.idle + p.outstanding;
        uint256 shares = (p.totalShares == 0 || _totalAssets == 0)
            ? amount
            : (amount * p.totalShares) / _totalAssets;
        require(shares > 0, "Zero shares");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        p.idle           += amount;
        p.totalShares    += shares;
        sharesOf[poolId][msg.sender] += shares;

        emit Deposited(poolId, msg.sender, amount, shares);
    }

    function withdraw(uint256 poolId, uint256 shares) external nonReentrant {
        require(poolId < poolCount, "Invalid pool");
        Pool storage p = pools[poolId];
        require(shares > 0 && sharesOf[poolId][msg.sender] >= shares, "Bad shares");

        uint256 _totalAssets = p.idle + p.outstanding;
        uint256 amount = (shares * _totalAssets) / p.totalShares;
        require(amount > 0, "Zero amount");
        require(amount <= p.idle, "Insufficient liquidity");

        sharesOf[poolId][msg.sender] -= shares;
        p.totalShares    -= shares;
        p.idle           -= amount;

        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(poolId, msg.sender, amount, shares);
    }

    // ── Allocator-only: deploy capital to LoanMarket loans ───────────────────────

    function allocateToLoan(
        uint256 poolId,
        uint256 loanId,
        uint256 amount
    ) external onlyAllocator nonReentrant {
        require(poolId < poolCount, "Invalid pool");
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(amount > 0 && amount <= p.idle, "Insufficient idle");

        p.idle        -= amount;
        p.outstanding += amount;
        allocations[poolId][loanId] += amount;

        // approve + fund. forceApprove handles non-zero allowance edge cases (USDT-pattern)
        usdc.forceApprove(address(loanMarket), amount);
        loanMarket.fundLoan(loanId, amount);

        emit Allocated(poolId, loanId, amount);
    }

    /**
     * Backend calls this when it detects PaymentMade(pool, amount) on LoanMarket.
     * Moves principal back to idle; interest portion appreciates share price.
     */
    function creditRepayment(
        uint256 poolId,
        uint256 loanId,
        uint256 amount
    ) external onlyAllocator {
        require(poolId < poolCount, "Invalid pool");
        Pool storage p = pools[poolId];
        require(amount > 0, "Zero amount");

        uint256 alloc = allocations[poolId][loanId];
        uint256 principalPortion = amount > alloc ? alloc : amount;

        if (principalPortion > 0) {
            allocations[poolId][loanId] = alloc - principalPortion;
            p.outstanding -= principalPortion;
        }
        // All received USDC sits in this contract; credit it as idle.
        // Interest (amount - principalPortion) grows totalAssets → share price up.
        p.idle += amount;

        emit RepaymentCredited(poolId, loanId, amount);
    }

    /**
     * Mark allocation as defaulted (loss). Reduces outstanding and totalAssets,
     * which lowers share price for everyone in that pool.
     */
    function recordLoss(
        uint256 poolId,
        uint256 loanId,
        uint256 amount
    ) external onlyAllocator {
        require(poolId < poolCount, "Invalid pool");
        Pool storage p = pools[poolId];
        uint256 alloc = allocations[poolId][loanId];
        require(amount > 0 && amount <= alloc, "Bad loss amount");

        allocations[poolId][loanId] = alloc - amount;
        p.outstanding -= amount;
        emit LossRecorded(poolId, loanId, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────────

    function totalAssets(uint256 poolId) public view returns (uint256) {
        Pool storage p = pools[poolId];
        return p.idle + p.outstanding;
    }

    /// USDC per 1e18 shares (so callers can do amount * sharesIn / 1e18 off-chain)
    function sharePrice(uint256 poolId) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.totalShares == 0) return 1e18;
        return (totalAssets(poolId) * 1e18) / p.totalShares;
    }

    function userValue(uint256 poolId, address user) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.totalShares == 0) return 0;
        return (sharesOf[poolId][user] * totalAssets(poolId)) / p.totalShares;
    }

    function getPool(uint256 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }
}
