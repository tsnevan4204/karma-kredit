"""
End-to-end tests for app.py Flask API.

Run with:  python -m pytest test_api.py -v
Requires:  pip install pytest

External calls (Circle API, blockchain RPC) are mocked so tests run offline.
"""

import json
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np


# ── App under test ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    """Create Flask test app."""
    import app as flask_app
    flask_app.app.config["TESTING"] = True
    return flask_app.app


@pytest.fixture()
def client(app):
    return app.test_client()


# ── Shared mock data ──────────────────────────────────────────────────────────

WALLET = "0x39E6ec281404A1d521E899db3e64862a1bAca107"
CHAIN  = "arc-testnet"

_SUMMARY_DF = pd.DataFrame([{
    "wallet_age_days":    365,
    "tx_count":           50,
    "avg_tx_value_eth":   0.5,
    "active_days":        20,
}])

_TX_DF = pd.DataFrame([{
    "hash":       "0xabc",
    "from":       WALLET,
    "to":         "0xother",
    "value_eth":  1.0,
    "timestamp":  "2024-01-01T00:00:00",
}])

_FICO_SCORE = 72.5


def _mock_fico(*args, **kwargs):
    return _FICO_SCORE


def _mock_features(*args, **kwargs):
    return _SUMMARY_DF.copy(), _TX_DF.copy()


# ═══════════════════════════════════════════════════════════════════════════════
#  /api/fico-score
# ═══════════════════════════════════════════════════════════════════════════════

class TestFicoScore:

    def test_returns_score_and_loan_terms(self, client):
        with patch("app.predict_fico", _mock_fico), \
             patch("app.credit_to_interest_and_loan", return_value=(8.5, 500)):
            rv = client.post("/api/fico-score",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["fico_score"] == round(_FICO_SCORE, 2)
        assert data["interest_rate"] == 8.5
        assert data["max_loan_amount"] == 500

    def test_missing_wallet_returns_400(self, client):
        rv = client.post("/api/fico-score", json={})
        assert rv.status_code == 400
        assert "wallet_address" in rv.get_json()["message"].lower() or \
               "missing" in rv.get_json()["message"].lower()

    def test_low_score_suppresses_loan_terms(self, client):
        """Score < 30 → interest/amount should be None/0."""
        with patch("app.predict_fico", return_value=25.0), \
             patch("app.credit_to_interest_and_loan", return_value=(15.0, 100)):
            rv = client.post("/api/fico-score",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["fico_score"] == 25.0
        assert data["interest_rate"] is None
        assert data["max_loan_amount"] == 0

    def test_defaults_to_arc_testnet_chain(self, client):
        """When chain is omitted, should not crash."""
        with patch("app.predict_fico", _mock_fico), \
             patch("app.credit_to_interest_and_loan", return_value=(10.0, 300)):
            rv = client.post("/api/fico-score", json={"wallet_address": WALLET})
        assert rv.status_code == 200

    def test_exception_returns_500(self, client):
        with patch("app.predict_fico", side_effect=RuntimeError("rpc down")):
            rv = client.post("/api/fico-score",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 500
        assert "rpc down" in rv.get_json()["message"]


# ═══════════════════════════════════════════════════════════════════════════════
#  /api/wallet-analytics
# ═══════════════════════════════════════════════════════════════════════════════

class TestWalletAnalytics:

    def test_returns_full_analytics(self, client):
        with patch("app.get_wallet_features", _mock_features), \
             patch("app.predict_fico", _mock_fico):
            rv = client.post("/api/wallet-analytics",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["wallet_stats"]["wallet_age_days"] == 365
        assert data["transaction_analytics"]["total_transactions"] == 50
        assert data["fico_score"] == round(_FICO_SCORE, 2)
        assert isinstance(data["transactions"], list)

    def test_empty_wallet_returns_zeros(self, client):
        empty_df = pd.DataFrame()
        with patch("app.get_wallet_features", return_value=(empty_df, empty_df)), \
             patch("app.predict_fico", _mock_fico):
            rv = client.post("/api/wallet-analytics",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["wallet_stats"]["wallet_age_days"] == 0
        assert data["transaction_analytics"]["total_transactions"] == 0
        assert data["transactions"] == []

    def test_missing_wallet_returns_400(self, client):
        rv = client.post("/api/wallet-analytics", json={})
        assert rv.status_code == 400

    def test_transactions_capped_at_20(self, client):
        """Even if wallet has >20 txs, API returns at most 20."""
        many_rows = [{"hash": f"0x{i}", "from": WALLET, "to": "0xother",
                      "value_eth": 1.0, "timestamp": "2024-01-01T00:00:00"}
                     for i in range(50)]
        big_tx_df = pd.DataFrame(many_rows)
        summary = pd.DataFrame([{"wallet_age_days": 365, "tx_count": 50,
                                  "avg_tx_value_eth": 1.0, "active_days": 30}])
        with patch("app.get_wallet_features", return_value=(summary, big_tx_df)), \
             patch("app.predict_fico", _mock_fico):
            rv = client.post("/api/wallet-analytics",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        assert len(rv.get_json()["transactions"]) <= 20

    def test_incoming_outgoing_counts(self, client):
        """Correctly classifies incoming vs outgoing transactions."""
        OTHER = "0xOTHERaddress"
        txs = pd.DataFrame([
            {"hash": "0x1", "from": OTHER,   "to": WALLET, "value_eth": 1.0, "timestamp": "2024-01-01T00:00:00"},
            {"hash": "0x2", "from": WALLET,  "to": OTHER,  "value_eth": 2.0, "timestamp": "2024-01-02T00:00:00"},
            {"hash": "0x3", "from": WALLET,  "to": OTHER,  "value_eth": 3.0, "timestamp": "2024-01-03T00:00:00"},
        ])
        summary = pd.DataFrame([{"wallet_age_days": 10, "tx_count": 3,
                                  "avg_tx_value_eth": 2.0, "active_days": 3}])
        with patch("app.get_wallet_features", return_value=(summary, txs)), \
             patch("app.predict_fico", _mock_fico):
            rv = client.post("/api/wallet-analytics",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        analytics = rv.get_json()["transaction_analytics"]
        assert analytics["incoming_transactions"] == 1
        assert analytics["outgoing_transactions"] == 2


# ═══════════════════════════════════════════════════════════════════════════════
#  /api/karma-score
# ═══════════════════════════════════════════════════════════════════════════════

class TestKarmaScore:

    def test_returns_karma_and_breakdown(self, client):
        with patch("app.predict_fico", _mock_fico), \
             patch("app.get_wallet_features", _mock_features):
            rv = client.post("/api/karma-score",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        data = rv.get_json()
        assert "karma_score" in data
        assert set(data["breakdown"].keys()) == {
            "wallet_age", "transaction_frequency",
            "transaction_consistency", "creditworthiness"
        }
        assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH")

    def test_karma_weighted_formula(self, client):
        """karma = age*0.2 + freq*0.25 + consistency*0.25 + fico*0.3"""
        summary = pd.DataFrame([{
            "wallet_age_days": 365,   # age_score  = 100
            "tx_count":        100,   # freq_score = 100
            "active_days":      30,   # consist    = 100
            "avg_tx_value_eth": 1.0,
        }])
        with patch("app.predict_fico", return_value=100.0), \
             patch("app.get_wallet_features", return_value=(summary, _TX_DF)):
            rv = client.post("/api/karma-score",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        data = rv.get_json()
        assert data["karma_score"] == 100.0
        assert data["risk_level"] == "LOW"

    def test_empty_wallet_returns_zero(self, client):
        with patch("app.predict_fico", _mock_fico), \
             patch("app.get_wallet_features", return_value=(pd.DataFrame(), pd.DataFrame())):
            rv = client.post("/api/karma-score",
                             json={"wallet_address": WALLET, "chain": CHAIN})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["karma_score"] == 0
        assert data["risk_level"] == "HIGH"

    def test_risk_levels(self, client):
        """Check the three risk thresholds.
        karma = age*0.2 + freq*0.25 + consistency*0.25 + fico*0.3
        LOW ≥ 80, MEDIUM ≥ 60, HIGH < 60
        """
        cases = [
            # All maxed out → karma = 100 → LOW
            (100.0, {"wallet_age_days": 365, "tx_count": 100, "active_days": 30, "avg_tx_value_eth": 1.0}, "LOW"),
            # fico=70, age=365(100%), freq=60(60%), consist=20d/30(66.7%)
            # karma = 100*0.2 + 60*0.25 + 66.7*0.25 + 70*0.3 = 20+15+16.7+21 = 72.7 → MEDIUM
            (70.0,  {"wallet_age_days": 365, "tx_count": 60,  "active_days": 20, "avg_tx_value_eth": 1.0}, "MEDIUM"),
            # Everything zero → karma = 0 → HIGH
            (0.0,   {"wallet_age_days":   0, "tx_count":  0,  "active_days":  0, "avg_tx_value_eth": 0.0}, "HIGH"),
        ]
        for fico, row, expected_risk in cases:
            summary = pd.DataFrame([row])
            with patch("app.predict_fico", return_value=fico), \
                 patch("app.get_wallet_features", return_value=(summary, _TX_DF)):
                rv = client.post("/api/karma-score",
                                 json={"wallet_address": WALLET, "chain": CHAIN})
            assert rv.get_json()["risk_level"] == expected_risk, \
                f"FICO={fico} expected {expected_risk}, got {rv.get_json()['risk_level']}"

    def test_missing_wallet_returns_400(self, client):
        rv = client.post("/api/karma-score", json={})
        assert rv.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
#  /api/circle/* endpoints
# ═══════════════════════════════════════════════════════════════════════════════

class TestCircleInit:

    def _mock_requests(self, create_status=201, token_status=200,
                       init_status=200, already_initialized=False):
        """Build a mock for requests.post that simulates Circle API responses."""
        def _post(url, **kwargs):
            m = MagicMock()
            if "/users/token" in url:
                m.status_code = token_status
                m.json.return_value = {"data": {"userToken": "tok_123", "encryptionKey": "enc_abc"}}
                m.text = ""
            elif "/user/initialize" in url:
                if already_initialized:
                    m.status_code = 409
                    m.json.return_value = {"code": 155106, "message": "already initialized"}
                    m.text = '{"code":155106}'
                else:
                    m.status_code = init_status
                    m.json.return_value = {"data": {"challengeId": "chal_xyz"}}
                    m.text = ""
            else:  # /users (create)
                m.status_code = create_status
                m.json.return_value = {"data": {}}
                m.text = ""
            return m
        return _post

    def test_new_user_returns_all_fields(self, client):
        with patch("app.req_lib.post", side_effect=self._mock_requests()):
            rv = client.post("/api/circle/init", json={})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["userToken"] == "tok_123"
        assert data["encryptionKey"] == "enc_abc"
        assert data["challengeId"] == "chal_xyz"
        assert "userId" in data

    def test_existing_userId_is_reused(self, client):
        """Frontend passes existing userId → backend reuses it."""
        with patch("app.req_lib.post", side_effect=self._mock_requests()):
            rv = client.post("/api/circle/init", json={"userId": "my-stable-id"})
        assert rv.status_code == 200
        assert rv.get_json()["userId"] == "my-stable-id"

    def test_already_initialized_returns_null_challenge(self, client):
        """Circle 155106 → challengeId:null so frontend skips sdk.execute."""
        with patch("app.req_lib.post",
                   side_effect=self._mock_requests(already_initialized=True)):
            rv = client.post("/api/circle/init", json={})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["challengeId"] is None
        assert data["userToken"] == "tok_123"

    def test_create_user_failure_returns_500(self, client):
        """If Circle user creation fails (non-already-exists), return 500."""
        def _post(url, **kwargs):
            m = MagicMock()
            m.status_code = 500
            m.text = "Circle internal error"
            m.json.return_value = {}
            return m
        with patch("app.req_lib.post", side_effect=_post):
            rv = client.post("/api/circle/init", json={})
        assert rv.status_code == 500
        assert "error" in rv.get_json()


class TestCircleWalletAddress:

    def test_returns_address(self, client):
        mock_get = MagicMock()
        mock_get.status_code = 200
        mock_get.json.return_value = {
            "data": {"wallets": [{"address": "0xCircleWalletAddress123"}]}
        }
        with patch("app.req_lib.get", return_value=mock_get):
            rv = client.post("/api/circle/wallet-address",
                             json={"userId": "uid-123"})
        assert rv.status_code == 200
        assert rv.get_json()["address"] == "0xCircleWalletAddress123"

    def test_no_wallets_returns_null(self, client):
        mock_get = MagicMock()
        mock_get.status_code = 200
        mock_get.json.return_value = {"data": {"wallets": []}}
        with patch("app.req_lib.get", return_value=mock_get):
            rv = client.post("/api/circle/wallet-address",
                             json={"userId": "uid-123"})
        assert rv.status_code == 200
        assert rv.get_json()["address"] is None

    def test_missing_userId_returns_400(self, client):
        rv = client.post("/api/circle/wallet-address", json={})
        assert rv.status_code == 400

    def test_circle_api_failure_returns_500(self, client):
        mock_get = MagicMock()
        mock_get.status_code = 500
        mock_get.text = "Circle down"
        mock_get.json.return_value = {}
        with patch("app.req_lib.get", return_value=mock_get):
            rv = client.post("/api/circle/wallet-address",
                             json={"userId": "uid-123"})
        assert rv.status_code == 500


class TestCircleSession:

    def test_returns_tokens(self, client):
        mock_post = MagicMock()
        mock_post.status_code = 200
        mock_post.json.return_value = {
            "data": {"userToken": "tok_new", "encryptionKey": "enc_new"}
        }
        with patch("app.req_lib.post", return_value=mock_post):
            rv = client.post("/api/circle/session", json={"userId": "uid-123"})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["userToken"] == "tok_new"
        assert data["encryptionKey"] == "enc_new"

    def test_missing_userId_returns_400(self, client):
        rv = client.post("/api/circle/session", json={})
        assert rv.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
#  / health check
# ═══════════════════════════════════════════════════════════════════════════════

class TestHealthCheck:

    def test_health_endpoint(self, client):
        rv = client.get("/")
        assert rv.status_code == 200
        assert rv.get_json()["status"] == "healthy"
