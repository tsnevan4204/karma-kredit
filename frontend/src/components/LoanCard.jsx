import React from 'react';
import '../styles/LoanCard.css';

const LoanCard = ({ loan, onSelect }) => (
  <div className="loan-card">
    <img src={loan.image} alt="Loan Purpose" className="loan-img" />
    <div className="loan-info">
      <h3>{loan.businessName}</h3>
      <p className="loan-desc">{loan.description}</p>
      <div className="loan-details">
        <span>Amount: <b>{loan.amount} USDC</b></span>
        <span>Credit Score: <b>{loan.creditScore}</b></span>
      </div>
      {onSelect && <button className="select-btn" onClick={() => onSelect(loan)}>Fund Loan</button>}
    </div>
  </div>
);

export default LoanCard;
