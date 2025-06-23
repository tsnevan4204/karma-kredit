import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import BusinessDashboard from './pages/BusinessDashboard';
import InvestorDashboard from './pages/InvestorDashboard';
import Directory from './pages/Directory';
import { Web3Provider, useWeb3 } from './context/Web3Context';

const AppRoutes = () => {
  const { account, connectWallet, role } = useWeb3();
  const [creditScore, setCreditScore] = useState(null);
  const [loanOptions, setLoanOptions] = useState([]);
  const [myLoans, setMyLoans] = useState([]);
  const [marketLoans, setMarketLoans] = useState([]);
  const [investments, setInvestments] = useState([]); // investor's funded loans
  const [loading, setLoading] = useState(false);

  const handleApplyLoan = (form) => {
    setLoading(true);
    setTimeout(() => {
      setCreditScore(720);
      setLoanOptions([{ id: 1, businessName: 'My Biz', amount: form.amount, description: form.description, creditScore: 720, image: URL.createObjectURL(form.image) }]);
      setMyLoans(loans => [...loans, { id: Date.now(), businessName: 'My Biz', amount: form.amount, description: form.description, creditScore: 720, image: URL.createObjectURL(form.image) }]);
      setLoading(false);
    }, 1500);
  };

  const handleFundLoan = (loan) => {
    setInvestments(inv => [...inv, loan]);
    alert(`Funding loan for ${loan.businessName}`);
  };

  // Role-based routing
  return (
    <Router>
      <Navbar walletConnected={!!account} onConnect={connectWallet} />
      <Routes>
        <Route path="/" element={<LandingPage onConnect={connectWallet} walletConnected={!!account} />} />
        <Route path="/directory" element={role ? <Directory loans={marketLoans} onFund={handleFundLoan} loading={loading} /> : <Navigate to="/" />} />
        <Route path="/dashboard" element={
          role === 'business' ? <BusinessDashboard walletAddress={account} onApplyLoan={handleApplyLoan} creditScore={creditScore} loanOptions={loanOptions} myLoans={myLoans} loading={loading} /> :
          role === 'investor' ? <InvestorDashboard investments={investments} loading={loading} /> :
          <Navigate to="/" />
        } />
      </Routes>
    </Router>
  );
};

const AppRouter = () => (
  <Web3Provider>
    <AppRoutes />
  </Web3Provider>
);

export default AppRouter;
