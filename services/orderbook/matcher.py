"""Bid/ask matching engine.

Rules (architecture doc §4.2):
  1. bid.max_rate_bps    >= ask.interest_bps
  2. bid.min_karma       <= borrower.karma
  3. bid.categories      == [] OR ask.category in bid.categories
  4. fill_size           = min(ask.remaining, bid.remaining_exposure)

The matcher is pure: it never mutates the bid store. Callers decrement
exposure after an investor actually signs and broadcasts the fundLoan tx.
"""

import uuid
from typing import List
from .models import InvestorBid, LoanAsk, Match

# LoanMarket enforces this on-chain. We don't waste matcher time on
# fills smaller than the contract will accept.
MIN_CONTRIBUTION_USDC_6DEC = 2_000_000     # $2 USDC (matches LoanMarket.MIN_CONTRIBUTION)


def bid_matches_ask(bid: InvestorBid, ask: LoanAsk) -> bool:
    if bid.status != "open":            return False
    if bid.remaining_exposure <= 0:     return False
    if ask.fully_funded:                return False
    if bid.max_rate_bps < ask.interest_bps:   return False
    if bid.min_karma > ask.karma:             return False
    if bid.categories and ask.category not in bid.categories:
        return False
    return True


def fill_size(bid: InvestorBid, ask: LoanAsk) -> int:
    return min(ask.remaining, bid.remaining_exposure)


def match_bids_to_asks(bids: List[InvestorBid], asks: List[LoanAsk]) -> List[Match]:
    """Greedy matcher — oldest bids fill first; multiple bids may stack on one ask.

    Returns proposed Matches. Does NOT mutate inputs. Callers persist the
    fills (via `OrderbookStore.decrement_exposure`) when investors execute.
    """
    # Work on local copies so we can simulate fills without touching the store.
    remaining_bids = [
        InvestorBid(
            id=b.id, investor=b.investor, max_rate_bps=b.max_rate_bps,
            min_karma=b.min_karma, max_exposure=b.max_exposure,
            remaining_exposure=b.remaining_exposure,
            categories=list(b.categories), created_at=b.created_at, status=b.status,
        ) for b in bids
    ]
    remaining_asks = {a.loan_id: LoanAsk(**a.__dict__) for a in asks}

    matches: List[Match] = []

    # Sort bids by created_at ASC (FIFO fairness).
    remaining_bids.sort(key=lambda b: b.created_at)

    for bid in remaining_bids:
        if bid.remaining_exposure <= 0:
            continue

        for ask in remaining_asks.values():
            if not bid_matches_ask(bid, ask):
                continue

            size = fill_size(bid, ask)
            if size < MIN_CONTRIBUTION_USDC_6DEC:
                continue

            matches.append(Match(
                match_id  = str(uuid.uuid4()),
                bid_id    = bid.id,
                loan_id   = ask.loan_id,
                investor  = bid.investor,
                amount    = size,
                rate_bps  = ask.interest_bps,
                category  = ask.category,
                karma     = ask.karma,
            ))

            # Simulate the fill on local copies
            bid.remaining_exposure -= size
            ask.funded             += size
            ask.remaining          -= size

            if bid.remaining_exposure <= 0:
                break   # this bid is now fully spent

    return matches
