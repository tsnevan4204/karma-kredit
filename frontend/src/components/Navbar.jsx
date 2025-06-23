import React from 'react';
import '../styles/Navbar.css';

const Navbar = ({ walletConnected, onConnect }) => (
  <nav className="navbar">
    <div className="navbar-logo">OnChain FICO</div>
    <div className="navbar-links">
      <a href="/">Home</a>
      <a href="/business">Business</a>
      <a href="/investor">Investor</a>
    </div>
    <button className="wallet-btn" onClick={onConnect}>
      {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
    </button>
  </nav>
);

export default Navbar;
