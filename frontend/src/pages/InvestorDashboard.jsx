import React from 'react';
import LoanCard from '../components/LoanCard';
import Loader from '../components/Loader';
import '../styles/InvestorDashboard.css';

const InvestorDashboard = ({ loans, onFund, loading }) => (
  <div className="investor-dashboard">
    <h2>Investor Dashboard</h2>
    <p className="subtitle">Browse and fund small business loans.</p>
    {loading ? <Loader /> : (
      <div className="loan-market-list">
        {loans && loans.length ? loans.map(loan => (
          <LoanCard key={loan.id} loan={loan} onSelect={onFund} />
        )) : <p>No loans available for funding.</p>}
      </div>
    )}
  </div>
);

export default InvestorDashboard;
