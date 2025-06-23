import React from 'react';
import '../styles/LandingPage.css';

const LandingPage = ({ onConnect, walletConnected }) => (
  <div className="landing-container">
    <h1>Welcome to OnChain FICO</h1>
    <p className="subtitle">A decentralized loan exchange for small businesses and investors.</p>
    <button className="connect-btn" onClick={onConnect}>
      {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
    </button>
  </div>
);

export default LandingPage;
