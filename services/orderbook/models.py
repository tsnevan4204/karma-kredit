"""Data classes for the off-chain orderbook.

Money values are stored as **6-decimal USDC integers** (matches on-chain),
NOT floats. Interest rates are in **basis points** (10000 = 100%).
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional
import time
import uuid


@dataclass
class InvestorBid:
    """An investor's standing intent. Persisted in SQLite."""
    investor:            str                # 0x... checksum-cased EVM address
    max_rate_bps:        int                # e.g. 1500 = 15% APR ceiling
    min_karma:           int                # 0-100; require borrower karma >=
    max_exposure:        int                # USDC 6-dec; total cap across all fills
    remaining_exposure:  int                # decreases as the bid gets filled
    categories:          List[str]          # ["agriculture", "diversity"]; empty = any
    id:                  str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at:          int = field(default_factory=lambda: int(time.time()))
    status:              str = "open"       # "open" | "filled" | "cancelled"

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "InvestorBid":
        return InvestorBid(**d)


@dataclass
class LoanAsk:
    """A view onto an on-chain loan that still needs funding.
    Built from LoanMarket events (or a chain reader) + borrower metadata."""
    loan_id:             int
    borrower:            str
    principal:           int                # USDC 6-dec
    funded:              int                # already funded so far
    remaining:           int                # principal - funded
    interest_bps:        int
    duration_months:     int
    category:            str                # off-chain; from metadata URI
    karma:               int                # 0-100; from scoring API

    @property
    def fully_funded(self) -> bool:
        return self.remaining <= 0


@dataclass
class Match:
    """A proposed match between one bid and one ask.

    The frontend hands the `tx_payload` to the investor's wallet:
        contract.fundLoan(loanId, amount)
    """
    match_id:  str
    bid_id:    str
    loan_id:   int
    investor:  str
    amount:    int                          # USDC 6-dec fill size
    rate_bps:  int
    category:  str
    karma:     int

    def to_dict(self) -> dict:
        return asdict(self)

    def tx_payload(self, loan_market_address: str) -> dict:
        return {
            "to":     loan_market_address,
            "method": "fundLoan",
            "args":   [self.loan_id, self.amount],
        }
