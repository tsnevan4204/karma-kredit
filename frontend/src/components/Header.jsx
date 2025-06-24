import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { Wallet, Menu, X, Building2, TrendingUp } from 'lucide-react';
import { useState } from 'react';

const Header = () => {
  const { account, userRole, connectWallet, disconnectWallet, isConnecting } = useWallet();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getNavigation = () => {
    const baseNav = [
      { name: 'Home', href: '/' },
      { name: 'Marketplace', href: '/marketplace' },
      { name: 'Stake', href: '/stake' },
    ];

    if (userRole === 'business') {
      return [
        ...baseNav,
        { name: 'Borrower Dashboard', href: '/borrower' },
        { name: 'Wallet', href: '/wallet' },
      ];
    } else if (userRole === 'investor') {
      return [
        ...baseNav,
        { name: 'Investor Dashboard', href: '/investor' },
        { name: 'Wallet', href: '/wallet' },
      ];
    } else {
      return [
        ...baseNav,
        { name: 'Dashboard', href: '/borrower' },
        { name: 'Wallet', href: '/wallet' },
      ];
    }
  };

  const navigation = getNavigation();

  const isActive = (path) => location.pathname === path;

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRoleIcon = () => {
    if (userRole === 'business') {
      return <Building2 className="w-4 h-4 text-primary-600" />;
    } else if (userRole === 'investor') {
      return <TrendingUp className="w-4 h-4 text-karma-600" />;
    }
    return null;
  };

  const getRoleBadge = () => {
    if (userRole === 'business') {
      return (
        <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
          Business
        </span>
      );
    } else if (userRole === 'investor') {
      return (
        <span className="px-2 py-1 bg-karma-100 text-karma-700 text-xs font-medium rounded-full">
          Investor
        </span>
      );
    }
    return null;
  };

  return (
    <header className="bg-white shadow-soft border-b border-neutral-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-karma-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">YK</span>
            </div>
            <span className="text-xl font-bold text-neutral-900">YieldKarma</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            {account ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex items-center space-x-2 px-3 py-2 bg-neutral-100 rounded-lg">
                  {getRoleIcon()}
                  <Wallet className="w-4 h-4 text-neutral-600" />
                  <span className="text-sm font-medium text-neutral-700">
                    {formatAddress(account)}
                  </span>
                  {getRoleBadge()}
                </div>
                <button
                  onClick={disconnectWallet}
                  className="btn-secondary text-sm"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="btn-primary text-sm"
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-neutral-100">
            <nav className="flex flex-col space-y-2">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
            
            {/* Mobile Role Badge */}
            {account && userRole && (
              <div className="mt-4 px-3 py-2 bg-neutral-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  {getRoleIcon()}
                  <span className="text-sm text-neutral-600">Role:</span>
                  {getRoleBadge()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header; 