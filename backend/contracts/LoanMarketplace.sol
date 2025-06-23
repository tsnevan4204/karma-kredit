// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LoanMarketplace {
    struct Loan {
        address borrower;
        string ipfsCid; // Points to metadata JSON on IPFS
        uint256 amount;
        uint256 interestRate; // e.g., 650 = 6.5%
        uint256 creditScore;
        bool funded;
    }

    Loan[] public loans;

    event LoanCreated(uint256 indexed loanId, address indexed borrower, string ipfsCid);

    function createLoan(
        string memory ipfsCid,
        uint256 amount,
        uint256 interestRate,
        uint256 creditScore
    ) public {
        loans.push(Loan({
            borrower: msg.sender,
            ipfsCid: ipfsCid,
            amount: amount,
            interestRate: interestRate,
            creditScore: creditScore,
            funded: false
        }));
        emit LoanCreated(loans.length - 1, msg.sender, ipfsCid);
    }

    function getLoan(uint256 loanId) public view returns (Loan memory) {
        return loans[loanId];
    }

    function getAllLoans() public view returns (Loan[] memory) {
        return loans;
    }
}
