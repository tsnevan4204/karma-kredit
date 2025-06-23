import React from 'react';
import LoanCard from '../components/LoanCard';
import Loader from '../components/Loader';
import { useWeb3 } from '../context/Web3Context';
import '../styles/Directory.css';

const Directory = ({ loans, onFund, loading }) => {
  const { role } = useWeb3();
  return (
    <div className="directory-page">
      <h2>Directory</h2>
      <p className="subtitle">Browse all small business loan requests.</p>
      {loading ? <Loader /> : (
        <div className="loan-market-list">
          {loans && loans.length ? loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} onSelect={role === 'investor' ? onFund : undefined} />
          )) : <p>No loans available.</p>}
        </div>
      )}
    </div>
  );
};

export default Directory;
