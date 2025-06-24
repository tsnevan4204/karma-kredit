import { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { Search, Filter, TrendingUp, Clock, DollarSign, RefreshCw, X, Plus } from 'lucide-react';

const LoanMarketplace = () => {
  const { account, getFicoScore, getAllLoans, investInLoan, userRole } = useWallet();
  const [loans, setLoans] = useState([]);
  const [filteredLoans, setFilteredLoans] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInvestModal, setShowInvestModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [isInvesting, setIsInvesting] = useState(false);

  // Load loans from smart contract
  const loadLoans = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      console.log('📊 Loading all loans from marketplace...');
      
      // TEMPORARY: Hardcoded loans matching the uploaded images
      const hardcodedLoans = [
                          {
           id: '1',
           borrower: {
             name: '0x1234...7890',
             karma: 78,
             address: '0x1234567890123456789012345678901234567890'
           },
           amount: 850,
           interest: 8.5,
           duration: 18,
           funded: 0,
           category: 'crafts',
           description: 'Traditional pottery workshop seeking funds to expand ceramic production capabilities and purchase new equipment. We create handmade pottery for local markets and tourist shops.',
           supportingImage: 'https://deneenpottery.com/wp-content/uploads/2017/11/Throw.jpg',
           status: 'active',
           dueDate: null
         },
         {
           id: '2',
           borrower: {
             name: '0x2345...8901',
             karma: 85,
             address: '0x2345678901234567890123456789012345678901'
           },
           amount: 1200,
           interest: 7.2,
           duration: 24,
           funded: 35,
           category: 'agriculture',
           description: 'Family-owned livestock farm specializing in dairy buffalo and cattle. Looking to expand herd size and improve feeding infrastructure for increased milk production.',
           supportingImage: 'https://cc.gfamedia.org/special-report/farm-animals/woman-two-cows.jpg',
           status: 'active',
           dueDate: null
         },
         {
           id: '3',
           borrower: {
             name: '0x3456...9012',
             karma: 72,
             address: '0x3456789012345678901234567890123456789012'
           },
           amount: 650,
           interest: 9.5,
           duration: 12,
           funded: 60,
           category: 'technology',
           description: 'Electronics repair shop specializing in TV, radio, and appliance repairs. Need funds to purchase diagnostic equipment and expand workshop space for growing customer base.',
           supportingImage: 'https://thumbs.dreamstime.com/b/mexican-electronics-repair-shop-5132178.jpg',
           status: 'active',
           dueDate: null
         },
         {
           id: '4',
           borrower: {
             name: '0x4567...0123',
             karma: 68,
             address: '0x4567890123456789012345678901234567890123'
           },
           amount: 950,
           interest: 8.8,
           duration: 15,
           funded: 0,
           category: 'retail',
           description: 'Local convenience store and market serving the community with daily essentials. Seeking capital to expand inventory, improve refrigeration, and add new product lines.',
           supportingImage: 'https://www.shutterstock.com/image-photo/indoor-photo-happy-mexican-40-260nw-2503464685.jpg',
           status: 'active',
           dueDate: null
         },
         {
           id: '5',
           borrower: {
             name: '0x5678...1234',
             karma: 81,
             address: '0x5678901234567890123456789012345678901234'
           },
           amount: 1450,
           interest: 7.8,
           duration: 20,
           funded: 100,
           category: 'crafts',
           description: 'Established pottery studio creating decorative and functional ceramics. Expanding to include pottery classes and community workshops. Investment will fund kiln upgrades and workspace expansion.',
           supportingImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
           status: 'active',
           dueDate: null
         },
         {
           id: '6',
           borrower: {
             name: '0x6789...2345',
             karma: 76,
             address: '0x6789012345678901234567890123456789012345'
           },
           amount: 780,
           interest: 9.2,
           duration: 14,
           funded: 20,
           category: 'technology',
           description: 'Electronic repair and refurbishment shop specializing in vintage equipment restoration. Need funding for specialized tools and parts inventory to serve collectors and enthusiasts.',
           supportingImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
           status: 'active',
           dueDate: null
         }
      ];
      
      // Try to load actual contract loans first, then fallback to hardcoded
      let contractLoans = [];
      try {
        contractLoans = await getAllLoans();
      } catch (error) {
        console.log('📝 Using hardcoded loans since contract unavailable');
      }
      
      // Transform contract data to match marketplace UI expectations
      const formattedContractLoans = await Promise.all(contractLoans.map(async loan => {
        // Get actual FICO score for the borrower
        let ficoScore = 650; // Default
        try {
          console.log(`🔍 Fetching FICO score for borrower: ${loan.borrower}`);
          const response = await fetch('http://localhost:5000/api/fico-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              wallet_address: loan.borrower,
              chain: 'sepolia'
            })
          });
          
          if (!response.ok) {
            console.error(`❌ FICO API response not ok: ${response.status}`);
            const errorText = await response.text();
            console.error('Error response:', errorText);
          } else {
            const data = await response.json();
            console.log(`📊 FICO API response for ${loan.borrower}:`, data);
            ficoScore = data.fico_score || 650;
            console.log(`✅ Using FICO score: ${ficoScore}`);
          }
        } catch (error) {
          console.error('❌ Error fetching FICO for', loan.borrower, ':', error);
        }

        return {
          id: loan.id,
          borrower: {
            name: `${loan.borrower.slice(0, 6)}...${loan.borrower.slice(-4)}`,
            karma: Math.round(ficoScore),
            address: loan.borrower
          },
          amount: parseFloat(loan.amount),
          interest: parseFloat(loan.interest),
          duration: loan.duration || 12,
          funded: loan.funded ? 100 : 0,
          category: loan.category,
          description: loan.description,
          supportingImage: loan.supportingImage,
          status: loan.status,
          dueDate: loan.dueDate
        };
      }));
      
      // Combine hardcoded and contract loans
      const allLoans = [...hardcodedLoans, ...formattedContractLoans];
      
      console.log(`✅ Loaded ${allLoans.length} loans for marketplace (${hardcodedLoans.length} hardcoded + ${formattedContractLoans.length} from contract)`);
      
      setLoans(allLoans);
      setFilteredLoans(allLoans);
    } catch (error) {
      console.error('❌ Failed to load loans:', error);
      setLoans([]);
      setFilteredLoans([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshLoans = () => {
    loadLoans(true);
  };

  const handleInvestClick = (loan) => {
    if (!account) {
      alert('Please connect your wallet to invest');
      return;
    }
    
    if (userRole !== 'investor') {
      alert('Only investors can fund loans. Please register as an investor.');
      return;
    }

    setSelectedLoan(loan);
    setInvestmentAmount('');
    setShowInvestModal(true);
  };

  const handleInvestSubmit = async (e) => {
    e.preventDefault();
    
    if (!investmentAmount || parseFloat(investmentAmount) <= 0) {
      alert('Please enter a valid investment amount');
      return;
    }

    const amount = parseFloat(investmentAmount);
    const remainingAmount = selectedLoan.amount - (selectedLoan.amount * selectedLoan.funded / 100);
    
    if (amount > remainingAmount) {
      alert(`Investment amount cannot exceed the remaining loan amount of ${remainingAmount.toFixed(2)} PyUSD`);
      return;
    }

    setIsInvesting(true);
    
    try {
      await investInLoan(selectedLoan.id, investmentAmount);
      
      alert('🎉 Investment successful! The loan has been funded.');
      
      // Close modal and refresh loans
      setShowInvestModal(false);
      setSelectedLoan(null);
      setInvestmentAmount('');
      
      // Refresh the loans to show updated funding status
      await loadLoans(true);
      
    } catch (error) {
      console.error('❌ Investment failed:', error);
      
      if (error.message.includes('user rejected')) {
        alert('Transaction was cancelled.');
      } else if (error.message.includes('insufficient funds')) {
        alert('Insufficient funds for this investment plus gas fees.');
      } else {
        alert(`Investment failed: ${error.message}`);
      }
    } finally {
      setIsInvesting(false);
    }
  };

  const closeInvestModal = () => {
    setShowInvestModal(false);
    setSelectedLoan(null);
    setInvestmentAmount('');
  };

  useEffect(() => {
    loadLoans();
  }, []);

  useEffect(() => {
    let filtered = loans;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(loan =>
        loan.borrower.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loan.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loan.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(loan => loan.category === selectedFilter);
    }

    setFilteredLoans(filtered);
  }, [searchTerm, selectedFilter, loans]);

  const getKarmaColor = (karma) => {
    if (karma >= 80) return 'text-primary-600';
    if (karma >= 60) return 'text-karma-600';
    return 'text-neutral-600';
  };

  const filters = [
    { value: 'all', label: 'All Loans' },
    { value: 'agriculture', label: 'Agriculture' },
    { value: 'technology', label: 'Technology' },
    { value: 'crafts', label: 'Arts & Crafts' },
    { value: 'retail', label: 'Retail' },
    { value: 'education', label: 'Education' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-neutral-600">Loading loans...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">
                Loan Marketplace
              </h1>
              <p className="text-lg text-neutral-600">
                Discover and invest in small businesses that align with your values
              </p>
            </div>
            <button
              onClick={refreshLoans}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search loans by borrower, description, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-neutral-400" />
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="input-field w-auto"
              >
                {filters.map(filter => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-neutral-600">
            Showing {filteredLoans.length} of {loans.length} loans
          </p>
        </div>

        {/* Loan Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLoans.map((loan) => (
            <div key={loan.id} className="card hover:shadow-medium transition-shadow">
              {/* Supporting Image */}
              {loan.supportingImage ? (
                <div className="mb-4">
                  <img
                    src={loan.supportingImage}
                    alt={loan.description}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                </div>
              ) : (
                <div className="mb-4">
                  <div className="w-full h-48 bg-gradient-to-br from-primary-100 to-karma-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-16 h-16 text-primary-300" />
                  </div>
                </div>
              )}

              {/* Borrower Info */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-neutral-900">{loan.borrower.name}</h3>
                  <p className="text-sm text-neutral-600 capitalize">{loan.category}</p>
                </div>
                <div className="text-right">
                  <div className={`karma-gauge`}>
                    {loan.borrower.karma}
                  </div>
                  <span className={`text-xs font-medium ${getKarmaColor(loan.borrower.karma)}`}>
                    Karma
                  </span>
                </div>
              </div>

              {/* Loan Details */}
              <div className="space-y-3 mb-4">
                <p className="text-neutral-600 text-sm line-clamp-2">
                  {loan.description}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <DollarSign className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-600">
                      {loan.amount.toLocaleString()} PyUSD
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm font-medium text-primary-600">
                      {loan.interest}% APY
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-600">
                      {loan.duration} months
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${loan.funded >= 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {loan.funded >= 100 ? 'Funded' : 'Pending'}
                  </span>
                </div>
              </div>

              {/* Funding Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-neutral-600">Funded</span>
                  <span className="font-medium">{loan.funded}%</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-primary-500 to-karma-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${loan.funded}%` }}
                  ></div>
                </div>
              </div>

              {/* Investment Button */}
              {loan.funded < 100 && userRole === 'investor' && (
                <button
                  onClick={() => handleInvestClick(loan)}
                  className="w-full btn-primary"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Invest Now
                </button>
              )}

              {loan.funded >= 100 && (
                <div className="w-full text-center py-2 bg-green-50 text-green-700 rounded-lg font-medium">
                  Fully Funded
                </div>
              )}

              {userRole !== 'investor' && loan.funded < 100 && (
                <div className="w-full text-center py-2 bg-neutral-100 text-neutral-600 rounded-lg text-sm">
                  Investor access required to fund loans
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredLoans.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              No loans found
            </h3>
            <p className="text-neutral-600">
              Try adjusting your search terms or filters
            </p>
          </div>
        )}

        {/* Investment Modal */}
        {showInvestModal && selectedLoan && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">
                  Invest in Loan
                </h3>
                <button
                  onClick={closeInvestModal}
                  className="p-2 text-neutral-400 hover:text-neutral-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <div className="p-4 bg-neutral-50 rounded-lg">
                  <h4 className="font-medium text-neutral-900 mb-2">
                    {selectedLoan.borrower.name}
                  </h4>
                  <p className="text-sm text-neutral-600 mb-2">
                    {selectedLoan.description}
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-600">Loan Amount:</span>
                      <p className="font-medium">{selectedLoan.amount.toLocaleString()} PyUSD</p>
                    </div>
                    <div>
                      <span className="text-neutral-600">Interest Rate:</span>
                      <p className="font-medium">{selectedLoan.interest}% APY</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-neutral-600 text-sm">Remaining to fund:</span>
                    <p className="font-medium">
                      {(selectedLoan.amount - (selectedLoan.amount * selectedLoan.funded / 100)).toFixed(2)} PyUSD
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleInvestSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Investment Amount (PyUSD)
                  </label>
                  <input
                    type="number"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(e.target.value)}
                    placeholder="Enter amount to invest"
                    min="0.01"
                    max={selectedLoan.amount - (selectedLoan.amount * selectedLoan.funded / 100)}
                    step="0.01"
                    className="input-field"
                    required
                    disabled={isInvesting}
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Minimum: 0.01 PyUSD • Maximum: {(selectedLoan.amount - (selectedLoan.amount * selectedLoan.funded / 100)).toFixed(2)} PyUSD
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={closeInvestModal}
                    className="flex-1 btn-secondary"
                    disabled={isInvesting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isInvesting}
                  >
                    {isInvesting ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Investing...
                      </div>
                    ) : (
                      'Confirm Investment'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanMarketplace; 