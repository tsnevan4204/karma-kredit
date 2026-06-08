"""Unified funding-source matcher.

For a given open loan, returns the three ways it could be funded:
  - Pool matches  (LendingPool pools whose category/karma criteria match)
  - Bid matches   (open orderbook bids that satisfy the loan)
  - Direct        (lenders who have already contributed)

Plus an `auto_fund_from_pool` operation that has the allocator wallet call
LendingPool.allocateToLoan(...) to actually push capital into the loan.
"""

from .sources     import find_funding_sources, PoolMatch, BidMatch, FundingSources
from .auto_funder import auto_fund_from_pools

__all__ = [
    "find_funding_sources",
    "auto_fund_from_pools",
    "PoolMatch", "BidMatch", "FundingSources",
]
