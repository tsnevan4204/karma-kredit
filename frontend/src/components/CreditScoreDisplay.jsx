import React from 'react';
import '../styles/CreditScoreDisplay.css';

const CreditScoreDisplay = ({ score }) => (
  <div className="credit-score-display">
    <span className="score-label">Your Credit Score:</span>
    <span className="score-value">{score !== null ? score : '--'}</span>
  </div>
);

export default CreditScoreDisplay;
