import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import RoleSelectionModal from './components/RoleSelectionModal';
import LandingPage from './pages/LandingPage';
import LoanMarketplace from './pages/LoanMarketplace';
import BorrowerDashboard from './pages/BorrowerDashboard';
import InvestorDashboard from './pages/InvestorDashboard';
import StakePool from './pages/StakePool';
import OrderbookPage from './pages/OrderbookPage';
import BorrowerProfile from './pages/BorrowerProfile';
import WalletKarma from './pages/WalletKarma';
import { WalletProvider } from './contexts/WalletContext';

function App() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <div className="min-h-screen bg-neutral-50">
            <Header />
            <main>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/marketplace" element={<LoanMarketplace />} />
                  <Route path="/borrower" element={<BorrowerDashboard />} />
                  <Route path="/investor" element={<InvestorDashboard />} />
                  <Route path="/stake" element={<StakePool />} />
                  <Route path="/orderbook" element={<OrderbookPage />} />
                  <Route path="/profile/:address" element={<BorrowerProfile />} />
                  <Route path="/wallet" element={<WalletKarma />} />
                </Routes>
              </ErrorBoundary>
            </main>
            <RoleSelectionModal />
          </div>
        </Router>
      </WalletProvider>
    </ErrorBoundary>
  );
}

export default App;
