"""Circle userId ↔ wallet binding store (sybil resistance #1).

When a borrower completes Circle PIN onboarding, the frontend tells us
{ circle_user_id, address }. We store the binding so:

  - karma for ANY address linked to a Circle userId aggregates across ALL
    addresses owned by that userId — "delete wallet, make new one" doesn't
    erase your bad karma.
  - A request that targets an address with a binding skips the new-wallet
    probation (the borrower has provable phone-bound identity).

This is intentionally simple: SQLite, no signatures (production would verify a
signed message from the wallet). The grant demo's threat model is "spam new
wallets", which this closes given the Circle PIN flow is the only borrower path.
"""

from __future__ import annotations
import os
import sqlite3
import time
from typing import List, Optional

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "identity.db")


class IdentityStore:
    def __init__(self, path: str = _DEFAULT_PATH):
        self.path  = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS bindings (
                circle_user_id TEXT NOT NULL,
                address        TEXT NOT NULL,
                created_at     INTEGER NOT NULL,
                PRIMARY KEY (circle_user_id, address)
            );
            CREATE INDEX IF NOT EXISTS idx_bindings_address ON bindings(address);
            CREATE INDEX IF NOT EXISTS idx_bindings_userid  ON bindings(circle_user_id);
        """)
        self._conn.commit()

    # ── Writes ────────────────────────────────────────────────────────────────

    def bind(self, circle_user_id: str, address: str) -> bool:
        """Link a Circle userId to a wallet address (idempotent)."""
        addr = address.lower()
        try:
            self._conn.execute(
                "INSERT OR IGNORE INTO bindings (circle_user_id, address, created_at) VALUES (?, ?, ?)",
                (circle_user_id, addr, int(time.time())),
            )
            self._conn.commit()
            return True
        except sqlite3.Error:
            return False

    # ── Reads ─────────────────────────────────────────────────────────────────

    def has_binding(self, address: str) -> bool:
        addr = address.lower()
        row = self._conn.execute(
            "SELECT 1 FROM bindings WHERE address = ? LIMIT 1", (addr,)
        ).fetchone()
        return row is not None

    def userid_for_address(self, address: str) -> Optional[str]:
        addr = address.lower()
        row = self._conn.execute(
            "SELECT circle_user_id FROM bindings WHERE address = ? LIMIT 1", (addr,)
        ).fetchone()
        return row["circle_user_id"] if row else None

    def addresses_for_userid(self, circle_user_id: str) -> List[str]:
        rows = self._conn.execute(
            "SELECT address FROM bindings WHERE circle_user_id = ?", (circle_user_id,)
        ).fetchall()
        return [r["address"] for r in rows]

    def linked_addresses_for_address(self, address: str) -> List[str]:
        """Return ALL addresses sharing the Circle userId of `address` (including itself)."""
        uid = self.userid_for_address(address)
        if not uid:
            return [address.lower()]
        return self.addresses_for_userid(uid)

    def close(self):
        self._conn.close()
