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
        address token;
        uint256 principal;
        uint256 interest;
        uint256 dueDate;
        bool funded;
        bool repaid;
        string metadataCID; // ← NEW FIELD
    }

    uint256 public loanCounter;
    mapping(uint256 => Loan) public loans;

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        address token,
        uint256 principal,
        uint256 interest,
        uint256 dueDate,
        string metadataCID
    );

    event LoanFunded(uint256 indexed loanId, address indexed funder);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower);

    function requestLoan(
        address token,
        uint256 principal,
        uint256 interest,
        uint256 durationInDays,
        string calldata metadataCID
    ) external onlyBusiness {
        require(principal > 0 && interest > 0, "Invalid terms");

        uint256 due = block.timestamp + (durationInDays * 1 days);

        loans[loanCounter] = Loan({
            borrower: msg.sender,
            token: token,
            principal: principal,
            interest: interest,
            dueDate: due,
            funded: false,
            repaid: false,
            metadataCID: metadataCID
        });

        emit LoanRequested(loanCounter, msg.sender, token, principal, interest, due, metadataCID);
        loanCounter++;
    }

    function fundLoan(uint256 loanId) external onlyInvestor {
        Loan storage loan = loans[loanId];
        require(!loan.funded, "Already funded");
        require(!loan.repaid, "Already repaid");

        IERC20 token = IERC20(loan.token);
        require(token.transferFrom(msg.sender, loan.borrower, loan.principal), "Transfer failed");

        loan.funded = true;
        emit LoanFunded(loanId, msg.sender);
    }

    function repayLoan(uint256 loanId) external onlyBusiness {
        Loan storage loan = loans[loanId];
        require(msg.sender == loan.borrower, "Not borrower");
        require(loan.funded, "Loan not funded");
        require(!loan.repaid, "Already repaid");

        IERC20 token = IERC20(loan.token);
        uint256 total = loan.principal + loan.interest;
        require(token.transferFrom(msg.sender, address(this), total), "Repayment failed");

        loan.repaid = true;
        emit LoanRepaid(loanId, msg.sender);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }
}