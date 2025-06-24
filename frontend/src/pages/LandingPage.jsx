import React, { useState } from 'react';
import '../styles/LandingPage.css';
import { useWeb3 } from '../context/Web3Context';
import RoleModal from '../components/RoleModal';

const LandingPage = () => {
  const { account, connectWallet, role, setRole } = useWeb3();
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  const handleConnectClick = async () => {
    if (role) {
      await connectWallet();
    } else {
      setRoleModalOpen(true);
    }
  };

  const handleRoleSelect = async (selectedRole) => {
    setRole(selectedRole);
    setRoleModalOpen(false);
    await connectWallet();
  };

  return (
    <div className="landing-container">
      <h1>Welcome to OnChain FICO</h1>
      <p className="subtitle">A decentralized loan exchange for small businesses and investors.</p>

      <button className="connect-btn" onClick={handleConnectClick}>
        {account ? 'Wallet Connected' : 'Connect Wallet'}
      </button>

      {account && (
        <p className="wallet-address">
          Connected wallet: <code>{account}</code>
        </p>
      )}

      <RoleModal open={roleModalOpen && !role} onSelect={handleRoleSelect} onClose={() => setRoleModalOpen(false)} />
    </div>
  );
};

export default LandingPage;