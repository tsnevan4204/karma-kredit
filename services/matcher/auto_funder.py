"""Allocator wallet that pushes pool capital into open loans.

Uses the deployer private key from backend/.env (or BACKEND_ALLOCATOR_KEY env var)
to sign and send LendingPool.allocateToLoan(poolId, loanId, amount) transactions.
"""

from __future__ import annotations
import os
import json
from typing import Optional


def _allocator_key() -> Optional[str]:
    """Read the allocator private key. The pool's `allocator` was set to the
    deployer at construction, so we use the same key here."""
    return (
        os.environ.get("BACKEND_ALLOCATOR_KEY")
        or os.environ.get("PRIVATE_KEY")
        or _read_backend_env_key()
    )


def _read_backend_env_key() -> Optional[str]:
    """Fall back to backend/.env if env vars aren't set."""
    path = os.path.join(os.path.dirname(__file__), "..", "..", "backend", ".env")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("PRIVATE_KEY="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


def _load_pool_abi():
    """Load LendingPool ABI from the deployed-contracts artifact in frontend/."""
    path = os.path.join(os.path.dirname(__file__), "..", "..",
                        "frontend", "src", "abis", "arcTestnet", "LendingPool.json")
    with open(path) as f:
        return json.load(f)


def auto_fund_from_pools(
    loan_id: int,
    pool_matches: list,        # list of PoolMatch objects (only eligible ones acted on)
    web3,                       # Web3 instance
    rpc_url: str,
) -> dict:
    """For each eligible pool, send allocateToLoan(poolId, loanId, can_cover).

    Returns: { allocated: [{pool_id, amount, tx_hash}], skipped: [{pool_id, reason}], errors: [...] }
    """
    key = _allocator_key()
    if not key:
        return {"error": "no allocator key — set PRIVATE_KEY in backend/.env"}

    try:
        from web3 import Web3
        from eth_account import Account
    except ImportError:
        return {"error": "web3 / eth_account not installed"}

    pool_info = _load_pool_abi()
    pool_addr = web3.to_checksum_address(pool_info["address"])
    pool      = web3.eth.contract(address=pool_addr, abi=pool_info["abi"])

    acct = Account.from_key(key if key.startswith("0x") else "0x" + key)

    allocated, skipped, errors = [], [], []
    nonce = web3.eth.get_transaction_count(acct.address)

    for pm in pool_matches:
        if not pm.eligible or pm.can_cover <= 0:
            skipped.append({"pool_id": pm.pool_id, "reason": pm.reason or "ineligible"})
            continue
        try:
            tx = pool.functions.allocateToLoan(
                int(pm.pool_id), int(loan_id), int(pm.can_cover)
            ).build_transaction({
                "from":     acct.address,
                "nonce":    nonce,
                "gas":      400_000,
                "gasPrice": web3.eth.gas_price,
                "chainId":  web3.eth.chain_id,
            })
            signed = acct.sign_transaction(tx)
            tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status != 1:
                errors.append({"pool_id": pm.pool_id, "error": f"tx reverted {tx_hash.hex()}"})
            else:
                allocated.append({
                    "pool_id":  pm.pool_id,
                    "amount":   pm.can_cover,
                    "tx_hash":  tx_hash.hex(),
                })
            nonce += 1
        except Exception as e:
            errors.append({"pool_id": pm.pool_id, "error": str(e)})

    return {
        "allocated": allocated,
        "skipped":   skipped,
        "errors":    errors,
    }
