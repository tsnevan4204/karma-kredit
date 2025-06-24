import React, { useEffect, useState } from 'react';
import LoanCard from '../components/LoanCard';
import Loader from '../components/Loader';
import { useWeb3 } from '../context/Web3Context';
import '../styles/Directory.css';

const Directory = () => {
  const { provider, role } = useWeb3();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLoans = async () => {
      if (!provider) return;
      setLoading(true);
      setError(null);
      try {
        const contract = getLoanMarketplaceContract(provider);
        const onChainLoans = await contract.getAllLoans();
        // Fetch metadata from IPFS for each loan
        const loansWithMeta = await Promise.all(onChainLoans.map(async (loan, idx) => {
          let meta = {};
          try {
            const res = await fetch(`https://gateway.pinata.cloud/ipfs/${loan.ipfsCid}`);
            meta = await res.json();
          } catch (e) {
            meta = { description: 'Failed to load metadata', image: '' };
          }
          return {
            id: idx,
            borrower: loan.borrower,
            amount: Number(loan.amount),
            interestRate: Number(loan.interestRate) / 100,
            creditScore: Number(loan.creditScore),
            funded: loan.funded,
            ipfsCid: loan.ipfsCid,
            description: meta.description,
            image: meta.image ? `https://gateway.pinata.cloud/ipfs/${meta.image.replace('ipfs://', '')}` : '',
          };
        }));
        setLoans(loansWithMeta);
      } catch (err) {
        setError('Failed to fetch loans: ' + (err.message || err));
      } finally {
        setLoading(false);
      }
    };
    fetchLoans();
  }, [provider]);

  return (
    <div className="directory-page">
      <h2>Directory</h2>
      <p className="subtitle">Browse all small business loan requests.</p>
      {loading ? <Loader /> : error ? <div style={{color:'red'}}>{error}</div> : (
        <div className="loan-market-list">
          {loans && loans.length ? loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} onSelect={role === 'investor' ? () => {} : undefined} />
          )) : <p>No loans available.</p>}
        </div>
      )}
    </div>
  );
};

export default Directory;
