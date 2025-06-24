import os
import pickle
import numpy as np
import pandas as pd
from typing import Optional, Tuple
from model.walletEtl import get_wallet_features, format_wallet_data_to_numpy

# === Config ===
BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "model/model_pkls", "fico_xgb_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "model/model_pkls", "fico_xgb_scaler.pkl")

# === Load Model + Scaler ===
with open(MODEL_PATH, "rb") as f:
    model = pickle.load(f)
with open(SCALER_PATH, "rb") as f:
    scaler = pickle.load(f)

def convert_wallet_features_to_eth_units(X_wallet: np.ndarray, chain: str) -> np.ndarray:
    """
    Converts avg_tx_value_eth in the wallet-level features to ETH-equivalent,
    depending on the chain the wallet is on.
    """
    conversion_factors = {
        "ethereum": 1.0,                          # baseline
        "sepolia": 1.0,                           # Sepolia testnet (ETH)
        "bnb": 614 / 2189.47,                     # 1 BNB in ETH
        "bsc-testnet": 614 / 2189.47,             # BSC testnet (BNB)
        "flow-evm": 0.34 / 2189.47,               # 1 FLOW in ETH
        "flow-evm-testnet": 0.34 / 2189.47,       # Flow EVM testnet (FLOW)
        "paypalusd": 1 / 2189.47,                 # 1 USD in ETH (legacy)
        "flow": 0.34 / 2189.47                    # Legacy alias for flow-evm
    }
    factor = conversion_factors.get(chain.lower(), 1.0)
    X_wallet = X_wallet.copy()
    X_wallet[2] *= factor  # avg_tx_value_eth (index 2)
    return X_wallet

def convert_tx_features_to_eth_units(tx_matrix: np.ndarray, chain: str) -> np.ndarray:
    """
    Converts tx-level features [value, gas, gasPrice, is_outgoing] into ETH-scale.
    Only value and gasPrice are affected by conversion.
    """
    conversion_rates = {
        "ethereum": 1.0,
        "sepolia": 1.0,
        "bnb": 614 / 2189.47,
        "bsc-testnet": 614 / 2189.47,
        "flow-evm": 0.34 / 2189.47,
        "flow-evm-testnet": 0.34 / 2189.47,
        "paypalusd": 1 / 2189.47,
        "flow": 0.34 / 2189.47
    }

    if chain.lower() not in conversion_rates:
        raise ValueError(f"Unsupported chain for conversion: {chain}")

    rate = conversion_rates[chain.lower()]
    tx_matrix = tx_matrix.copy()
    tx_matrix[:, 0] *= rate  # value
    tx_matrix[:, 2] *= rate  # gasPrice
    return tx_matrix

def predict_fico(wallet_address: str, chain: str = "ethereum") -> float:
    """
    Compute a normalized FICO score (0–100) for a given wallet address and chain.
    Supported chains: 'ethereum', 'bnb', 'paypalusd'
    """
    # --- Step 1: Fetch wallet + tx data from the appropriate chain ---
    summary_df, tx_df = get_wallet_features(wallet_address, chain=chain)

    if summary_df.empty:
        raise RuntimeError(f"❌ No data retrieved for wallet: {wallet_address} on chain: {chain}")

    # --- Step 2: Format into model-compatible features ---
    X_wallet, tx_matrix = format_wallet_data_to_numpy(summary_df, tx_df, wallet_address)

    X_wallet = convert_wallet_features_to_eth_units(X_wallet, chain)

    tx_matrix = np.nan_to_num(tx_matrix, nan=0.0)
    tx_matrix = convert_tx_features_to_eth_units(tx_matrix, chain)

    tx_mean = np.mean(tx_matrix, axis=0)
    tx_std = np.std(tx_matrix, axis=0)

    combined_features = np.concatenate([tx_mean, tx_std, X_wallet], axis=0).reshape(1, -1)

    # --- Step 3: Scale + Predict ---
    X_scaled = scaler.transform(combined_features)
    predicted_fico = model.predict(X_scaled)[0]

    # Normalize to 0–100 (original model trained to ~800 scale)
    normalized_score = np.clip((predicted_fico / 800) * 100, 30, 100)
    return normalized_score

def credit_to_interest_and_loan(fico_score_normalized: float) -> Tuple[Optional[float], float]:
    """
    Bank-style underwriting:
    Returns (interest rate, max loan amount) for given credit score.
    Scores < 60 get rejected (loan = 0, rate = None)
    """

    if fico_score_normalized >= 90:
        return 4.0, 1500.0
    elif fico_score_normalized >= 80:
        return 6.5, 800.0
    elif fico_score_normalized >= 70:
        return 10.0, 200.0
    elif fico_score_normalized >= 60:
        return 15.0, 10.0
    else:
        return None, 0.0  # Rejected

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python run_fico_pipeline.py <wallet_address> [chain]")
        exit(1)

    wallet = sys.argv[1]
    chain = sys.argv[2].lower() if len(sys.argv) > 2 else "ethereum"

    print(f"🔍 Evaluating wallet: {wallet} on chain: {chain}")

    try:
        score = predict_fico(wallet, chain=chain)
        print(f"🎯 Predicted FICO Score (0–100): {score:.1f}")
    except Exception as e:
        print(f"❌ Error during prediction: {str(e)}")