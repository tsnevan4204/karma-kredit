// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LoanMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    uint256 public constant MIN_CONTRIBUTION = 2_000_000;       // $2 USDC (testnet)
    uint256 public constant MIN_PRINCIPAL    = 10_000_000;      // $10 USDC
    uint256 public constant MAX_PRINCIPAL    = 2_000_000_000;   // $2000 USDC

    mapping(address => bool) public isBorrower;
    mapping(address => bool) public isInvestor;

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 interestBps;      // annual rate in basis points (e.g. 1200 = 12%)
        uint256 durationMonths;
        uint256 dueDate;
        uint256 fundedAmount;     // cumulative USDC funded so far
        uint256 totalPaid;        // cumulative repaid
        uint256 monthlyPayment;   // informational
        bool    repaid;
        string  metadataURI;
    }

    uint256 public loanCounter;
    mapping(uint256 => Loan)                            public loans;
    mapping(uint256 => mapping(address => uint256))     public contributions;
    mapping(uint256 => address[])                       private _lenders;

    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 interestBps, uint256 durationMonths);
    event LoanFunded(uint256 indexed loanId, address indexed lender, uint256 amount, uint256 newFundedAmount);
    event LoanFullyFunded(uint256 indexed loanId);
    event PaymentMade(uint256 indexed loanId, address indexed lender, uint256 amount);
    event LoanRepaid(uint256 indexed loanId);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    // ── Registration ────────────────────────────────────────────────────────────

    function registerAsBorrower() external {
        require(!isBorrower[msg.sender] && !isInvestor[msg.sender], "Already registered");
        isBorrower[msg.sender] = true;
    }

    function registerAsInvestor() external {
        require(!isInvestor[msg.sender] && !isBorrower[msg.sender], "Already registered");
        isInvestor[msg.sender] = true;
    }

    function getUserRole(address user) external view returns (string memory) {
        if (isBorrower[user]) return "borrower";
        if (isInvestor[user]) return "investor";
        return "unknown";
    }

    // ── Interest math (flat / simple interest) ───────────────────────────────────

    function _totalOwed(uint256 principal, uint256 interestBps, uint256 months) internal pure returns (uint256) {
        uint256 totalInterest = (principal * interestBps * months) / (10_000 * 12);
        return principal + totalInterest;
    }

    function _monthlyPayment(uint256 principal, uint256 interestBps, uint256 months) internal pure returns (uint256) {
        return _totalOwed(principal, interestBps, months) / months;
    }

    // ── Borrow ───────────────────────────────────────────────────────────────────

    function requestLoan(
        uint256 principal,
        uint256 interestBps,
        uint256 durationMonths,
        string calldata metadataURI
    ) external {
        require(isBorrower[msg.sender], "Not a borrower");
        require(principal >= MIN_PRINCIPAL && principal <= MAX_PRINCIPAL, "Principal out of range");
        require(durationMonths >= 1 && durationMonths <= 24, "Duration 1-24 months");

        uint256 mp = _monthlyPayment(principal, interestBps, durationMonths);

        loans[loanCounter] = Loan({
            borrower:       msg.sender,
            principal:      principal,
            interestBps:    interestBps,
            durationMonths: durationMonths,
            dueDate:        block.timestamp + durationMonths * 30 days,
            fundedAmount:   0,
            totalPaid:      0,
            monthlyPayment: mp,
            repaid:         false,
            metadataURI:    metadataURI
        });

        emit LoanRequested(loanCounter, msg.sender, principal, interestBps, durationMonths);
        loanCounter++;
    }

    // ── Invest ───────────────────────────────────────────────────────────────────

    function fundLoan(uint256 loanId, uint256 amount) external nonReentrant {
        require(isInvestor[msg.sender], "Not an investor");
        require(amount >= MIN_CONTRIBUTION, "Below minimum contribution");

        Loan storage loan = loans[loanId];
        require(loan.borrower != address(0), "Loan does not exist");
        require(!loan.repaid, "Already repaid");
        require(loan.fundedAmount < loan.principal, "Fully funded");

        uint256 remaining = loan.principal - loan.fundedAmount;
        uint256 fill = amount > remaining ? remaining : amount;

        if (contributions[loanId][msg.sender] == 0) {
            _lenders[loanId].push(msg.sender);
        }
        contributions[loanId][msg.sender] += fill;
        loan.fundedAmount += fill;

        // P2P: USDC goes directly from investor to borrower
        usdc.safeTransferFrom(msg.sender, loan.borrower, fill);

        emit LoanFunded(loanId, msg.sender, fill, loan.fundedAmount);

        if (loan.fundedAmount == loan.principal) {
            emit LoanFullyFunded(loanId);
        }
    }

    // ── Repay ────────────────────────────────────────────────────────────────────

    function makePayment(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(msg.sender == loan.borrower, "Not borrower");
        require(loan.fundedAmount > 0, "Loan not funded");
        require(!loan.repaid, "Already repaid");
        require(amount > 0, "Amount must be > 0");

        uint256 owed      = _totalOwed(loan.principal, loan.interestBps, loan.durationMonths);
        uint256 remaining = owed - loan.totalPaid;
        require(remaining > 0, "Fully paid");

        uint256 payment = amount > remaining ? remaining : amount;

        address[] storage ls = _lenders[loanId];
        uint256 funded = loan.fundedAmount;
        uint256 distributed;

        for (uint256 i = 0; i < ls.length; i++) {
            uint256 share;
            if (i == ls.length - 1) {
                share = payment - distributed;     // last lender absorbs rounding dust
            } else {
                share = (payment * contributions[loanId][ls[i]]) / funded;
            }
            if (share > 0) {
                usdc.safeTransferFrom(msg.sender, ls[i], share);
                emit PaymentMade(loanId, ls[i], share);
                distributed += share;
            }
        }

        loan.totalPaid += payment;

        if (loan.totalPaid >= owed) {
            loan.repaid = true;
            emit LoanRepaid(loanId);
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────────

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getLenders(uint256 loanId) external view returns (address[] memory) {
        return _lenders[loanId];
    }

    function getContribution(uint256 loanId, address lender) external view returns (uint256) {
        return contributions[loanId][lender];
    }

    function getRemainingBalance(uint256 loanId) external view returns (uint256) {
        Loan storage loan = loans[loanId];
        uint256 owed = _totalOwed(loan.principal, loan.interestBps, loan.durationMonths);
        return owed > loan.totalPaid ? owed - loan.totalPaid : 0;
    }

    function withdrawUSDC(address to, uint256 amount) external onlyOwner {
        usdc.safeTransfer(to, amount);
    }
}
