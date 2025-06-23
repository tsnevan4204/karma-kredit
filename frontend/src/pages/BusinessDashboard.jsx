import React, { useState } from 'react';
import CreditScoreDisplay from '../components/CreditScoreDisplay';
import Loader from '../components/Loader';
import LoanCard from '../components/LoanCard';
import '../styles/BusinessDashboard.css';

const BusinessDashboard = ({ walletAddress, onApplyLoan, creditScore, loanOptions, myLoans, loading }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', image: null });

  const handleChange = e => {
    const { name, value, files } = e.target;
    setForm(f => ({
      ...f,
      [name]: files ? files[0] : value
    }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    onApplyLoan(form);
    setShowForm(false);
    setForm({ amount: '', description: '', image: null });
  };

  return (
    <div className="business-dashboard">
      <h2>Business Dashboard</h2>
      <CreditScoreDisplay score={creditScore} />
      <button className="apply-btn" onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancel' : 'Apply for Loan'}
      </button>
      {showForm && (
        <form className="loan-form" onSubmit={handleSubmit}>
          <input type="number" name="amount" placeholder="Loan Amount (USDC)" value={form.amount} onChange={handleChange} required />
          <textarea name="description" placeholder="Describe your business and loan purpose" value={form.description} onChange={handleChange} required />
          <input type="file" name="image" accept="image/*" onChange={handleChange} required />
          <button type="submit" className="submit-btn">Submit Loan Application</button>
        </form>
      )}
      <h3>Available Loan Options</h3>
      {loading ? <Loader /> : (
        <div className="loan-options-list">
          {loanOptions && loanOptions.length ? loanOptions.map(loan => (
            <LoanCard key={loan.id} loan={loan} />
          )) : <p>No loan options available.</p>}
        </div>
      )}
      <h3>My Loan Applications</h3>
      <div className="loan-options-list">
        {myLoans && myLoans.length ? myLoans.map(loan => (
          <LoanCard key={loan.id} loan={loan} />
        )) : <p>No loans posted yet.</p>}
      </div>
    </div>
  );
};

export default BusinessDashboard;
