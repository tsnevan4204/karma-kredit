"""End-to-end tests for the C8 orderbook (matcher + Flask routes).

Run:  python -m pytest test_orderbook.py -v
"""

import pytest
from unittest.mock import patch
from services.orderbook import (
    InvestorBid, LoanAsk, OrderbookStore, match_bids_to_asks
)
from services.orderbook.matcher import MIN_CONTRIBUTION_USDC_6DEC

USDC = lambda dollars: int(dollars * 1_000_000)   # noqa: E731

INV1 = "0x39e6ec281404a1d521e899db3e64862a1baca107"
INV2 = "0xa55e76e9f61c286298acc8667b3f99c86bb30179"
BOR1 = "0x1111111111111111111111111111111111111111"
BOR2 = "0x2222222222222222222222222222222222222222"


def _bid(**kw) -> InvestorBid:
    defaults = dict(
        investor=INV1, max_rate_bps=1500, min_karma=0,
        max_exposure=USDC(1000), remaining_exposure=USDC(1000),
        categories=[],
    )
    defaults.update(kw)
    return InvestorBid(**defaults)


def _ask(**kw) -> LoanAsk:
    defaults = dict(
        loan_id=0, borrower=BOR1,
        principal=USDC(100), funded=0, remaining=USDC(100),
        interest_bps=1200, duration_months=6,
        category="agriculture", karma=70,
    )
    defaults.update(kw)
    return LoanAsk(**defaults)


# ═══════════════════════════════════════════════════════════════════════════════
#  Matcher unit tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMatcher:

    def test_simple_match(self):
        ms = match_bids_to_asks([_bid()], [_ask()])
        assert len(ms) == 1
        assert ms[0].amount == USDC(100)
        assert ms[0].investor == INV1
        assert ms[0].loan_id == 0

    def test_rate_too_high_rejected(self):
        """Loan offers 15% but bid caps at 10% → no match."""
        bid = _bid(max_rate_bps=1000)
        ask = _ask(interest_bps=1500)
        assert match_bids_to_asks([bid], [ask]) == []

    def test_karma_too_low_rejected(self):
        bid = _bid(min_karma=80)
        ask = _ask(karma=70)
        assert match_bids_to_asks([bid], [ask]) == []

    def test_category_match_required(self):
        bid = _bid(categories=["diversity"])
        ask_agri = _ask(category="agriculture")
        ask_div  = _ask(loan_id=1, category="diversity")
        ms = match_bids_to_asks([bid], [ask_agri, ask_div])
        assert len(ms) == 1
        assert ms[0].loan_id == 1

    def test_empty_categories_matches_anything(self):
        bid = _bid(categories=[])
        asks = [_ask(category="agriculture"), _ask(loan_id=1, category="diversity")]
        ms = match_bids_to_asks([bid], asks)
        assert len(ms) == 2

    def test_fill_capped_by_bid_exposure(self):
        bid = _bid(max_exposure=USDC(30), remaining_exposure=USDC(30))
        ask = _ask(principal=USDC(100), remaining=USDC(100))
        ms = match_bids_to_asks([bid], [ask])
        assert len(ms) == 1
        assert ms[0].amount == USDC(30)

    def test_fill_capped_by_ask_remaining(self):
        """Loan is half funded; only $50 left to fill."""
        bid = _bid(max_exposure=USDC(1000), remaining_exposure=USDC(1000))
        ask = _ask(principal=USDC(100), funded=USDC(50), remaining=USDC(50))
        ms = match_bids_to_asks([bid], [ask])
        assert ms[0].amount == USDC(50)

    def test_fully_funded_ask_skipped(self):
        ask = _ask(funded=USDC(100), remaining=0)
        assert match_bids_to_asks([_bid()], [ask]) == []

    def test_below_min_contribution_skipped(self):
        """If only $1 of room left in either side, skip (LoanMarket rejects <$2)."""
        bid = _bid(remaining_exposure=MIN_CONTRIBUTION_USDC_6DEC - 1)
        assert match_bids_to_asks([bid], [_ask()]) == []

    def test_one_bid_fills_two_asks(self):
        """$200 bid → fills two $100 loans."""
        bid = _bid(max_exposure=USDC(200), remaining_exposure=USDC(200))
        asks = [_ask(loan_id=0), _ask(loan_id=1)]
        ms = match_bids_to_asks([bid], asks)
        assert len(ms) == 2
        assert sum(m.amount for m in ms) == USDC(200)

    def test_two_bids_partial_fill_one_ask(self):
        b1 = _bid(max_exposure=USDC(60),  remaining_exposure=USDC(60),  created_at=1)
        b2 = _bid(max_exposure=USDC(60),  remaining_exposure=USDC(60),  created_at=2)
        ask = _ask(principal=USDC(100), remaining=USDC(100))
        ms = match_bids_to_asks([b1, b2], [ask])
        assert len(ms) == 2
        # FIFO: b1 fills first ($60), b2 fills the remaining $40
        assert ms[0].amount == USDC(60)
        assert ms[1].amount == USDC(40)

    def test_matcher_does_not_mutate_inputs(self):
        bid = _bid()
        ask = _ask()
        match_bids_to_asks([bid], [ask])
        assert bid.remaining_exposure == USDC(1000)   # unchanged
        assert ask.funded == 0

    def test_tx_payload_shape(self):
        ms = match_bids_to_asks([_bid()], [_ask()])
        payload = ms[0].tx_payload("0xdeadbeef")
        assert payload["to"]     == "0xdeadbeef"
        assert payload["method"] == "fundLoan"
        assert payload["args"]   == [0, USDC(100)]


# ═══════════════════════════════════════════════════════════════════════════════
#  Store unit tests (in-memory SQLite)
# ═══════════════════════════════════════════════════════════════════════════════

class TestStore:

    @pytest.fixture
    def store(self):
        s = OrderbookStore(path=":memory:")
        yield s
        s.close()

    def test_add_and_get(self, store):
        b = _bid()
        store.add_bid(b)
        got = store.get_bid(b.id)
        assert got is not None
        assert got.investor == INV1
        assert got.categories == []

    def test_get_unknown_returns_none(self, store):
        assert store.get_bid("does-not-exist") is None

    def test_list_open_bids_excludes_filled(self, store):
        b1 = _bid()
        b2 = _bid()
        store.add_bid(b1)
        store.add_bid(b2)
        store.update_status(b2.id, "filled")
        open_bids = store.list_open_bids()
        assert len(open_bids) == 1
        assert open_bids[0].id == b1.id

    def test_decrement_exposure_marks_filled_at_zero(self, store):
        b = _bid(max_exposure=USDC(100), remaining_exposure=USDC(100))
        store.add_bid(b)
        store.decrement_exposure(b.id, USDC(60))
        assert store.get_bid(b.id).remaining_exposure == USDC(40)
        assert store.get_bid(b.id).status == "open"
        store.decrement_exposure(b.id, USDC(40))
        assert store.get_bid(b.id).remaining_exposure == 0
        assert store.get_bid(b.id).status == "filled"

    def test_list_by_investor(self, store):
        store.add_bid(_bid(investor=INV1))
        store.add_bid(_bid(investor=INV2))
        store.add_bid(_bid(investor=INV1))
        assert len(store.list_bids_for_investor(INV1)) == 2
        assert len(store.list_bids_for_investor(INV2)) == 1

    def test_categories_roundtrip(self, store):
        b = _bid(categories=["agriculture", "diversity"])
        store.add_bid(b)
        got = store.get_bid(b.id)
        assert got.categories == ["agriculture", "diversity"]


# ═══════════════════════════════════════════════════════════════════════════════
#  Flask API tests
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def client():
    """Get a Flask test client with a fresh in-memory orderbook store."""
    import app as flask_app
    flask_app.app.config["TESTING"] = True
    # Swap in an in-memory store for test isolation
    flask_app._store.close()
    flask_app._store = OrderbookStore(path=":memory:")
    return flask_app.app.test_client()


class TestOrderbookAPI:

    def test_create_bid_happy_path(self, client):
        rv = client.post("/api/orderbook/bids", json={
            "investor":          INV1,
            "max_rate_bps":      1500,
            "min_karma":         60,
            "max_exposure_usdc": USDC(500),
            "categories":        ["agriculture"],
        })
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["investor"] == INV1
        assert data["remaining_exposure"] == USDC(500)
        assert data["status"] == "open"

    def test_create_bid_rejects_bad_address(self, client):
        rv = client.post("/api/orderbook/bids", json={
            "investor":          "not-an-address",
            "max_rate_bps":      1500,
            "min_karma":         60,
            "max_exposure_usdc": USDC(500),
            "categories":        [],
        })
        assert rv.status_code == 400

    def test_create_bid_rejects_below_min_exposure(self, client):
        rv = client.post("/api/orderbook/bids", json={
            "investor":          INV1,
            "max_rate_bps":      1500,
            "min_karma":         60,
            "max_exposure_usdc": 1_000_000,    # $1, below $2 min
            "categories":        [],
        })
        assert rv.status_code == 400

    def test_create_bid_rejects_bad_karma(self, client):
        rv = client.post("/api/orderbook/bids", json={
            "investor":          INV1,
            "max_rate_bps":      1500,
            "min_karma":         150,
            "max_exposure_usdc": USDC(500),
            "categories":        [],
        })
        assert rv.status_code == 400

    def test_create_bid_rejects_bad_rate(self, client):
        rv = client.post("/api/orderbook/bids", json={
            "investor":          INV1,
            "max_rate_bps":      0,
            "min_karma":         60,
            "max_exposure_usdc": USDC(500),
            "categories":        [],
        })
        assert rv.status_code == 400

    def test_list_open_bids(self, client):
        rv = client.get("/api/orderbook/bids")
        assert rv.status_code == 200
        bids = rv.get_json()
        assert isinstance(bids, list)
        assert len(bids) >= 1   # at least the one from happy-path test

    def test_list_filters_by_investor(self, client):
        rv = client.get(f"/api/orderbook/bids?investor={INV2}")
        assert rv.status_code == 200
        bids = rv.get_json()
        assert all(b["investor"] == INV2 for b in bids)

    def test_match_endpoint_returns_match(self, client):
        """Match the open bid (created in happy path) against a matching ask."""
        rv = client.post("/api/orderbook/match", json={
            "asks": [{
                "loan_id":         0,
                "borrower":        BOR1,
                "principal":       USDC(100),
                "funded":          0,
                "interest_bps":    1200,     # below bid's 1500 cap
                "duration_months": 6,
                "category":        "agriculture",
                "karma":           80,       # above bid's 60 floor
            }]
        })
        assert rv.status_code == 200
        matches = rv.get_json()["matches"]
        assert len(matches) >= 1
        m = matches[0]
        assert m["loan_id"] == 0
        assert m["amount"] == USDC(100)

    def test_match_returns_empty_when_no_compatible_asks(self, client):
        rv = client.post("/api/orderbook/match", json={
            "asks": [{
                "loan_id":         99,
                "borrower":        BOR1,
                "principal":       USDC(100),
                "funded":          0,
                "interest_bps":    2000,     # too high for any open bid (1500 cap)
                "duration_months": 6,
                "category":        "agriculture",
                "karma":           80,
            }]
        })
        assert rv.status_code == 200
        assert rv.get_json()["matches"] == []

    def test_match_bad_ask_payload_400(self, client):
        rv = client.post("/api/orderbook/match", json={
            "asks": [{"loan_id": 0}]    # missing required fields
        })
        assert rv.status_code == 400

    def test_record_fill_decrements_exposure(self, client):
        # Create a fresh $100 bid for this test
        rv = client.post("/api/orderbook/bids", json={
            "investor":          INV2,
            "max_rate_bps":      1500,
            "min_karma":         0,
            "max_exposure_usdc": USDC(100),
            "categories":        [],
        })
        bid_id = rv.get_json()["id"]

        rv = client.post("/api/orderbook/fill", json={
            "bid_id": bid_id, "amount": USDC(60),
        })
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["bid"]["remaining_exposure"] == USDC(40)
        assert body["bid"]["status"] == "open"

        # Fill the rest → status flips to filled
        rv = client.post("/api/orderbook/fill", json={
            "bid_id": bid_id, "amount": USDC(40),
        })
        assert rv.get_json()["bid"]["status"] == "filled"

    def test_record_fill_404_for_unknown_bid(self, client):
        rv = client.post("/api/orderbook/fill", json={
            "bid_id": "does-not-exist", "amount": USDC(10),
        })
        assert rv.status_code == 404

    def test_cancel_bid(self, client):
        rv = client.post("/api/orderbook/bids", json={
            "investor":          INV1,
            "max_rate_bps":      1500,
            "min_karma":         0,
            "max_exposure_usdc": USDC(100),
            "categories":        [],
        })
        bid_id = rv.get_json()["id"]

        rv = client.delete(f"/api/orderbook/bids/{bid_id}")
        assert rv.status_code == 200

        # Second cancel → already-cancelled error
        rv = client.delete(f"/api/orderbook/bids/{bid_id}")
        assert rv.status_code == 400

    def test_cancel_unknown_bid_404(self, client):
        rv = client.delete("/api/orderbook/bids/does-not-exist")
        assert rv.status_code == 404
