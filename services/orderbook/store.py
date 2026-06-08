"""SQLite-backed store for investor bids.

Keeps the surface narrow: list / get / add / update_status / decrement_exposure.
The DB file lives next to this module by default — pass `path=':memory:'` for tests.
"""

import sqlite3
import json
import os
from typing import List, Optional
from .models import InvestorBid

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "orderbook.db")


class OrderbookStore:
    def __init__(self, path: str = _DEFAULT_PATH):
        self.path = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS bids (
                id                 TEXT PRIMARY KEY,
                investor           TEXT NOT NULL,
                max_rate_bps       INTEGER NOT NULL,
                min_karma          INTEGER NOT NULL,
                max_exposure       INTEGER NOT NULL,
                remaining_exposure INTEGER NOT NULL,
                categories_json    TEXT NOT NULL,
                created_at         INTEGER NOT NULL,
                status             TEXT NOT NULL DEFAULT 'open'
            );
            CREATE INDEX IF NOT EXISTS idx_bids_investor ON bids(investor);
            CREATE INDEX IF NOT EXISTS idx_bids_status   ON bids(status);
        """)
        self._conn.commit()

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def add_bid(self, bid: InvestorBid) -> InvestorBid:
        self._conn.execute(
            """INSERT INTO bids
               (id, investor, max_rate_bps, min_karma, max_exposure,
                remaining_exposure, categories_json, created_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (bid.id, bid.investor, bid.max_rate_bps, bid.min_karma,
             bid.max_exposure, bid.remaining_exposure,
             json.dumps(bid.categories), bid.created_at, bid.status)
        )
        self._conn.commit()
        return bid

    def get_bid(self, bid_id: str) -> Optional[InvestorBid]:
        row = self._conn.execute("SELECT * FROM bids WHERE id = ?", (bid_id,)).fetchone()
        return _row_to_bid(row) if row else None

    def list_open_bids(self) -> List[InvestorBid]:
        rows = self._conn.execute(
            "SELECT * FROM bids WHERE status = 'open' AND remaining_exposure > 0 "
            "ORDER BY created_at ASC"
        ).fetchall()
        return [_row_to_bid(r) for r in rows]

    def list_bids_for_investor(self, investor: str) -> List[InvestorBid]:
        rows = self._conn.execute(
            "SELECT * FROM bids WHERE investor = ? ORDER BY created_at DESC",
            (investor,)
        ).fetchall()
        return [_row_to_bid(r) for r in rows]

    def update_status(self, bid_id: str, status: str) -> bool:
        cur = self._conn.execute("UPDATE bids SET status = ? WHERE id = ?", (status, bid_id))
        self._conn.commit()
        return cur.rowcount > 0

    def decrement_exposure(self, bid_id: str, amount: int) -> bool:
        """Decrease remaining_exposure by `amount`, auto-marking 'filled' at 0."""
        bid = self.get_bid(bid_id)
        if not bid or bid.status != "open":
            return False
        new_remaining = max(0, bid.remaining_exposure - amount)
        new_status = "filled" if new_remaining == 0 else "open"
        self._conn.execute(
            "UPDATE bids SET remaining_exposure = ?, status = ? WHERE id = ?",
            (new_remaining, new_status, bid_id)
        )
        self._conn.commit()
        return True

    def close(self):
        self._conn.close()


def _row_to_bid(row: sqlite3.Row) -> InvestorBid:
    return InvestorBid(
        id=row["id"],
        investor=row["investor"],
        max_rate_bps=row["max_rate_bps"],
        min_karma=row["min_karma"],
        max_exposure=row["max_exposure"],
        remaining_exposure=row["remaining_exposure"],
        categories=json.loads(row["categories_json"]),
        created_at=row["created_at"],
        status=row["status"],
    )
