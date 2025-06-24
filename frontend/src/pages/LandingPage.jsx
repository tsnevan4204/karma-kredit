import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { ArrowRight, TrendingUp, Heart, Shield, Users } from 'lucide-react';

const LandingPage = () => {
  const { account, connectWallet } = useWallet();

  const features = [
    {
      icon: TrendingUp,
      title: 'Earn Yield',
      description: 'Passively invest in small businesses and earn competitive returns while doing good.',
    },
    {
      icon: Heart,
      title: 'Stack Karma',
      description: 'Build your on-chain reputation through responsible lending and borrowing behavior.',
    },
    {
      icon: Shield,
      title: 'Smart Risk',
      description: 'AI-powered karma scoring ensures responsible lending with transparent risk assessment.',
    },
    {
      icon: Users,
      title: 'Community',
      description: 'Join a community of investors and borrowers building the future of decentralized finance.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary-50 via-white to-karma-50 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-neutral-900 mb-6">
              Do good.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-karma-600">
                Earn yield.
              </span>{' '}
              <br />
              Stack Karma.
            </h1>
            <p className="text-xl text-neutral-600 mb-8 max-w-3xl mx-auto">
              The first DeFi platform that rewards you for doing good. Invest in small businesses, 
              build your on-chain reputation, and earn competitive yields while making a positive impact.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {account ? (
                <>
                  <Link to="/marketplace" className="btn-primary text-lg px-8 py-4">
                    Start Yield Karming
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                  <Link to="/borrower" className="btn-secondary text-lg px-8 py-4">
                    Request a Loan
                  </Link>
                </>
              ) : (
                <>
                  <button onClick={connectWallet} className="btn-primary text-lg px-8 py-4">
                    Connect Wallet to Start
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </button>
                  <Link to="/marketplace" className="btn-secondary text-lg px-8 py-4">
                    Browse Loans
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              How YieldKarma Works
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Our platform combines traditional lending with blockchain technology and AI-powered karma scoring.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card text-center">
                <div className="w-12 h-12 bg-gradient-to-r from-primary-500 to-karma-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-neutral-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Karma & Pool Explanation */}
      <section className="py-20 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-6">
                Your Karma
              </h2>
              <p className="text-lg text-neutral-600 mb-6">
                Karma is your on-chain reputation, calculated using AI that analyzes your wallet's 
                transaction history, age, and behavior patterns. Higher Karma means better loan terms 
                and access to exclusive investment opportunities.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center text-neutral-700">
                  <div className="w-2 h-2 bg-primary-500 rounded-full mr-3"></div>
                  Wallet age and activity patterns
                </li>
                <li className="flex items-center text-neutral-700">
                  <div className="w-2 h-2 bg-primary-500 rounded-full mr-3"></div>
                  Transaction volume and frequency
                </li>
                <li className="flex items-center text-neutral-700">
                  <div className="w-2 h-2 bg-primary-500 rounded-full mr-3"></div>
                  Repayment history and reliability
                </li>
                <li className="flex items-center text-neutral-700">
                  <div className="w-2 h-2 bg-primary-500 rounded-full mr-3"></div>
                  Community participation and reputation
                </li>
              </ul>
            </div>
            
            <div className="card">
              <h3 className="text-2xl font-bold text-neutral-900 mb-4">
                Investment Pools
              </h3>
              <p className="text-neutral-600 mb-6">
                Invest in curated pools that focus on specific sectors or causes, 
                similar to ETFs but for small business lending.
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-primary-50 rounded-xl">
                  <div>
                    <h4 className="font-semibold text-neutral-900">AgriPool</h4>
                    <p className="text-sm text-neutral-600">Sustainable agriculture</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary-600">8.5% APY</div>
                    <div className="text-sm text-neutral-500">Low risk</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-karma-50 rounded-xl">
                  <div>
                    <h4 className="font-semibold text-neutral-900">WomenFoundersPool</h4>
                    <p className="text-sm text-neutral-600">Women-led businesses</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-karma-600">12.2% APY</div>
                    <div className="text-sm text-neutral-500">Medium risk</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-neutral-100 rounded-xl">
                  <div>
                    <h4 className="font-semibold text-neutral-900">KarmaMax</h4>
                    <p className="text-sm text-neutral-600">High-Karma borrowers</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-neutral-700">15.8% APY</div>
                    <div className="text-sm text-neutral-500">High reward</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-karma-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Start Your YieldKarma Journey?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who are already earning yield while building a better financial future.
          </p>
          {account ? (
            <Link to="/marketplace" className="bg-white text-primary-600 hover:bg-neutral-50 font-semibold py-4 px-8 rounded-xl transition-colors inline-flex items-center">
              Explore Marketplace
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          ) : (
            <button onClick={connectWallet} className="bg-white text-primary-600 hover:bg-neutral-50 font-semibold py-4 px-8 rounded-xl transition-colors inline-flex items-center">
              Connect Wallet
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

export default LandingPage; 