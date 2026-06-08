import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from run_fico_pipeline import predict_fico, credit_to_interest_and_loan
from model.walletEtl import get_wallet_features
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

DEFAULT_CHAIN = os.environ.get("CHAIN", "arc-testnet")

@app.route("/api/fico-score", methods=["POST"])
def fico_score():
    data = request.get_json()
    wallet = data.get("wallet_address")
    chain = data.get("chain", DEFAULT_CHAIN).lower()

    if not wallet:
        return jsonify({"message": "Missing wallet_address"}), 400

    try:
        score = predict_fico(wallet, chain=chain)
        interest, amount = credit_to_interest_and_loan(score)
        if score < 30:  # Lowered from 60 to 30
            interest = None
            amount = 0
        return jsonify({
            "fico_score": round(score, 2),
            "interest_rate": interest,
            "max_loan_amount": amount
        })
    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.route("/api/wallet-analytics", methods=["POST"])
def wallet_analytics():
    data = request.get_json()
    wallet = data.get("wallet_address")
    chain = data.get("chain", DEFAULT_CHAIN).lower()

    if not wallet:
        return jsonify({"message": "Missing wallet_address"}), 400

    try:
        summary_df, tx_df = get_wallet_features(wallet, chain=chain)
        
        if summary_df.empty:
            return jsonify({
                "wallet_stats": {
                    "wallet_age_days": 0,
                    "wallet_address": wallet
                },
                "transaction_analytics": {
                    "total_transactions": 0,
                    "avg_transaction_value": 0.0,
                    "active_days": 0,
                    "total_volume_eth": 0.0,
                    "incoming_transactions": 0,
                    "outgoing_transactions": 0,
                    "first_transaction_date": None,
                    "last_transaction_date": None,
                    "recent_transactions_30d": 0
                },
                "fico_score": 60,
                "transactions": []
            })

        wallet_data = summary_df.iloc[0]
        
        # Format transaction history
        transactions = []
        if not tx_df.empty:
            for _, tx in tx_df.head(20).iterrows():  # Return last 20 transactions
                value_eth = tx.get("value_eth", 0)
                timestamp = tx.get("timestamp", "")
                transactions.append({
                    "hash": tx.get("hash", "N/A"),
                    "from": tx.get("from", "N/A"),
                    "to": tx.get("to", "N/A"),
                    "value": float(value_eth) if value_eth is not None else 0.0,
                    "timestamp": timestamp.split("T")[0] if timestamp and isinstance(timestamp, str) else "N/A"
                })

        return jsonify({
            "wallet_stats": {
                "wallet_age_days": int(wallet_data["wallet_age_days"]),
                "wallet_address": wallet
            },
            "transaction_analytics": {
                "total_transactions": int(wallet_data["tx_count"]),
                "avg_transaction_value": round(float(wallet_data["avg_tx_value_eth"]), 6),
                "active_days": int(wallet_data["active_days"]),
                "total_volume_eth": round(float(tx_df["value_eth"].sum() if not tx_df.empty else 0), 6),
                "incoming_transactions": len([tx for _, tx in tx_df.iterrows() if str(tx.get("to", "")).lower() == wallet.lower()]) if not tx_df.empty else 0,
                "outgoing_transactions": len([tx for _, tx in tx_df.iterrows() if str(tx.get("from", "")).lower() == wallet.lower()]) if not tx_df.empty else 0,
                "first_transaction_date": None,
                "last_transaction_date": None,
                "recent_transactions_30d": 0
            },
            "fico_score": _safe_fico(wallet, chain),
            "transactions": transactions
        })
    except Exception as e:
        return jsonify({"message": str(e)}), 500

def _safe_fico(wallet: str, chain: str) -> float:
    """FICO for supported indexer chains; neutral default on Arc / unknown."""
    try:
        return round(predict_fico(wallet, chain=chain), 2)
    except Exception:
        return 60.0

@app.route("/api/karma-score", methods=["POST"])
def karma_score():
    data = request.get_json()
    wallet = data.get("wallet_address")
    chain = data.get("chain", DEFAULT_CHAIN).lower()

    if not wallet:
        return jsonify({"message": "Missing wallet_address"}), 400

    try:
        # Get FICO score and wallet analytics
        fico = predict_fico(wallet, chain=chain)
        summary_df, tx_df = get_wallet_features(wallet, chain=chain)
        
        if summary_df.empty:
            return jsonify({
                "karma_score": 0,
                "breakdown": {
                    "wallet_age": 0,
                    "transaction_frequency": 0,
                    "transaction_consistency": 0,
                    "creditworthiness": 0
                },
                "risk_level": "HIGH"
            })

        wallet_data = summary_df.iloc[0]
        
        # Calculate Karma components (0-100 scale)
        age_score = min(wallet_data["wallet_age_days"] / 365 * 100, 100)
        
        frequency_score = min(wallet_data["tx_count"] / 100 * 100, 100)
        
        consistency_score = min(wallet_data["active_days"] / 30 * 100, 100) if wallet_data["active_days"] > 0 else 0
        
        credit_score = fico
        
        # Weighted Karma score
        karma = (age_score * 0.2 + frequency_score * 0.25 + consistency_score * 0.25 + credit_score * 0.3)
        
        # Risk assessment
        if karma >= 80:
            risk_level = "LOW"
        elif karma >= 60:
            risk_level = "MEDIUM"
        else:
            risk_level = "HIGH"

        return jsonify({
            "karma_score": round(karma, 1),
            "breakdown": {
                "wallet_age": round(age_score, 1),
                "transaction_frequency": round(frequency_score, 1),
                "transaction_consistency": round(consistency_score, 1),
                "creditworthiness": round(credit_score, 1)
            },
            "risk_level": risk_level
        })
    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "message": "OnChain FICO API is running"})

# ── Circle User-Controlled Wallet endpoints ───────────────────────────────────
# Docs: https://developers.circle.com/w3s/reference/createuser

import uuid, requests as req_lib

CIRCLE_API_KEY = os.environ.get("CIRCLE_API_KEY", "")
CIRCLE_BASE    = "https://api.circle.com/v1/w3s"

def _headers(user_token=None):
    h = {"Authorization": f"Bearer {CIRCLE_API_KEY}", "Content-Type": "application/json"}
    if user_token:
        h["X-User-Token"] = user_token
    return h


@app.route("/api/circle/init", methods=["POST"])
def circle_init():
    """
    PIN-based first-time setup:
      1. Create Circle userId (or accept existing one for retry)
      2. Get userToken + encryptionKey
      3. Create wallet-initialization challenge on ARC-TESTNET
    Returns: { userId, userToken, encryptionKey, challengeId }
    Frontend passes these to the Circle Web SDK which opens a hosted PIN-setup UI.
    """
    data    = request.get_json() or {}
    # Allow frontend to pass an existing userId for retry (idempotent)
    user_id = data.get("userId") or str(uuid.uuid4())

    # 1. Create user in Circle (no-op if already exists)
    r = req_lib.post(f"{CIRCLE_BASE}/users", headers=_headers(), json={"userId": user_id})
    if r.status_code not in (200, 201) and "already exists" not in r.text:
        return jsonify({"error": f"create-user: {r.text}"}), 500

    # 2. Get short-lived session tokens
    r = req_lib.post(f"{CIRCLE_BASE}/users/token", headers=_headers(), json={"userId": user_id})
    if r.status_code not in (200, 201):
        return jsonify({"error": f"user-token: {r.text}"}), 500
    session        = r.json().get("data", {})
    user_token     = session.get("userToken")
    encryption_key = session.get("encryptionKey")

    # 3. Create initialization challenge (SCA wallet on Arc testnet, PIN auth)
    r = req_lib.post(
        f"{CIRCLE_BASE}/user/initialize",
        headers=_headers(user_token=user_token),
        json={
            "idempotencyKey": user_id,        # reuse userId → safe to retry
            "accountType":    "SCA",          # Smart Contract Account
            "blockchains":    ["ARC-TESTNET"],
        },
    )
    # 155106 = user already initialized (wallet exists) — not an error
    body = r.json()
    if r.status_code not in (200, 201):
        code = body.get("code") or (body.get("data") or {}).get("code")
        if code == 155106:
            # Wallet already exists; return tokens so frontend can fetchAddress
            return jsonify({
                "userId":        user_id,
                "userToken":     user_token,
                "encryptionKey": encryption_key,
                "challengeId":   None,   # skip execute — wallet already ready
            })
        return jsonify({"error": f"initialize: {r.text}"}), 500

    challenge_id = body.get("data", {}).get("challengeId")

    return jsonify({
        "userId":        user_id,
        "userToken":     user_token,
        "encryptionKey": encryption_key,
        "challengeId":   challenge_id,
    })


@app.route("/api/circle/session", methods=["POST"])
def circle_session():
    """Get a fresh userToken for an existing userId (re-login)."""
    data    = request.get_json()
    user_id = data.get("userId")
    if not user_id:
        return jsonify({"error": "userId required"}), 400

    r = req_lib.post(f"{CIRCLE_BASE}/users/token", headers=_headers(), json={"userId": user_id})
    if r.status_code not in (200, 201):
        return jsonify({"error": r.text}), 500
    body = r.json().get("data", {})
    return jsonify({"userToken": body.get("userToken"), "encryptionKey": body.get("encryptionKey")})


@app.route("/api/circle/wallet-address", methods=["POST"])
def circle_wallet_address():
    """Return the EVM wallet address for a userId (works on Arc since same address)."""
    data    = request.get_json()
    user_id = data.get("userId")
    if not user_id:
        return jsonify({"error": "userId required"}), 400

    r = req_lib.get(f"{CIRCLE_BASE}/wallets?userId={user_id}", headers=_headers())
    if r.status_code != 200:
        return jsonify({"error": r.text}), 500

    wallets = r.json().get("data", {}).get("wallets", [])
    if not wallets:
        return jsonify({"address": None})
    return jsonify({"address": wallets[0].get("address")})


# ── On-chain Karma (C9) ───────────────────────────────────────────────────────
# Karma is derived from LoanMarket events. Sybil resistance: bind Circle userId
# → wallet address; aggregate karma across all addresses linked to one userId.
# Brand-new wallets without bindings start in probation (50 karma, $25 loan cap).

from services.karma import (
    compute_karma, KARMA_TO_INTEREST_BPS, NEW_WALLET_LOAN_CAP_USDC, IdentityStore
)
from services.karma.scorer import compute_karma_from_snapshots, _LoanSnapshot

_identity = IdentityStore()


def _get_web3_and_market():
    """Lazy-load web3 + LoanMarket contract. Returns (web3, contract) or (None, None)
    if RPC / contract config is missing. We try to read the deployedContracts.json
    file from backend/."""
    try:
        from web3 import Web3
        import json
        rpc_url = os.environ.get("ARC_RPC_URL", "https://rpc.testnet.arc.network")
        w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"verify": False}))
        if not w3.is_connected():
            return None, None
        # Load ABI + address from frontend's exported ABI (most up-to-date)
        abi_path = os.path.join(os.path.dirname(__file__), "frontend", "src",
                                "abis", "arcTestnet", "LoanMarket.json")
        with open(abi_path) as f:
            data = json.load(f)
        contract = w3.eth.contract(address=Web3.to_checksum_address(data["address"]),
                                    abi=data["abi"])
        return w3, contract
    except Exception:
        return None, None


@app.route("/api/karma/<address>", methods=["GET"])
def karma_for_address(address: str):
    """Return karma + breakdown for a borrower address.

    If the address is bound to a Circle userId, aggregate events across all
    addresses linked to that userId (sybil resistance).
    """
    try:
        from web3 import Web3
        addr = Web3.to_checksum_address(address)
    except Exception:
        return jsonify({"error": "invalid address"}), 400

    w3, contract = _get_web3_and_market()
    if w3 is None or contract is None:
        # Chain unavailable: return defaults so the frontend can still render
        return jsonify({
            "karma":                  NEW_USER_KARMA_FALLBACK,
            "first_time_user":        True,
            "has_identity_binding":   _identity.has_binding(addr),
            "completed_loans":        0,
            "active_loans":           0,
            "defaulted_loans":        0,
            "total_loans":            0,
            "suggested_interest_bps": KARMA_TO_INTEREST_BPS(NEW_USER_KARMA_FALLBACK),
            "loan_cap_usdc_6dec":     None,
            "breakdown":              [],
            "base":                   NEW_USER_KARMA_FALLBACK,
            "note":                   "chain unavailable; defaults returned",
        })

    bound = _identity.has_binding(addr)
    linked = _identity.linked_addresses_for_address(addr)

    # Aggregate snapshots across all linked addresses
    if len(linked) == 1:
        result = compute_karma(addr, w3, contract)
    else:
        all_snapshots = []
        for linked_addr in linked:
            r = compute_karma(linked_addr, w3, contract)
            # Re-run from scratch with combined snapshots — easier: just keep delta totals
            all_snapshots.extend(_snapshots_from_chain(linked_addr, w3, contract))
        result = compute_karma_from_snapshots(all_snapshots, has_identity_binding=True)

    # Override has_identity_binding with current binding status
    result["has_identity_binding"] = bound
    result["linked_addresses"]     = linked
    return jsonify(result)


NEW_USER_KARMA_FALLBACK = 70


def _snapshots_from_chain(address, web3, contract):
    """Pull snapshots only (no scoring). Used to aggregate across linked addresses."""
    from services.karma.scorer import _LoanSnapshot, SECONDS_PER_MONTH
    addr = web3.to_checksum_address(address)
    try:
        f = contract.events.LoanRequested.create_filter(
            from_block=0, argument_filters={"borrower": addr})
        events = f.get_all_entries()
    except Exception:
        return []

    out = []
    for ev in events:
        loan_id = int(ev["args"]["loanId"])
        loan    = contract.functions.getLoan(loan_id).call()
        (_borrower, principal, interest_bps, duration_months,
         due_date, funded, total_paid, monthly, repaid, _meta) = loan
        start_time = int(due_date) - int(duration_months) * SECONDS_PER_MONTH if int(duration_months) else int(due_date)
        snap = _LoanSnapshot(
            loan_id=loan_id, principal=int(principal),
            interest_bps=int(interest_bps), duration_months=int(duration_months),
            due_date=int(due_date), start_time=start_time,
            funded_amount=int(funded), total_paid=int(total_paid),
            monthly_payment=int(monthly), repaid=bool(repaid),
        )
        try:
            pf = contract.events.PaymentMade.create_filter(
                from_block=0, argument_filters={"loanId": loan_id})
            pevs = pf.get_all_entries()
        except Exception:
            pevs = []
        per_block = {}
        for pev in pevs:
            per_block[pev["blockNumber"]] = per_block.get(pev["blockNumber"], 0) + int(pev["args"]["amount"])
        for blk, amt in sorted(per_block.items()):
            try:
                ts = int(web3.eth.get_block(blk)["timestamp"])
            except Exception:
                ts = 0
            snap.payments.append((ts, amt))
        out.append(snap)
    return out


@app.route("/api/karma/bind", methods=["POST"])
def karma_bind():
    """Bind a Circle userId to a wallet address. Idempotent.
    Body: { circle_user_id, address }
    """
    data = request.get_json() or {}
    uid  = data.get("circle_user_id")
    addr = data.get("address")
    if not uid or not addr:
        return jsonify({"error": "circle_user_id and address required"}), 400
    if not isinstance(addr, str) or not addr.startswith("0x") or len(addr) != 42:
        return jsonify({"error": "invalid address"}), 400

    ok = _identity.bind(uid, addr)
    if not ok:
        return jsonify({"error": "bind failed"}), 500
    return jsonify({
        "ok":                  True,
        "circle_user_id":      uid,
        "address":             addr.lower(),
        "linked_addresses":    _identity.addresses_for_userid(uid),
    })


@app.route("/api/karma/suggest-rate/<int:karma>", methods=["GET"])
def karma_suggest_rate(karma: int):
    """Public helper: convert a karma score into a suggested interest rate."""
    bps = KARMA_TO_INTEREST_BPS(karma)
    return jsonify({"karma": karma, "interest_bps": bps, "apr_percent": bps / 100})


# ── Orderbook (C8) ────────────────────────────────────────────────────────────
# Hybrid RFQ: investor bids live in SQLite, asks come from on-chain LoanMarket
# events (passed in by frontend for MVP). Matcher returns tx payloads.

from services.orderbook import (
    InvestorBid, LoanAsk, OrderbookStore, match_bids_to_asks
)

_store = OrderbookStore()


def _checksum(addr: str) -> str:
    """Lowercase + 0x check; full EIP-55 checksum not required for matching."""
    if not isinstance(addr, str) or not addr.startswith("0x") or len(addr) != 42:
        raise ValueError(f"Invalid EVM address: {addr}")
    return addr.lower()


@app.route("/api/orderbook/bids", methods=["POST"])
def orderbook_create_bid():
    """Investor posts a standing bid.
    Body: { investor, max_rate_bps, min_karma, max_exposure_usdc, categories: [] }
    """
    data = request.get_json() or {}
    try:
        investor      = _checksum(data["investor"])
        max_rate_bps  = int(data["max_rate_bps"])
        min_karma     = int(data.get("min_karma", 0))
        max_exposure  = int(data["max_exposure_usdc"])     # USDC 6-dec int
        categories    = list(data.get("categories", []))
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": f"bad request: {e}"}), 400

    if max_rate_bps <= 0 or max_rate_bps > 10_000:
        return jsonify({"error": "max_rate_bps must be 1-10000"}), 400
    if not (0 <= min_karma <= 100):
        return jsonify({"error": "min_karma must be 0-100"}), 400
    if max_exposure < 2_000_000:           # $2 min, same as LoanMarket
        return jsonify({"error": "max_exposure_usdc must be >= 2000000 ($2)"}), 400

    bid = InvestorBid(
        investor=investor,
        max_rate_bps=max_rate_bps,
        min_karma=min_karma,
        max_exposure=max_exposure,
        remaining_exposure=max_exposure,
        categories=categories,
    )
    _store.add_bid(bid)
    return jsonify(bid.to_dict()), 201


@app.route("/api/orderbook/bids", methods=["GET"])
def orderbook_list_bids():
    """List bids. ?investor=0x... filters by owner; otherwise returns open bids."""
    investor = request.args.get("investor")
    bids = (
        _store.list_bids_for_investor(_checksum(investor))
        if investor else _store.list_open_bids()
    )
    return jsonify([b.to_dict() for b in bids])


@app.route("/api/orderbook/bids/<bid_id>", methods=["DELETE"])
def orderbook_cancel_bid(bid_id: str):
    """Cancel an open bid. (No auth in MVP; frontend trusts wallet sig later.)"""
    bid = _store.get_bid(bid_id)
    if not bid:
        return jsonify({"error": "bid not found"}), 404
    if bid.status != "open":
        return jsonify({"error": f"bid already {bid.status}"}), 400
    _store.update_status(bid_id, "cancelled")
    return jsonify({"ok": True, "id": bid_id})


@app.route("/api/orderbook/match", methods=["POST"])
def orderbook_match():
    """Run matcher across all open bids and the asks the caller supplies.
    Body: { asks: [ { loan_id, borrower, principal, funded, interest_bps,
                       duration_months, category, karma } ... ] }
    Returns: { matches: [Match...] }
    """
    data = request.get_json() or {}
    raw_asks = data.get("asks") or []

    asks = []
    for a in raw_asks:
        try:
            principal = int(a["principal"])
            funded    = int(a.get("funded", 0))
            asks.append(LoanAsk(
                loan_id         = int(a["loan_id"]),
                borrower        = _checksum(a["borrower"]),
                principal       = principal,
                funded          = funded,
                remaining       = principal - funded,
                interest_bps    = int(a["interest_bps"]),
                duration_months = int(a["duration_months"]),
                category        = str(a.get("category", "")),
                karma           = int(a.get("karma", 0)),
            ))
        except (KeyError, ValueError, TypeError) as e:
            return jsonify({"error": f"bad ask payload: {e}"}), 400

    bids    = _store.list_open_bids()
    matches = match_bids_to_asks(bids, asks)
    return jsonify({"matches": [m.to_dict() for m in matches]})


@app.route("/api/orderbook/fill", methods=["POST"])
def orderbook_record_fill():
    """Frontend calls this AFTER an investor's fundLoan tx is mined.
    Body: { bid_id, amount }
    Decrements bid's remaining exposure (auto-marks 'filled' at 0).
    """
    data = request.get_json() or {}
    try:
        bid_id = str(data["bid_id"])
        amount = int(data["amount"])
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": f"bad request: {e}"}), 400

    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400

    ok = _store.decrement_exposure(bid_id, amount)
    if not ok:
        return jsonify({"error": "bid not found or not open"}), 404

    return jsonify({"ok": True, "bid": _store.get_bid(bid_id).to_dict()})


# ── Cross-system Matcher (C7+C8+C9 integration) ──────────────────────────────
# For a given loan, find every funding source it can tap: pool capacity, open
# investor bids, and any direct lenders already on-chain. Plus a one-click
# endpoint that has the allocator wallet push pool capital into the loan.

from services.matcher import find_funding_sources, auto_fund_from_pools
from services.orderbook import LoanAsk, match_bids_to_asks


def _load_pool_state(w3):
    """Read every pool from the LendingPool contract. Returns a list of dicts."""
    try:
        import json
        path = os.path.join(os.path.dirname(__file__), "frontend", "src",
                            "abis", "arcTestnet", "LendingPool.json")
        with open(path) as f:
            data = json.load(f)
        contract = w3.eth.contract(
            address=w3.to_checksum_address(data["address"]),
            abi=data["abi"],
        )
        count = int(contract.functions.poolCount().call())
        pools = []
        for i in range(count):
            p = contract.functions.getPool(i).call()
            # Pool tuple: (name, category, minKarma, idle, outstanding, totalShares, active)
            pools.append({
                "id":          i,
                "name":        p[0],
                "category":    p[1],
                "minKarma":    int(p[2]),
                "idle":        int(p[3]),
                "outstanding": int(p[4]),
                "active":      bool(p[6]),
            })
        return pools
    except Exception as e:
        print(f"_load_pool_state error: {e}")
        return []


def _load_loan(w3, contract, loan_id: int) -> dict:
    """Read a single loan + its lender contributions."""
    loan = contract.functions.getLoan(int(loan_id)).call()
    (borrower, principal, interest_bps, duration_months,
     due_date, funded, total_paid, monthly, repaid, metadata_uri) = loan

    # Pull lender list (small loop, fine for MVP)
    try:
        lenders = contract.functions.getLenders(int(loan_id)).call()
        contribs = []
        for l in lenders:
            amt = int(contract.functions.getContribution(int(loan_id), l).call())
            contribs.append((l, amt))
    except Exception:
        contribs = []

    return {
        "loan_id":         int(loan_id),
        "borrower":        borrower,
        "principal":       int(principal),
        "funded_amount":   int(funded),
        "interest_bps":    int(interest_bps),
        "duration_months": int(duration_months),
        "monthly_payment": int(monthly),
        "repaid":          bool(repaid),
        "metadata_uri":    metadata_uri,
        "_lenders":        contribs,
    }


@app.route("/api/borrower/<address>/history", methods=["GET"])
def borrower_history(address: str):
    """Full borrower profile: every loan + every payment + on-time analysis.
    Used by the borrower-profile page so investors can underwrite.
    """
    try:
        from web3 import Web3
        addr = Web3.to_checksum_address(address)
    except Exception:
        return jsonify({"error": "invalid address"}), 400

    w3, contract = _get_web3_and_market()
    if w3 is None or contract is None:
        return jsonify({"error": "chain unavailable"}), 503

    from services.karma.scorer import (
        _classify_payment_lateness, _is_defaulted,
        SECONDS_PER_MONTH, SECONDS_PER_DAY,
    )
    snaps = _snapshots_from_chain(addr, w3, contract)
    snaps.sort(key=lambda s: s.start_time)

    now_ts = int(__import__("time").time())
    first_loan_ts = snaps[0].start_time if snaps else None
    profile_age_days = ((now_ts - first_loan_ts) // SECONDS_PER_DAY) if first_loan_ts else 0

    loans_out = []
    for s in snaps:
        payments = []
        for i, (ts, amt) in enumerate(s.payments, start=1):
            if i > s.duration_months:
                cls = "extra"
            else:
                cls = _classify_payment_lateness(s.start_time, s.monthly_payment, i, ts)
            payments.append({
                "index":         i,
                "timestamp":     ts,
                "amount":        amt,
                "scheduled":     s.start_time + i * SECONDS_PER_MONTH,
                "classification": cls,
            })
        loans_out.append({
            "loan_id":         s.loan_id,
            "principal":       s.principal,
            "interest_bps":    s.interest_bps,
            "duration_months": s.duration_months,
            "start_time":      s.start_time,
            "due_date":        s.due_date,
            "funded_amount":   s.funded_amount,
            "total_paid":      s.total_paid,
            "monthly_payment": s.monthly_payment,
            "repaid":          s.repaid,
            "defaulted":       _is_defaulted(s, now_ts),
            "payments":        payments,
        })

    # Karma summary
    bound = _identity.has_binding(addr)
    karma_result = {}
    try:
        from services.karma.scorer import compute_karma_from_snapshots
        karma_result = compute_karma_from_snapshots(snaps, has_identity_binding=bound, now_ts=now_ts)
    except Exception:
        karma_result = {"karma": 70, "first_time_user": True}

    return jsonify({
        "address":            addr,
        "profile_age_days":   profile_age_days,
        "first_loan_at":      first_loan_ts,
        "has_identity_binding": bound,
        "total_loans":        len(snaps),
        "completed_loans":    sum(1 for s in snaps if s.repaid),
        "active_loans":       sum(1 for s in snaps if not s.repaid and not _is_defaulted(s, now_ts)),
        "defaulted_loans":    sum(1 for s in snaps if _is_defaulted(s, now_ts)),
        "karma":              karma_result.get("karma", 70),
        "suggested_interest_bps": karma_result.get("suggested_interest_bps", 1400),
        "loans":              loans_out,
    })


@app.route("/api/matcher/sources/<int:loan_id>", methods=["GET"])
def matcher_sources(loan_id: int):
    """Return every way this loan could get funded right now."""
    w3, contract = _get_web3_and_market()
    if w3 is None or contract is None:
        return jsonify({"error": "chain unavailable"}), 503

    try:
        loan = _load_loan(w3, contract, loan_id)
    except Exception as e:
        return jsonify({"error": f"loan {loan_id} not found: {e}"}), 404

    if loan["repaid"]:
        return jsonify({"loan_id": loan_id, "remaining": 0, "pools": [], "bids": [],
                        "direct_lenders": [{"address": a, "amount": amt} for a, amt in loan["_lenders"]],
                        "note": "loan already repaid"})

    # Borrower karma (with sybil-aware linked-address lookup)
    bound = _identity.has_binding(loan["borrower"])
    try:
        from services.karma.scorer import compute_karma_from_snapshots
        snaps = _snapshots_from_chain(loan["borrower"], w3, contract)
        karma_result = compute_karma_from_snapshots(snaps, has_identity_binding=bound)
        karma = karma_result.get("karma", 70)
    except Exception:
        karma = 70

    pools_state = _load_pool_state(w3)
    open_bids   = _store.list_open_bids()

    sources = find_funding_sources(
        loan            = loan,
        borrower_karma  = karma,
        pools_state     = pools_state,
        open_bids       = open_bids,
        contract_lenders= loan["_lenders"],
        matcher_fn      = match_bids_to_asks,
        LoanAsk         = LoanAsk,
    )

    result = sources.to_dict()
    result["borrower_karma"]      = karma
    result["borrower_has_binding"] = bound
    return jsonify(result)


@app.route("/api/matcher/auto-fund/<int:loan_id>", methods=["POST"])
def matcher_auto_fund(loan_id: int):
    """Run the allocator wallet against every eligible pool for this loan."""
    w3, contract = _get_web3_and_market()
    if w3 is None or contract is None:
        return jsonify({"error": "chain unavailable"}), 503

    try:
        loan = _load_loan(w3, contract, loan_id)
    except Exception as e:
        return jsonify({"error": f"loan {loan_id} not found: {e}"}), 404

    if loan["repaid"] or loan["funded_amount"] >= loan["principal"]:
        return jsonify({"error": "loan already funded or repaid"}), 400

    # Find eligible pools (reuse the sources matcher)
    bound = _identity.has_binding(loan["borrower"])
    try:
        from services.karma.scorer import compute_karma_from_snapshots
        snaps = _snapshots_from_chain(loan["borrower"], w3, contract)
        karma = compute_karma_from_snapshots(snaps, has_identity_binding=bound).get("karma", 70)
    except Exception:
        karma = 70

    pools_state = _load_pool_state(w3)
    sources = find_funding_sources(
        loan            = loan,
        borrower_karma  = karma,
        pools_state     = pools_state,
        open_bids       = [],
        contract_lenders= [],
        matcher_fn      = match_bids_to_asks,
        LoanAsk         = LoanAsk,
    )
    eligible = [pm for pm in sources.pools if pm.eligible]
    if not eligible:
        return jsonify({"allocated": [], "skipped": [pm.to_dict() for pm in sources.pools],
                        "errors": [], "note": "no eligible pools"})

    # Send the actual allocateToLoan transactions
    rpc_url = os.environ.get("ARC_RPC_URL", "https://rpc.testnet.arc.network")
    result = auto_fund_from_pools(loan_id, eligible, w3, rpc_url)
    return jsonify(result)


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
