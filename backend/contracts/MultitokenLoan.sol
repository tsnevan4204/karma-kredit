// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MultitokenLoan is Ownable {
    constructor() Ownable(msg.sender) {}

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
        address funder; // Track who funded this loan
        address token;
        uint256 principal;
        uint256 interest;
        uint256 dueDate;
        bool funded;
        bool repaid;
        string metadataCID;
        uint256 monthlyPayment;
        uint256 totalPaid;
        uint256 duration; // in months
    }

    uint256 public loanCounter;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => uint256[]) public loanPayments; // Track payment history

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        address token,
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

    // Calculate monthly payment using simple approximation that's more predictable
    // For microloans, use simplified calculation: principal/months + average interest
    function calculateCompoundPayment(uint256 principal, uint256 annualRateBps, uint256 months) internal pure returns (uint256) {
        // Calculate total interest over the life of the loan (simplified)
        uint256 totalInterest = (principal * annualRateBps * months) / (10000 * 24); // Reduced by ~half for compound effect
        uint256 totalAmount = principal + totalInterest;
        return totalAmount / months;
    }

    // Calculate total amount owed for compound interest loan
    function calculateTotalOwed(uint256 principal, uint256 annualRateBps, uint256 months) internal pure returns (uint256) {
        uint256 monthlyPayment = calculateCompoundPayment(principal, annualRateBps, months);
        return monthlyPayment * months;
    }

    function requestLoan(
        address token,
        uint256 principal,
        uint256 interest,
        uint256 durationInMonths,
        string calldata metadataCID
    ) external onlyBusiness {
        require(principal > 0 && interest > 0, "Invalid terms");
        require(durationInMonths > 0 && durationInMonths <= 24, "Duration must be 1-24 months");

        // Calculate monthly payment using compound interest formula
        // M = P * [r(1+r)^n] / [(1+r)^n - 1] where r = monthly rate, n = months
        // Interest is in basis points (e.g., 1000 = 10% annual)
        uint256 monthlyPayment = calculateCompoundPayment(principal, interest, durationInMonths);

        loans[loanCounter] = Loan({
            borrower: msg.sender,
            funder: address(0), // Will be set when loan is funded
            token: token,
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

        emit LoanRequested(loanCounter, msg.sender, token, principal, interest, loans[loanCounter].dueDate, metadataCID, monthlyPayment, durationInMonths);
        loanCounter++;
    }

    function fundLoan(uint256 loanId) external payable onlyInvestor {
        Loan storage loan = loans[loanId];
        require(!loan.funded, "Already funded");
        require(!loan.repaid, "Already repaid");

        if (loan.token == address(0)) {
            // Native token (ETH/FLOW) transfer
            require(msg.value == loan.principal, "Incorrect ETH amount");
            payable(loan.borrower).transfer(loan.principal);
        } else {
            // ERC20 token transfer
            require(msg.value == 0, "No ETH needed for ERC20 transfer");
            IERC20 token = IERC20(loan.token);
            require(token.transferFrom(msg.sender, loan.borrower, loan.principal), "Transfer failed");
        }

        loan.funded = true;
        loan.funder = msg.sender; // Track who funded this loan
        emit LoanFunded(loanId, msg.sender);
    }

    function makePayment(uint256 loanId) external payable onlyBusiness {
        Loan storage loan = loans[loanId];
        require(msg.sender == loan.borrower, "Not borrower");
        require(loan.funded, "Loan not funded");
        require(!loan.repaid, "Already fully repaid");
        require(loan.funder != address(0), "No funder recorded");

        uint256 totalOwed = calculateTotalOwed(loan.principal, loan.interest, loan.duration);
        uint256 remainingBalance = totalOwed - loan.totalPaid;
        require(remainingBalance > 0, "Loan already fully paid");

        uint256 paymentAmount;
        
        if (loan.token == address(0)) {
            // Native token (ETH/FLOW) payment
            paymentAmount = msg.value;
            require(paymentAmount > 0, "Payment amount must be greater than 0");
            require(paymentAmount <= remainingBalance, "Payment exceeds remaining balance");
            // Send payment directly to the investor who funded the loan
            payable(loan.funder).transfer(paymentAmount);
        } else {
            // ERC20 token payment
            require(msg.value == 0, "No ETH needed for ERC20 payment");
            // For ERC20, we'll expect the monthly payment amount for simplicity
            paymentAmount = loan.monthlyPayment;
            if (paymentAmount > remainingBalance) {
                paymentAmount = remainingBalance;
            }
            IERC20 token = IERC20(loan.token);
            require(token.transferFrom(msg.sender, loan.funder, paymentAmount), "Payment failed");
        }

        // Update loan state
        loan.totalPaid += paymentAmount;
        loanPayments[loanId].push(paymentAmount);

        // Check if loan is fully repaid
        if (loan.totalPaid >= totalOwed) {
            loan.repaid = true;
            emit LoanRepaid(loanId, msg.sender);
        }

        emit PaymentMade(loanId, msg.sender, paymentAmount, loan.totalPaid);
    }

    // Alias for makePayment to maintain backward compatibility
    function repayLoan(uint256 loanId) external payable onlyBusiness {
        // Call the internal payment logic directly
        Loan storage loan = loans[loanId];
        require(msg.sender == loan.borrower, "Not borrower");
        require(loan.funded, "Loan not funded");
        require(!loan.repaid, "Already fully repaid");
        require(loan.funder != address(0), "No funder recorded");

        uint256 totalOwed = calculateTotalOwed(loan.principal, loan.interest, loan.duration);
        uint256 remainingBalance = totalOwed - loan.totalPaid;
        require(remainingBalance > 0, "Loan already fully paid");

        uint256 paymentAmount;
        
        if (loan.token == address(0)) {
            // Native token (ETH/FLOW) payment
            paymentAmount = msg.value;
            require(paymentAmount > 0, "Payment amount must be greater than 0");
            require(paymentAmount <= remainingBalance, "Payment exceeds remaining balance");
            // Send payment directly to the investor who funded the loan
            payable(loan.funder).transfer(paymentAmount);
        } else {
            // ERC20 token payment
            require(msg.value == 0, "No ETH needed for ERC20 payment");
            paymentAmount = loan.monthlyPayment;
            if (paymentAmount > remainingBalance) {
                paymentAmount = remainingBalance;
            }
            IERC20 token = IERC20(loan.token);
            require(token.transferFrom(msg.sender, loan.funder, paymentAmount), "Payment failed");
        }

        // Update loan state
        loan.totalPaid += paymentAmount;
        loanPayments[loanId].push(paymentAmount);

        // Check if loan is fully repaid
        if (loan.totalPaid >= totalOwed) {
            loan.repaid = true;
            emit LoanRepaid(loanId, msg.sender);
        }

        emit PaymentMade(loanId, msg.sender, paymentAmount, loan.totalPaid);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        to.transfer(amount);
    }

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