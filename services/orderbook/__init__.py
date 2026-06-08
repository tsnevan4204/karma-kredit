"""YieldKarma off-chain RFQ orderbook (C8).

Investors post bids (intent: "I'll lend up to $X at ≤Y% in categories Z");
borrowers' on-chain LoanRequested events become asks. The matcher finds
compatible bid/ask pairs and returns tx payloads the investor's wallet signs
to call LoanMarket.fundLoan(loanId, amount).

Nothing is on-chain except settlement. Bids live in SQLite (services/orderbook/orderbook.db).
"""

from .models   import InvestorBid, LoanAsk, Match
from .store    import OrderbookStore
from .matcher  import match_bids_to_asks

__all__ = ["InvestorBid", "LoanAsk", "Match", "OrderbookStore", "match_bids_to_asks"]
