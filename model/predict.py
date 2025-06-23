import numpy as np
import pandas as pd
import pickle

import os
base_dir = os.path.dirname(__file__)
model_path = os.path.join(base_dir, "model_pkls", "fico_xgb_model.pkl")
scaler_path = os.path.join(base_dir, "model_pkls", "fico_xgb_scaler.pkl")

with open(model_path, "rb") as f:
    model = pickle.load(f)

with open(scaler_path, "rb") as f:
    scaler = pickle.load(f)

features_df = pd.read_csv("real_wallet_features.csv")
transactions_df = pd.read_csv("real_wallet_transactions.csv")

# === Select a wallet to evaluate ===
target_wallet = "0x6086B3E1BcBd6fd02d4f45cbF881e9eb7DbE2F6E".lower()

# === Extract wallet-level features ===
wallet_row = features_df[features_df["wallet"].str.lower() == target_wallet]
if wallet_row.empty:
    raise ValueError(f"❌ Wallet {target_wallet} not found in wallet features CSV")

wallet_features = wallet_row.iloc[0]
wallet_vector = np.array([
    wallet_features["wallet_age_days"],
    wallet_features["tx_count"],
    wallet_features["avg_tx_value_eth"],
    wallet_features["active_days"],
    0.0
], dtype=np.float32)

# === Extract transaction history ===
txs = transactions_df[
    (transactions_df["from"].str.lower() == target_wallet) |
    (transactions_df["to"].str.lower() == target_wallet)
].copy()

# If no transactions found, pad with zeros
if txs.empty:
    tx_mean = np.zeros(4)
    tx_std = np.zeros(4)
else:
    txs["value_eth"] = txs["value_eth"].astype(float)
    txs["gas"] = txs["gas"].astype(float)
    txs["gasPrice"] = txs["gasPrice"].astype(float)
    txs["is_outgoing"] = (txs["from"].str.lower() == target_wallet).astype(int)

    tx_features = txs[["value_eth", "gas", "gasPrice", "is_outgoing"]].to_numpy(dtype=np.float32)
    tx_mean = np.mean(tx_features, axis=0)
    tx_std = np.std(tx_features, axis=0)

# === Combine features ===
combined = np.concatenate([tx_mean, tx_std, wallet_vector]).reshape(1, -1)

# === Step 6: Apply pre-fitted scaler ===
X_scaled = scaler.transform(combined)

# === Step 7: Predict the FICO score ===
predicted_fico = model.predict(X_scaled)[0]
print(f"🎯 Predicted FICO Score: {predicted_fico:.1f}")