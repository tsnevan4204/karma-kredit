import React, { useState, useEffect } from 'react';
import CreditScoreDisplay from '../components/CreditScoreDisplay';
import Loader from '../components/Loader';
import LoanCard from '../components/LoanCard';
import '../styles/BusinessDashboard.css';

const API_URL = 'http://127.0.0.1:5000/api/fico-score';

const BusinessDashboard = ({ walletAddress, myLoans, loading: parentLoading }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', image: null });
  const [creditScore, setCreditScore] = useState(null);
  const [loanOptions, setLoanOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loanTerms, setLoanTerms] = useState(null); // {fico_score, max_loan_amount, interest_rate}

  useEffect(() => {
    console.log('[BusinessDashboard] Loaded. walletAddress:', walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    console.log('[BusinessDashboard] State changed:', {
      showForm,
      form,
      creditScore,
      loanOptions,
      loading,
      error,
      myLoans,
      parentLoading,
      loanTerms
    });
  }, [showForm, form, creditScore, loanOptions, loading, error, myLoans, parentLoading, loanTerms]);

  const handleChange = e => {
    const { name, value, files } = e.target;
    console.log('[handleChange] name:', name, 'value:', value, 'files:', files);
    setForm(f => ({
      ...f,
      [name]: files ? files[0] : value
    }));
  };

  const handleCheckEligibility = async () => {
    setLoading(true);
    setError(null);
    setCreditScore(null);
    setLoanTerms(null);
    console.log('[handleCheckEligibility] Checking FICO for wallet:', walletAddress);
    if (!walletAddress) {
      setError('No wallet connected. Please connect your wallet.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          chain: 'ethereum'
        })
      });
      console.log('[handleCheckEligibility] API response status:', res.status);
      const data = await res.json();
      console.log('[handleCheckEligibility] API response data:', data);
      if (!res.ok) throw new Error(data.message || 'Error fetching FICO score');
      setCreditScore(data.fico_score);
      setLoanTerms({
        fico_score: data.fico_score,
        max_loan_amount: data.max_loan_amount,
        interest_rate: data.interest_rate
      });
    } catch (err) {
      setError(err.message);
      console.error('[handleCheckEligibility] API error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    console.log('[handleSubmit] Form submitted. walletAddress:', walletAddress, 'form:', form);
    // Here you would send the loan application to your backend or smart contract
    setLoanOptions([{ id: Date.now(), businessName: 'My Biz', amount: form.amount, description: form.description, creditScore: creditScore, image: form.image, interestRate: loanTerms?.interest_rate }]);
    setShowForm(false);
    setForm({ amount: '', description: '', image: null });
    setLoading(false);
  };

  return (
    <div className="business-dashboard">
      <h2>Business Dashboard</h2>
      <div style={{color: 'orange', fontWeight: 600, marginBottom: 8}}>
        Wallet: {walletAddress ? walletAddress : 'Not connected'}
      </div>
      <CreditScoreDisplay score={creditScore} />
      <button className="apply-btn" onClick={handleCheckEligibility} disabled={loading}>
        Check Loan Eligibility
      </button>
      {loading && <Loader />}
      {loanTerms && (
        <div style={{margin: '1.5rem 0', background: '#f8fff8', border: '1px solid #27ae60', borderRadius: 8, padding: '1.2rem', color: '#101820'}}>
          <div><b>Your Credit Score:</b> {loanTerms.fico_score}</div>
          <div><b>Max Loan Amount:</b> {loanTerms.max_loan_amount} USDC</div>
          <div><b>Interest Rate:</b> {loanTerms.interest_rate !== null ? loanTerms.interest_rate + '%' : 'N/A'}</div>
          {loanTerms.max_loan_amount > 0 ? (
            <button className="apply-btn" style={{marginTop: '1rem'}} onClick={() => setShowForm(true)}>
              Continue to Loan Application
            </button>
          ) : (
            <div style={{color: 'red', marginTop: '1rem'}}>You are not eligible for a loan at this time.</div>
          )}
        </div>
      )}
      {showForm && loanTerms && loanTerms.max_loan_amount > 0 && (
        <form className="loan-form" onSubmit={handleSubmit}>
          <input type="number" name="amount" placeholder="Loan Amount (USDC)" value={form.amount} onChange={handleChange} required max={loanTerms.max_loan_amount} min={1} />
          <textarea name="description" placeholder="Describe your business and loan purpose" value={form.description} onChange={handleChange} required />
          <input type="file" name="image" accept="image/*" onChange={handleChange} required />
          <button type="submit" className="submit-btn">Submit Loan Application</button>
        </form>
      )}
      {error && <div style={{ color: 'red', margin: '1rem 0' }}>{error}</div>}
      <h3>Available Loan Options</h3>
      {parentLoading ? <Loader /> : (
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
