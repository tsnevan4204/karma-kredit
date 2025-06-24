from flask import Flask, request, jsonify
from flask_cors import CORS
from run_fico_pipeline import predict_fico, credit_to_interest_and_loan
from model.walletEtl import get_wallet_features
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

@app.route("/api/fico-score", methods=["POST"])
def fico_score():
    data = request.get_json()
    wallet = data.get("wallet_address")
    chain = data.get("chain", "flow-evm").lower()

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
    chain = data.get("chain", "flow-evm").lower()

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
            "fico_score": predict_fico(wallet, chain=chain),
            "transactions": transactions
        })
    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.route("/api/karma-score", methods=["POST"])
def karma_score():
    data = request.get_json()
    wallet = data.get("wallet_address")
    chain = data.get("chain", "flow-evm").lower()

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

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
