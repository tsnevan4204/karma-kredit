"""Karma scoring formula + on-chain event indexer.

Karma is 0-100, starts at 70 (NEW_USER_KARMA) for first-time borrowers.
Brand-new wallets with no Circle userId binding start at 50 (PROBATION_KARMA)
and are capped to a $25 loan size until they successfully repay one loan.

Rules per user request:
  - LATE          = any payment 1+ day past the per-month schedule it should hit
  - DEFAULT       = loan still unpaid 7 days past final dueDate

Karma deltas (capped 0-100):
  per loan request                -1
  per on-time monthly payment     +2
  loan fully repaid (clean)      +10
  loan fully repaid (some lates)  +5
  late payment (1-7 d)            -3
  very late payment (8-30 d)      -8
  default (>7d past dueDate)     -30
  default later cured             +5  (partial recovery)
"""

from __future__ import annotations
import time
from dataclasses import dataclass, field, asdict
from typing import List, Tuple, Optional

# ── Constants ─────────────────────────────────────────────────────────────────

NEW_USER_KARMA           = 70           # default starting karma (has Circle binding)
PROBATION_KARMA          = 50           # fresh wallets with no identity binding
KARMA_FLOOR              = 0
KARMA_CEILING            = 100

NEW_WALLET_LOAN_CAP_USDC = 25_000_000   # $25 USDC (6-dec) until first repay

SECONDS_PER_DAY    = 86_400
SECONDS_PER_MONTH  = 30 * SECONDS_PER_DAY      # matches LoanMarket dueDate math
DEFAULT_GRACE_SEC  = 7 * SECONDS_PER_DAY

# Deltas
D_LOAN_REQUEST           = -1
D_ON_TIME_PAYMENT        = +2
D_FULL_REPAY_CLEAN       = +10
D_FULL_REPAY_WITH_LATES  = +5
D_LATE_PAYMENT_1_7       = -3
D_LATE_PAYMENT_8_30      = -8
D_DEFAULT                = -30
D_DEFAULT_CURED          = +5

# Interest formula: clamp(500, 3500, 3500 - 30 * karma)  bps
INTEREST_BPS_FLOOR = 500     # 5%
INTEREST_BPS_CAP   = 3500    # 35%

def KARMA_TO_INTEREST_BPS(karma: int) -> int:
    """Map karma (0-100) → suggested interest rate in basis points."""
    if karma is None: karma = NEW_USER_KARMA
    karma = max(KARMA_FLOOR, min(KARMA_CEILING, int(karma)))
    raw = INTEREST_BPS_CAP - 30 * karma
    return max(INTEREST_BPS_FLOOR, min(INTEREST_BPS_CAP, raw))


# ── Helpers (pure) ────────────────────────────────────────────────────────────

@dataclass
class _LoanSnapshot:
    """All state needed to score a single loan."""
    loan_id:         int
    principal:       int            # USDC 6-dec
    interest_bps:    int
    duration_months: int
    due_date:        int            # unix seconds (final dueDate)
    start_time:      int            # unix seconds (loan creation, dueDate - durationMonths*30d)
    funded_amount:   int
    total_paid:      int            # cumulative repaid
    monthly_payment: int
    repaid:          bool
    payments:        List[Tuple[int, int]] = field(default_factory=list)
    # list of (block_timestamp, amount_paid_to_this_lender)
    # NOTE: stored as the sum of per-payment-event amounts for THIS loan, not the
    # cumulative loan totalPaid. Each tuple represents one borrower payment tx.


def _classify_payment_lateness(start_time: int, monthly_payment: int,
                                payment_index_1based: int, payment_timestamp: int) -> str:
    """Classify a borrower payment as 'on_time' | 'late_1_7' | 'late_8_30' | 'late_30plus'.

    A 'payment N' is scheduled at start_time + N * 30days.
    If it arrived after that schedule, count the lateness in days.
    """
    scheduled = start_time + payment_index_1based * SECONDS_PER_MONTH
    diff = payment_timestamp - scheduled
    if diff <= SECONDS_PER_DAY:           # within 1-day grace
        return "on_time"
    days_late = diff // SECONDS_PER_DAY
    if days_late <= 7:   return "late_1_7"
    if days_late <= 30:  return "late_8_30"
    return "late_30plus"


def _is_defaulted(loan: _LoanSnapshot, now_ts: int) -> bool:
    """Loan is in default if unpaid 7+ days past final dueDate."""
    if loan.repaid: return False
    return now_ts > (loan.due_date + DEFAULT_GRACE_SEC)


# ── Per-loan scoring ──────────────────────────────────────────────────────────

def _score_loan(loan: _LoanSnapshot, now_ts: int) -> dict:
    """Return per-loan karma delta + status. Pure function, easy to unit-test."""
    delta = D_LOAN_REQUEST     # request itself costs 1
    on_time  = 0
    late_1_7 = 0
    late_30  = 0
    late_30plus = 0
    defaulted    = False
    cured_default = False

    # Classify each payment by lateness (treat them as monthly installments arriving)
    for i, (ts, _amt) in enumerate(loan.payments, start=1):
        if i > loan.duration_months:
            # Extra payments past schedule don't change karma further
            break
        cls = _classify_payment_lateness(loan.start_time, loan.monthly_payment, i, ts)
        if cls == "on_time":
            delta += D_ON_TIME_PAYMENT
            on_time += 1
        elif cls == "late_1_7":
            delta += D_LATE_PAYMENT_1_7
            late_1_7 += 1
        elif cls == "late_8_30":
            delta += D_LATE_PAYMENT_8_30
            late_30 += 1
        else:    # late_30plus
            delta += D_LATE_PAYMENT_8_30
            late_30plus += 1

    # Repayment bonus or default penalty
    if loan.repaid:
        had_lates = (late_1_7 + late_30 + late_30plus) > 0
        delta += D_FULL_REPAY_WITH_LATES if had_lates else D_FULL_REPAY_CLEAN
        # If we know the loan was once defaulted but later cured, give partial recovery
        # (caller signals this externally if needed). For MVP we infer: if dueDate < earliest payment ts → was past due
        if loan.payments and loan.payments[-1][0] > (loan.due_date + DEFAULT_GRACE_SEC):
            cured_default = True
            delta += D_DEFAULT_CURED
    elif _is_defaulted(loan, now_ts):
        delta += D_DEFAULT
        defaulted = True

    return {
        "loan_id":         loan.loan_id,
        "delta":           delta,
        "on_time":         on_time,
        "late_1_7":        late_1_7,
        "late_8_30":       late_30,
        "late_30plus":     late_30plus,
        "defaulted":       defaulted,
        "cured_default":   cured_default,
        "repaid":          loan.repaid,
    }


# ── Aggregate scorer ──────────────────────────────────────────────────────────

def compute_karma_from_snapshots(
    loans: List[_LoanSnapshot],
    *,
    has_identity_binding: bool = True,
    now_ts: Optional[int] = None,
) -> dict:
    """Stateless aggregator — given the borrower's loan snapshots, return karma.

    `has_identity_binding` reflects whether the wallet is linked to a Circle
    userId (sybil safety). Unbound wallets start at PROBATION_KARMA.
    """
    if now_ts is None:
        now_ts = int(time.time())

    base = NEW_USER_KARMA if has_identity_binding else PROBATION_KARMA
    completed_loans = sum(1 for l in loans if l.repaid)
    first_time = completed_loans == 0 and not any(l.payments for l in loans)

    per_loan = [_score_loan(l, now_ts) for l in loans]
    total_delta = sum(p["delta"] for p in per_loan)
    karma = max(KARMA_FLOOR, min(KARMA_CEILING, base + total_delta))

    suggested_bps = KARMA_TO_INTEREST_BPS(karma)
    loan_cap = NEW_WALLET_LOAN_CAP_USDC if (first_time and not has_identity_binding) else None

    return {
        "karma":                 karma,
        "first_time_user":       first_time,
        "has_identity_binding":  has_identity_binding,
        "completed_loans":       completed_loans,
        "active_loans":          sum(1 for l in loans if not l.repaid),
        "defaulted_loans":       sum(1 for p in per_loan if p["defaulted"]),
        "total_loans":           len(loans),
        "suggested_interest_bps": suggested_bps,
        "loan_cap_usdc_6dec":    loan_cap,    # None = no cap
        "breakdown":             per_loan,
        "base":                  base,
    }


# ── Chain reader (live RPC) ───────────────────────────────────────────────────

def compute_karma(address: str, web3, loan_market_contract) -> dict:
    """Pull events from LoanMarket via web3, build snapshots, score.

    `web3` is a web3.py Web3 instance.
    `loan_market_contract` is a web3 Contract object with the LoanMarket ABI.

    `has_identity_binding` is left True by default here — the caller (Flask route)
    should consult IdentityStore and pass it through if False.
    """
    addr = web3.to_checksum_address(address)

    # 1. Pull LoanRequested events filtered by indexed borrower
    try:
        requested_filter = loan_market_contract.events.LoanRequested.create_filter(
            from_block=0, argument_filters={"borrower": addr}
        )
        loan_events = requested_filter.get_all_entries()
    except Exception:
        loan_events = []

    snapshots: List[_LoanSnapshot] = []
    for ev in loan_events:
        loan_id = int(ev["args"]["loanId"])
        loan    = loan_market_contract.functions.getLoan(loan_id).call()
        # Loan struct order: (borrower, principal, interestBps, durationMonths,
        #                     dueDate, fundedAmount, totalPaid, monthlyPayment,
        #                     repaid, metadataURI)
        (_borrower, principal, interest_bps, duration_months,
         due_date, funded, total_paid, monthly, repaid, _meta) = loan

        if int(duration_months) == 0:
            start_time = int(due_date)   # safety
        else:
            start_time = int(due_date) - int(duration_months) * SECONDS_PER_MONTH

        snap = _LoanSnapshot(
            loan_id         = loan_id,
            principal       = int(principal),
            interest_bps    = int(interest_bps),
            duration_months = int(duration_months),
            due_date        = int(due_date),
            start_time      = start_time,
            funded_amount   = int(funded),
            total_paid      = int(total_paid),
            monthly_payment = int(monthly),
            repaid          = bool(repaid),
        )

        # 2. Pull PaymentMade events for this loan; sum amounts per tx-timestamp
        try:
            pf = loan_market_contract.events.PaymentMade.create_filter(
                from_block=0, argument_filters={"loanId": loan_id},
            )
            payment_events = pf.get_all_entries()
        except Exception:
            payment_events = []

        # Group payments by block (one borrower tx → many PaymentMade events for each lender)
        per_block: dict[int, int] = {}
        for pev in payment_events:
            block_num = pev["blockNumber"]
            per_block[block_num] = per_block.get(block_num, 0) + int(pev["args"]["amount"])

        for blk, amt_sum in sorted(per_block.items()):
            try:
                ts = int(web3.eth.get_block(blk)["timestamp"])
            except Exception:
                ts = int(time.time())
            snap.payments.append((ts, amt_sum))

        snapshots.append(snap)

    return compute_karma_from_snapshots(snapshots)
