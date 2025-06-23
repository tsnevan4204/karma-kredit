import React from 'react';
import '../styles/RoleModal.css';

const RoleModal = ({ open, onSelect, onClose }) => {
  if (!open) return null;
  return (
    <div className="role-modal-overlay" onClick={onClose}>
      <div className="role-modal-content" onClick={e => e.stopPropagation()}>
        <h2>Select Your Role</h2>
        <div className="role-btn-group">
          <button className="role-btn business" onClick={() => onSelect('business')}>
            🟢 I'm a Business
          </button>
          <button className="role-btn investor" onClick={() => onSelect('investor')}>
            🔵 I'm an Investor
          </button>
        </div>
        <button className="role-modal-close" onClick={onClose}>&times;</button>
      </div>
    </div>
  );
};

export default RoleModal;
