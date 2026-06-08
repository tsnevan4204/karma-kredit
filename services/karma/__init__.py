"""YieldKarma on-chain karma scoring (C9).

Computes a 0-100 karma score from LoanMarket events.
Includes sybil resistance via Circle userId binding + new-wallet probation.

Public API:
    compute_karma(address, web3, contract) -> dict
    IdentityStore                            -> Circle userId <-> wallet binding
    KARMA_TO_INTEREST_BPS(karma)             -> suggested interest rate
"""
from .scorer    import compute_karma, KARMA_TO_INTEREST_BPS, NEW_WALLET_LOAN_CAP_USDC
from .identity  import IdentityStore

__all__ = [
    "compute_karma",
    "KARMA_TO_INTEREST_BPS",
    "NEW_WALLET_LOAN_CAP_USDC",
    "IdentityStore",
]
