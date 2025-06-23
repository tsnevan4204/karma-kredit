// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MultitokenLoan is Ownable {    

    constructor() Ownable(msg.sender) {}

    struct Loan {
        address borrower;
        address token; // ERC-20 token address
        uint256 principal;
        uint256 interest;
        uint256 dueDate;
        bool funded;
        bool repaid;
    }

    uint256 public loanCounter;
    mapping(uint256 => Loan) public loans;

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        address token,
        uint256 principal,
        uint256 interest,
        uint256 dueDate
    );
    event LoanFunded(uint256 indexed loanId, address indexed funder);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower);

    // == Request a loan ==
    function requestLoan(
        address token,
        uint256 principal,
        uint256 interest,
        uint256 durationInDays
    ) external {
        require(principal > 0 && interest > 0, "Invalid terms");

        uint256 due = block.timestamp + (durationInDays * 1 days);
        loans[loanCounter] = Loan({
            borrower: msg.sender,
            token: token,
            principal: principal,
            interest: interest,
            dueDate: due,
            funded: false,
            repaid: false
        });

        emit LoanRequested(loanCounter, msg.sender, token, principal, interest, due);
        loanCounter++;
    }

    // == Fund a loan ==
    function fundLoan(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        require(!loan.funded, "Already funded");
        require(!loan.repaid, "Already repaid");

        IERC20 token = IERC20(loan.token);
        require(token.transferFrom(msg.sender, loan.borrower, loan.principal), "Transfer failed");

        loan.funded = true;
        emit LoanFunded(loanId, msg.sender);
    }

    // == Repay a loan ==
    function repayLoan(uint256 loanId) external {
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

    // == Admin withdraw function ==
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    // == View helper ==
    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }
}