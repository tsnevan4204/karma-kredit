"""End-to-end tests for the C9 karma scorer + identity binding + Flask routes.

Run: python -m pytest test_karma.py -v

We test the pure scoring functions directly (no chain), the IdentityStore
(in-memory SQLite), and the Flask routes (web3 is mocked).
"""

import pytest
from unittest.mock import patch, MagicMock
from services.karma import (
    compute_karma, KARMA_TO_INTEREST_BPS, NEW_WALLET_LOAN_CAP_USDC, IdentityStore
)
from services.karma.scorer import (
    _LoanSnapshot, compute_karma_from_snapshots,
    NEW_USER_KARMA, PROBATION_KARMA, KARMA_CEILING, KARMA_FLOOR,
    SECONDS_PER_DAY, SECONDS_PER_MONTH, DEFAULT_GRACE_SEC,
    D_LOAN_REQUEST, D_ON_TIME_PAYMENT, D_FULL_REPAY_CLEAN,
    D_FULL_REPAY_WITH_LATES, D_LATE_PAYMENT_1_7, D_LATE_PAYMENT_8_30,
    D_DEFAULT,
)

USDC = lambda n: int(n * 1_000_000)


def make_snapshot(**kw):
    """Build a sane _LoanSnapshot with defaults."""
    defaults = dict(
        loan_id=0, principal=USDC(100), interest_bps=1400, duration_months=6,
        due_date=1_700_000_000 + 6 * SECONDS_PER_MONTH,
        start_time=1_700_000_000,
        funded_amount=USDC(100), total_paid=USDC(0),
        monthly_payment=USDC(17), repaid=False, payments=[],
    )
    defaults.update(kw)
    return _LoanSnapshot(**defaults)


# ═══════════════════════════════════════════════════════════════════════════════
#  Interest rate formula
# ═══════════════════════════════════════════════════════════════════════════════

class TestInterestFormula:

    def test_max_karma_gives_floor_rate(self):
        # 3500 - 30*100 = 500 → 5%
        assert KARMA_TO_INTEREST_BPS(100) == 500

    def test_min_karma_gives_cap(self):
        # 3500 - 0 = 3500 → 35% (cap)
        assert KARMA_TO_INTEREST_BPS(0) == 3500

    def test_new_user_70_karma_gives_14_percent(self):
        # 3500 - 30*70 = 1400 → 14% — matches the design table
        assert KARMA_TO_INTEREST_BPS(70) == 1400

    def test_clamps_to_cap(self):
        assert KARMA_TO_INTEREST_BPS(-50) == 3500   # would be 5000, clamped

    def test_clamps_to_floor(self):
        assert KARMA_TO_INTEREST_BPS(200) == 500    # would be -2500, clamped

    def test_none_treated_as_new_user(self):
        assert KARMA_TO_INTEREST_BPS(None) == KARMA_TO_INTEREST_BPS(70)


# ═══════════════════════════════════════════════════════════════════════════════
#  Pure scoring — single loan
# ═══════════════════════════════════════════════════════════════════════════════

class TestSingleLoanScoring:

    def test_brand_new_borrower_no_loans(self):
        r = compute_karma_from_snapshots([], has_identity_binding=True)
        assert r["karma"] == NEW_USER_KARMA              # 70
        assert r["first_time_user"] is True
        assert r["loan_cap_usdc_6dec"] is None           # bound users skip probation

    def test_brand_new_unbound_wallet_starts_in_probation(self):
        r = compute_karma_from_snapshots([], has_identity_binding=False)
        assert r["karma"] == PROBATION_KARMA             # 50
        assert r["first_time_user"] is True
        assert r["loan_cap_usdc_6dec"] == NEW_WALLET_LOAN_CAP_USDC   # $25 cap

    def test_pending_loan_no_payments_yet(self):
        # Just requested, no payments due yet, not defaulted
        snap = make_snapshot()
        now = snap.start_time + SECONDS_PER_DAY   # 1 day in
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # Only the -1 for the loan request
        assert r["karma"] == NEW_USER_KARMA + D_LOAN_REQUEST    # 69
        assert r["first_time_user"] is True
        assert r["active_loans"] == 1
        assert r["defaulted_loans"] == 0

    def test_three_on_time_payments_bumps_karma(self):
        snap = make_snapshot(duration_months=6)
        # Payments arrive within 1-day grace at month 1, 2, 3
        snap.payments = [
            (snap.start_time + 1 * SECONDS_PER_MONTH,                USDC(17)),
            (snap.start_time + 2 * SECONDS_PER_MONTH + 100,          USDC(17)),
            (snap.start_time + 3 * SECONDS_PER_MONTH + SECONDS_PER_DAY, USDC(17)),
        ]
        now = snap.start_time + 4 * SECONDS_PER_MONTH
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # -1 (request) + 3 * +2 (on-time) = +5
        assert r["karma"] == NEW_USER_KARMA + D_LOAN_REQUEST + 3 * D_ON_TIME_PAYMENT  # 75

    def test_full_clean_repayment_gives_big_bonus(self):
        snap = make_snapshot(duration_months=3, repaid=True)
        snap.payments = [
            (snap.start_time + 1 * SECONDS_PER_MONTH, USDC(35)),
            (snap.start_time + 2 * SECONDS_PER_MONTH, USDC(35)),
            (snap.start_time + 3 * SECONDS_PER_MONTH, USDC(35)),
        ]
        now = snap.start_time + 4 * SECONDS_PER_MONTH
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # -1 + 3*+2 + +10 = +15 → 85
        expected = NEW_USER_KARMA + D_LOAN_REQUEST + 3 * D_ON_TIME_PAYMENT + D_FULL_REPAY_CLEAN
        assert r["karma"] == expected
        assert r["first_time_user"] is False

    def test_late_payment_1_to_7_days_penalty(self):
        snap = make_snapshot(duration_months=2)
        # Payment arrives 5 days late
        snap.payments = [
            (snap.start_time + 1 * SECONDS_PER_MONTH + 5 * SECONDS_PER_DAY, USDC(50)),
        ]
        now = snap.start_time + 1 * SECONDS_PER_MONTH + 6 * SECONDS_PER_DAY
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # -1 (request) + -3 (late_1_7) = -4
        assert r["karma"] == NEW_USER_KARMA + D_LOAN_REQUEST + D_LATE_PAYMENT_1_7    # 66

    def test_very_late_payment_penalty(self):
        snap = make_snapshot(duration_months=2)
        # Payment arrives 20 days late (in late_8_30 bucket)
        snap.payments = [
            (snap.start_time + 1 * SECONDS_PER_MONTH + 20 * SECONDS_PER_DAY, USDC(50)),
        ]
        now = snap.start_time + 2 * SECONDS_PER_MONTH
        r = compute_karma_from_snapshots([snap], now_ts=now)
        assert r["karma"] == NEW_USER_KARMA + D_LOAN_REQUEST + D_LATE_PAYMENT_8_30   # 61

    def test_first_time_default_drops_karma_significantly(self):
        """The user's key requirement: first-time defaulters take a big hit."""
        snap = make_snapshot(duration_months=6, repaid=False)
        # No payments, time is 8 days past dueDate → defaulted
        now = snap.due_date + 8 * SECONDS_PER_DAY
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # -1 (request) + -30 (default) = -31 → 70 - 31 = 39
        assert r["karma"] == NEW_USER_KARMA + D_LOAN_REQUEST + D_DEFAULT
        assert r["defaulted_loans"] == 1

    def test_default_just_barely_within_grace_not_yet(self):
        """6 days past dueDate is NOT yet default (grace is 7d)."""
        snap = make_snapshot(duration_months=6, repaid=False)
        now = snap.due_date + 6 * SECONDS_PER_DAY
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # Only -1 for request, no default yet
        assert r["karma"] == NEW_USER_KARMA + D_LOAN_REQUEST
        assert r["defaulted_loans"] == 0

    def test_repaid_loan_with_lates_gives_partial_bonus(self):
        snap = make_snapshot(duration_months=3, repaid=True)
        # 1 on-time + 2 late_1_7 payments, all eventually paid
        snap.payments = [
            (snap.start_time + 1 * SECONDS_PER_MONTH,                            USDC(35)),
            (snap.start_time + 2 * SECONDS_PER_MONTH + 5 * SECONDS_PER_DAY,      USDC(35)),
            (snap.start_time + 3 * SECONDS_PER_MONTH + 3 * SECONDS_PER_DAY,      USDC(35)),
        ]
        now = snap.start_time + 4 * SECONDS_PER_MONTH
        r = compute_karma_from_snapshots([snap], now_ts=now)
        # -1 + (+2) + (-3) + (-3) + +5 (full repay with lates) = 0 → karma = 70
        expected = (NEW_USER_KARMA + D_LOAN_REQUEST + D_ON_TIME_PAYMENT
                    + 2 * D_LATE_PAYMENT_1_7 + D_FULL_REPAY_WITH_LATES)
        assert r["karma"] == expected


# ═══════════════════════════════════════════════════════════════════════════════
#  Multi-loan aggregation + caps
# ═══════════════════════════════════════════════════════════════════════════════

class TestMultiLoanAndCaps:

    def test_karma_caps_at_100(self):
        # 5 cleanly repaid loans should hit the ceiling
        snaps = []
        for i in range(5):
            s = make_snapshot(loan_id=i, duration_months=3, repaid=True)
            s.payments = [
                (s.start_time + 1 * SECONDS_PER_MONTH, USDC(35)),
                (s.start_time + 2 * SECONDS_PER_MONTH, USDC(35)),
                (s.start_time + 3 * SECONDS_PER_MONTH, USDC(35)),
            ]
            snaps.append(s)
        r = compute_karma_from_snapshots(snaps)
        assert r["karma"] == KARMA_CEILING

    def test_karma_floors_at_zero(self):
        # 5 defaults → way below 0, should clamp
        snaps = [make_snapshot(loan_id=i, repaid=False) for i in range(5)]
        now = snaps[0].due_date + 30 * SECONDS_PER_DAY
        r = compute_karma_from_snapshots(snaps, now_ts=now)
        assert r["karma"] == KARMA_FLOOR
        assert r["defaulted_loans"] == 5

    def test_completed_loans_counter(self):
        s1 = make_snapshot(loan_id=0, repaid=True)
        s2 = make_snapshot(loan_id=1, repaid=False)
        r = compute_karma_from_snapshots([s1, s2])
        assert r["completed_loans"] == 1
        assert r["active_loans"] == 1
        assert r["total_loans"] == 2

    def test_suggested_interest_in_response(self):
        r = compute_karma_from_snapshots([], has_identity_binding=True)
        # 70 karma → 14%
        assert r["suggested_interest_bps"] == 1400


# ═══════════════════════════════════════════════════════════════════════════════
#  IdentityStore (sybil binding)
# ═══════════════════════════════════════════════════════════════════════════════

class TestIdentityStore:

    @pytest.fixture
    def store(self):
        s = IdentityStore(path=":memory:")
        yield s
        s.close()

    def test_bind_creates_link(self, store):
        store.bind("circle-uid-1", "0xAaaa")
        assert store.has_binding("0xaaaa")
        assert store.userid_for_address("0xaaaa") == "circle-uid-1"

    def test_address_lookup_is_case_insensitive(self, store):
        store.bind("uid-1", "0xAaaa")
        assert store.has_binding("0xAAAA")
        assert store.has_binding("0xaaaa")

    def test_one_userid_can_have_multiple_addresses(self, store):
        """The key sybil case: one Circle user, multiple wallets."""
        store.bind("uid-1", "0xAAA")
        store.bind("uid-1", "0xBBB")
        store.bind("uid-1", "0xCCC")
        addrs = store.addresses_for_userid("uid-1")
        assert set(addrs) == {"0xaaa", "0xbbb", "0xccc"}

    def test_linked_addresses_groups_by_userid(self, store):
        """If 0xBBB is bound to same userId as 0xAAA, querying either returns both."""
        store.bind("uid-1", "0xAAA")
        store.bind("uid-1", "0xBBB")
        linked = store.linked_addresses_for_address("0xBBB")
        assert set(linked) == {"0xaaa", "0xbbb"}

    def test_unbound_address_returns_itself_in_linked(self, store):
        """Wallets with no binding: linked = just themselves (lowercased)."""
        linked = store.linked_addresses_for_address("0xZZZ")
        assert linked == ["0xzzz"]

    def test_bind_is_idempotent(self, store):
        store.bind("uid-1", "0xAAA")
        store.bind("uid-1", "0xAAA")    # again
        addrs = store.addresses_for_userid("uid-1")
        assert addrs == ["0xaaa"]       # no duplicate


# ═══════════════════════════════════════════════════════════════════════════════
#  Flask routes (chain mocked)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def client():
    import app as flask_app
    flask_app.app.config["TESTING"] = True
    # Fresh in-memory identity store
    flask_app._identity.close()
    flask_app._identity = IdentityStore(path=":memory:")
    return flask_app.app.test_client()


class TestKarmaRoutes:

    BORROWER = "0x39E6ec281404A1d521E899db3e64862a1bAca107"

    def test_karma_returns_defaults_when_chain_unavailable(self, client):
        with patch("app._get_web3_and_market", return_value=(None, None)):
            rv = client.get(f"/api/karma/{self.BORROWER}")
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["karma"] == 70
        assert data["first_time_user"] is True
        assert data["suggested_interest_bps"] == 1400

    def test_karma_rejects_bad_address(self, client):
        rv = client.get("/api/karma/not-an-address")
        assert rv.status_code == 400

    def test_karma_uses_chain_data_when_available(self, client):
        """Mock web3 + contract so we can verify the route plumbs them through."""
        mock_w3 = MagicMock()
        mock_w3.to_checksum_address = lambda a: a
        mock_contract = MagicMock()

        # No LoanRequested events → result is a brand-new user (karma=70)
        mock_filter = MagicMock()
        mock_filter.get_all_entries.return_value = []
        mock_contract.events.LoanRequested.create_filter.return_value = mock_filter

        with patch("app._get_web3_and_market", return_value=(mock_w3, mock_contract)):
            rv = client.get(f"/api/karma/{self.BORROWER}")
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["karma"] == 70
        assert data["total_loans"] == 0

    def test_bind_creates_binding(self, client):
        rv = client.post("/api/karma/bind", json={
            "circle_user_id": "circle-uid-99",
            "address": self.BORROWER,
        })
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["circle_user_id"] == "circle-uid-99"
        assert self.BORROWER.lower() in body["linked_addresses"]

    def test_bind_rejects_missing_fields(self, client):
        rv = client.post("/api/karma/bind", json={"address": self.BORROWER})
        assert rv.status_code == 400

    def test_bind_rejects_bad_address(self, client):
        rv = client.post("/api/karma/bind", json={
            "circle_user_id": "uid", "address": "not-an-address",
        })
        assert rv.status_code == 400

    def test_suggest_rate_endpoint(self, client):
        rv = client.get("/api/karma/suggest-rate/70")
        assert rv.status_code == 200
        body = rv.get_json()
        assert body["karma"] == 70
        assert body["interest_bps"] == 1400
        assert body["apr_percent"] == 14.0

    def test_suggest_rate_clamps_invalid_input(self, client):
        rv = client.get("/api/karma/suggest-rate/9999")
        assert rv.get_json()["interest_bps"] == 500     # floor

    def test_binding_carries_across_addresses(self, client):
        """After binding two addresses to same userId, karma for one shows both linked."""
        client.post("/api/karma/bind", json={"circle_user_id": "uid-multi", "address": "0x1111111111111111111111111111111111111111"})
        client.post("/api/karma/bind", json={"circle_user_id": "uid-multi", "address": "0x2222222222222222222222222222222222222222"})
        with patch("app._get_web3_and_market", return_value=(None, None)):
            rv = client.get("/api/karma/0x1111111111111111111111111111111111111111")
        body = rv.get_json()
        # Note: in chain-unavailable path we don't aggregate; just check binding flag flows through
        assert body["has_identity_binding"] is True
