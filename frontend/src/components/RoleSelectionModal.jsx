import { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { 
  Building2, 
  TrendingUp, 
  X, 
  AlertCircle,
  CheckCircle
} from 'lucide-react';

const RoleSelectionModal = () => {
  const { 
    showRoleModal, 
    setShowRoleModal, 
    registerUserRole, 
    isRegistering,
    account 
  } = useWallet();
  
  const [selectedRole, setSelectedRole] = useState(null);
  const [error, setError] = useState(null);

  const roles = [
    {
      id: 'business',
      title: 'Business / Borrower',
      description: 'I want to request loans for my business',
      icon: Building2,
      color: 'primary',
      features: [
        'Request loans for business expansion',
        'Build your Karma',
        'Access to competitive interest rates',
        'Flexible repayment terms'
      ]
    },
    {
      id: 'investor',
      title: 'Investor / Lender',
      description: 'I want to invest in businesses and earn yield',
      icon: TrendingUp,
      color: 'karma',
      features: [
        'Invest in curated business loans',
        'Earn competitive yields',
        'Support small businesses',
        'Diversify your portfolio'
      ]
    }
  ];

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError(null);
  };

  const handleRegister = async () => {
    if (!selectedRole) {
      setError('Please select a role');
      return;
    }

    try {
      await registerUserRole(selectedRole);
    } catch (err) {
      setError(err.message || 'Failed to register role. Please try again.');
    }
  };

  const getColorClasses = (color) => {
    switch (color) {
      case 'primary': return 'border-primary-200 bg-primary-50 hover:bg-primary-100';
      case 'karma': return 'border-karma-200 bg-karma-50 hover:bg-karma-100';
      default: return 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100';
    }
  };

  const getIconColor = (color) => {
    switch (color) {
      case 'primary': return 'text-primary-600';
      case 'karma': return 'text-karma-600';
      default: return 'text-neutral-600';
    }
  };

  if (!showRoleModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              Choose Your Role
            </h2>
            <p className="text-neutral-600 mt-1">
              Select how you want to use YieldKarma
            </p>
          </div>
          <button
            onClick={() => setShowRoleModal(false)}
            className="text-neutral-400 hover:text-neutral-600 p-2 rounded-lg hover:bg-neutral-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Wallet Info */}
        <div className="mb-6 p-4 bg-neutral-50 rounded-xl">
          <p className="text-sm text-neutral-600 mb-1">Connected Wallet</p>
          <p className="font-mono text-neutral-900 break-all">
            {account}
          </p>
        </div>

        {/* Role Selection */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => handleRoleSelect(role.id)}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                selectedRole === role.id 
                  ? getColorClasses(role.color) + ' ring-2 ring-offset-2 ring-primary-500'
                  : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getColorClasses(role.color)}`}>
                  <role.icon className={`w-5 h-5 ${getIconColor(role.color)}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-neutral-900 mb-1">
                    {role.title}
                  </h3>
                  <p className="text-sm text-neutral-600 mb-3">
                    {role.description}
                  </p>
                  <ul className="space-y-1">
                    {role.features.map((feature, index) => (
                      <li key={index} className="flex items-center space-x-2 text-sm text-neutral-700">
                        <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {/* Important Note */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800 mb-1">
                Important
              </p>
              <p className="text-sm text-yellow-700">
                Your role choice will be recorded on the blockchain and cannot be changed later. 
                Choose carefully based on how you plan to use YieldKarma.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={() => setShowRoleModal(false)}
            className="flex-1 btn-secondary"
            disabled={isRegistering}
          >
            Cancel
          </button>
          <button
            onClick={handleRegister}
            disabled={!selectedRole || isRegistering}
            className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRegistering ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Registering...
              </>
            ) : (
              `Register as ${selectedRole === 'business' ? 'Business' : selectedRole === 'investor' ? 'Investor' : 'User'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleSelectionModal; 