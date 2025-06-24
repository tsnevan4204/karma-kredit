import React from 'react';
import LoanCard from '../components/LoanCard';
import Loader from '../components/Loader';
import '../styles/InvestorDashboard.css';

const InvestorDashboard = ({ investments, loading }) => (
  <div className="investor-dashboard">
    <h2>My Investments</h2>
    <p className="subtitle">View the loans you have funded and track their progress.</p>
    {loading ? <Loader /> : (
      <div className="loan-market-list">
        {investments && investments.length ? investments.map(loan => (
          <LoanCard key={loan.id} loan={loan} />
        )) : <p>You have not funded any loans yet.</p>}
      </div>
    )}
  </div>
);

export default InvestorDashboard;
