import React from 'react';
import '../styles/Navbar.css';
import { useWeb3 } from '../context/Web3Context';
import { Link } from 'react-router-dom';

const Navbar = ({ walletConnected, onConnect }) => {
  const { role, disconnectWallet } = useWeb3();
  const handleWalletClick = () => {
    if (walletConnected) {
      disconnectWallet();
    } else {
      onConnect();
    }
  };
  return (
    <nav className="navbar">
      <div className="navbar-logo">OnChain FICO</div>
      <div className="navbar-links">
        <Link to="/">Home</Link>
        {role && <Link to="/directory">Directory</Link>}
        {role && <Link to="/dashboard">My Dashboard</Link>}
      </div>
      <button className="wallet-btn" onClick={handleWalletClick}>
        {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
      </button>
    </nav>
  );
};

export default Navbar;
