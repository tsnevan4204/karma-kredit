import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import BusinessDashboard from './pages/BusinessDashboard';
import InvestorDashboard from './pages/InvestorDashboard';

const mockLoans = [
  // Example loan objects for UI demo
];

const AppRouter = () => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [creditScore, setCreditScore] = useState(null);
  const [loanOptions, setLoanOptions] = useState([]);
  const [myLoans, setMyLoans] = useState([]);
  const [marketLoans, setMarketLoans] = useState(mockLoans);
  const [loading, setLoading] = useState(false);

  const handleConnectWallet = () => {
    setWalletConnected(true);
    // TODO: Integrate wallet connection logic
  };

  const handleApplyLoan = (form) => {
    setLoading(true);
    // TODO: Integrate with backend/model for credit score and loan creation
    setTimeout(() => {
      setCreditScore(720); // Mock
      setLoanOptions([{ id: 1, businessName: 'My Biz', amount: form.amount, description: form.description, creditScore: 720, image: URL.createObjectURL(form.image) }]);
      setMyLoans(loans => [...loans, { id: Date.now(), businessName: 'My Biz', amount: form.amount, description: form.description, creditScore: 720, image: URL.createObjectURL(form.image) }]);
      setLoading(false);
    }, 1500);
  };

  const handleFundLoan = (loan) => {
    // TODO: Integrate with smart contract for funding
    alert(`Funding loan for ${loan.businessName}`);
  };

  return (
    <Router>
      <Navbar walletConnected={walletConnected} onConnect={handleConnectWallet} />
      <Routes>
        <Route path="/" element={<LandingPage onConnect={handleConnectWallet} walletConnected={walletConnected} />} />
        <Route path="/business" element={<BusinessDashboard walletAddress={null} onApplyLoan={handleApplyLoan} creditScore={creditScore} loanOptions={loanOptions} myLoans={myLoans} loading={loading} />} />
        <Route path="/investor" element={<InvestorDashboard loans={marketLoans} onFund={handleFundLoan} loading={loading} />} />
      </Routes>
    </Router>
  );
};

export default AppRouter;
