// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MultitokenLoan is Ownable {
    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    // === Stablecoin Used for All Loans ===
    IERC20 public immutable usdc;

    // === Roles ===
    mapping(address => bool) public isBusiness;
    mapping(address => bool) public isInvestor;

    modifier onlyBusiness() {
        require(isBusiness[msg.sender], "Not a registered business");
        _;
    }

    modifier onlyInvestor() {
        require(isInvestor[msg.sender], "Not a registered investor");
        _;
    }

    // === Self-Registration ===
    function registerAsBusiness() external {
        require(!isBusiness[msg.sender] && !isInvestor[msg.sender], "Already registered");
        isBusiness[msg.sender] = true;
    }

    function registerAsInvestor() external {
        require(!isInvestor[msg.sender] && !isBusiness[msg.sender], "Already registered");
        isInvestor[msg.sender] = true;
    }

    function getUserRole(address user) external view returns (string memory) {
        if (isBusiness[user]) return "business";
        if (isInvestor[user]) return "investor";
        return "unknown";
    }

    // === Loan Data ===
    struct Loan {
        address borrower;
        address funder;
        uint256 principal;
        uint256 interest;
        uint256 dueDate;
        bool funded;
        bool repaid;
        string metadataCID;
        uint256 monthlyPayment;
        uint256 totalPaid;
        uint256 duration;
    }

    uint256 public loanCounter;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => uint256[]) public loanPayments;

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint256 interest,
        uint256 dueDate,
        string metadataCID,
        uint256 monthlyPayment,
        uint256 duration
    );

    event LoanFunded(uint256 indexed loanId, address indexed funder);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower);
    event PaymentMade(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 totalPaid);

    // === Simplified Flat Interest Calculation ===
    function calculateCompoundPayment(uint256 principal, uint256 annualRateBps, uint256 months)
        internal
        pure
        returns (uint256)
    {
        uint256 totalInterest = (principal * annualRateBps * months) / (10000 * 24);
        uint256 totalAmount = principal + totalInterest;
        return totalAmount / months;
    }

    function calculateTotalOwed(uint256 principal, uint256 annualRateBps, uint256 months)
        internal
        pure
        returns (uint256)
    {
        uint256 monthlyPayment = calculateCompoundPayment(principal, annualRateBps, months);
        return monthlyPayment * months;
    }

    // === Create Loan Request ===
    function requestLoan(
        uint256 principal,
        uint256 interest,
        uint256 durationInMonths,
        string calldata metadataCID
    ) external onlyBusiness {
        require(principal > 0 && interest > 0, "Invalid terms");
        require(durationInMonths > 0 && durationInMonths <= 24, "Duration must be 1-24 months");

        uint256 monthlyPayment = calculateCompoundPayment(principal, interest, durationInMonths);

        loans[loanCounter] = Loan({
            borrower: msg.sender,
            funder: address(0),
            principal: principal,
            interest: interest,
            dueDate: block.timestamp + (durationInMonths * 30 days),
            funded: false,
            repaid: false,
            metadataCID: metadataCID,
            monthlyPayment: monthlyPayment,
            totalPaid: 0,
            duration: durationInMonths
        });

        emit LoanRequested(
            loanCounter,
            msg.sender,
            principal,
            interest,
            loans[loanCounter].dueDate,
            metadataCID,
            monthlyPayment,
            durationInMonths
        );

        loanCounter++;
    }

    // === Investor Funds Loan ===
    function fundLoan(uint256 loanId) external onlyInvestor {
        Loan storage loan = loans[loanId];
        require(!loan.funded, "Already funded");
        require(!loan.repaid, "Already repaid");

        require(
            usdc.transferFrom(msg.sender, loan.borrower, loan.principal),
            "USDC transfer failed"
        );

        loan.funded = true;
        loan.funder = msg.sender;

        emit LoanFunded(loanId, msg.sender);
    }

    // === Flexible Repayment: Borrower Chooses Payment Amount ===
    function makePayment(uint256 loanId, uint256 amount) public onlyBusiness {
        Loan storage loan = loans[loanId];
        require(msg.sender == loan.borrower, "Not borrower");
        require(loan.funded, "Loan not funded");
        require(!loan.repaid, "Already repaid");
        require(amount > 0, "Amount must be > 0");

        uint256 totalOwed = calculateTotalOwed(loan.principal, loan.interest, loan.duration);
        uint256 remainingBalance = totalOwed - loan.totalPaid;
        require(remainingBalance > 0, "Loan fully paid");

        // Cap overpayment automatically
        uint256 payment = amount > remainingBalance ? remainingBalance : amount;

        require(
            usdc.transferFrom(msg.sender, loan.funder, payment),
            "USDC payment failed"
        );

        loan.totalPaid += payment;
        loanPayments[loanId].push(payment);

        if (loan.totalPaid >= totalOwed) {
            loan.repaid = true;
            emit LoanRepaid(loanId, msg.sender);
        }

        emit PaymentMade(loanId, msg.sender, payment, loan.totalPaid);
    }

    // Backwards-compatible alias
    function repayLoan(uint256 loanId, uint256 amount) external {
        makePayment(loanId, amount);
    }

    // === Owner Withdrawal (for accidental token stuck) ===
    function withdrawUSDC(address to, uint256 amount) external onlyOwner {
        require(usdc.transfer(to, amount), "Withdrawal failed");
    }

    // === Helpers ===
    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getPaymentHistory(uint256 loanId) external view returns (uint256[] memory) {
        return loanPayments[loanId];
    }

    function getRemainingBalance(uint256 loanId) external view returns (uint256) {
        Loan storage loan = loans[loanId];
        uint256 totalOwed = calculateTotalOwed(loan.principal, loan.interest, loan.duration);
        return totalOwed - loan.totalPaid;
    }
}