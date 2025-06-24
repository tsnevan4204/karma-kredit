import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Header from './components/Header';
import RoleSelectionModal from './components/RoleSelectionModal';
import LandingPage from './pages/LandingPage';
import LoanMarketplace from './pages/LoanMarketplace';
import BorrowerDashboard from './pages/BorrowerDashboard';
import InvestorDashboard from './pages/InvestorDashboard';
import StakePool from './pages/StakePool';
import WalletKarma from './pages/WalletKarma';
import { WalletProvider } from './contexts/WalletContext';

function App() {
  return (
    <WalletProvider>
      <Router>
        <div className="min-h-screen bg-neutral-50">
          <Header />
          <main>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/marketplace" element={<LoanMarketplace />} />
              <Route path="/borrower" element={<BorrowerDashboard />} />
              <Route path="/investor" element={<InvestorDashboard />} />
              <Route path="/stake" element={<StakePool />} />
              <Route path="/wallet" element={<WalletKarma />} />
            </Routes>
          </main>
          <RoleSelectionModal />
        </div>
      </Router>
    </WalletProvider>
  );
}

export default App;
