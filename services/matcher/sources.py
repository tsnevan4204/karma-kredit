"""Find all the ways an open loan could get funded."""

from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import List, Optional


@dataclass
class PoolMatch:
    pool_id:      int
    name:         str          # "AgriPool"
    category:     str          # "agriculture"
    min_karma:    int
    idle:         int          # USDC 6-dec sitting in pool
    eligible:     bool         # passes category + karma checks
    can_cover:    int          # min(idle, loan.remaining)
    reason:       str          # explanation if not eligible

    def to_dict(self): return asdict(self)


@dataclass
class BidMatch:
    bid_id:       str
    investor:     str
    rate_bps:     int
    amount:       int          # USDC 6-dec fill the matcher proposes

    def to_dict(self): return asdict(self)


@dataclass
class FundingSources:
    loan_id:        int
    remaining:      int                # USDC 6-dec still needing funding
    pools:          List[PoolMatch]
    bids:           List[BidMatch]
    direct_lenders: List[dict]         # [{address, amount}]

    def to_dict(self):
        return {
            "loan_id":        self.loan_id,
            "remaining":      self.remaining,
            "pools":          [p.to_dict() for p in self.pools],
            "bids":           [b.to_dict() for b in self.bids],
            "direct_lenders": self.direct_lenders,
        }


def _category_from_metadata(uri: Optional[str]) -> str:
    """Best-effort category extraction — same heuristic as the orderbook UI."""
    if not uri: return "general"
    lower = uri.lower()
    for k in ("agriculture", "diversity", "premium", "technology", "education",
              "healthcare", "retail", "energy", "food", "general"):
        if k in lower: return k
    return "general"


def find_funding_sources(
    *,
    loan: dict,                # output of LoanMarket.getLoan(loanId) + loan_id
    borrower_karma: int,
    pools_state: list,         # list of {id, name, category, minKarma, idle, active}
    open_bids: list,           # InvestorBid objects from OrderbookStore
    contract_lenders: list,    # [(address, amount)] of existing contributions
    matcher_fn,                # services.orderbook.match_bids_to_asks
    LoanAsk,                   # the dataclass (passed in to avoid circular imports)
) -> FundingSources:
    """Pure scoring — no chain calls. Caller fetches state then asks us."""

    remaining = int(loan["principal"]) - int(loan["funded_amount"])
    loan_category = _category_from_metadata(loan.get("metadata_uri"))

    # ── Pool eligibility ────────────────────────────────────────────────────
    pool_matches: List[PoolMatch] = []
    for p in pools_state:
        eligible = True
        reason   = "match"
        if not p.get("active", True):
            eligible, reason = False, "pool inactive"
        elif borrower_karma < int(p["minKarma"]):
            eligible, reason = False, f"karma {borrower_karma} < min {p['minKarma']}"
        elif p["category"] and loan_category != p["category"] and loan_category != "general":
            eligible, reason = False, f"category mismatch ({loan_category} vs {p['category']})"
        elif int(p["idle"]) < min(remaining, 2_000_000):
            eligible, reason = False, "insufficient idle USDC in pool"

        pool_matches.append(PoolMatch(
            pool_id    = int(p["id"]),
            name       = p["name"],
            category   = p["category"],
            min_karma  = int(p["minKarma"]),
            idle       = int(p["idle"]),
            eligible   = eligible,
            can_cover  = min(int(p["idle"]), remaining) if eligible else 0,
            reason     = reason,
        ))

    # ── Bid matching (reuse orderbook matcher) ──────────────────────────────
    ask = LoanAsk(
        loan_id         = int(loan["loan_id"]),
        borrower        = loan["borrower"].lower(),
        principal       = int(loan["principal"]),
        funded          = int(loan["funded_amount"]),
        remaining       = remaining,
        interest_bps    = int(loan["interest_bps"]),
        duration_months = int(loan["duration_months"]),
        category        = loan_category,
        karma           = borrower_karma,
    )
    raw_matches = matcher_fn(open_bids, [ask])
    bid_matches = [
        BidMatch(
            bid_id   = m.bid_id,
            investor = m.investor,
            rate_bps = m.rate_bps,
            amount   = m.amount,
        ) for m in raw_matches
    ]

    return FundingSources(
        loan_id        = int(loan["loan_id"]),
        remaining      = remaining,
        pools          = pool_matches,
        bids           = bid_matches,
        direct_lenders = [{"address": a, "amount": amt} for a, amt in contract_lenders],
    )
