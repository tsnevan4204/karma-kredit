import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler

# Load the CSVs
features_df = pd.read_csv("sim_data/sim_wallet_features.csv")
transactions_df = pd.read_csv("sim_data/sim_transaction_history.csv")

# Sort features to ensure consistent order
features_df = features_df.reset_index(drop=True)
wallets = features_df["wallet"].values

X_tx_matrix = []
y = []

for wallet in wallets:
    wallet_lower = wallet.lower()

    # Append corresponding FICO score
    fico_score = features_df.loc[features_df["wallet"].str.lower() == wallet_lower, "fico_score"].values[0]
    y.append(fico_score)

    # Get txs involving this wallet (either sender or recipient)
    txs = transactions_df[
        (transactions_df["from"].str.lower() == wallet_lower) |
        (transactions_df["to"].str.lower() == wallet_lower)
    ].copy()

    # Clean + convert to float
    txs["value_eth"] = txs["value_eth"].astype(float)
    txs["gas"] = txs["gas"].astype(float)
    txs["gasPrice"] = txs["gasPrice"].astype(float)
    txs["is_outgoing"] = (txs["from"].str.lower() == wallet_lower).astype(int)

    tx_features = txs[["value_eth", "gas", "gasPrice", "is_outgoing"]].values

    # Pad (or trim) to exactly 100 rows with NaNs
    padded = np.full((100, 4), np.nan)
    padded[:min(100, len(tx_features))] = tx_features[:100]
    X_tx_matrix.append(padded)

# Convert to NumPy arrays
X_tx_matrix = np.array(X_tx_matrix)  # (100, 100, 4)
y = np.array(y)                      # (100,)

# Save
np.save("X_tx_matrix.npy", X_tx_matrix)
np.save("y_fico_scores.npy", y)

# Diagnostics
print("X_tx_matrix shape:", X_tx_matrix.shape)
print("y shape:", y.shape)
print("Wallets aligned:", len(wallets) == len(y) == len(X_tx_matrix))

def process_wallet_features(csv_path: str, wallet_list, output_features_npy: str, output_labels_npy: str):
    print(f"📄 Loading wallet-level CSV: {csv_path}")
    df = pd.read_csv(csv_path)

    expected_cols = [
        "wallet",  # <-- Needed for alignment
        "wallet_age_days",
        "tx_count",
        "avg_tx_value_eth",
        "active_days",
        "gitcoin_passport_score",
        "fico_score"
    ]

    missing = [col for col in expected_cols if col not in df.columns]
    if missing:
        raise ValueError(f"❌ Missing expected columns in CSV: {missing}")

    # Normalize casing
    df["wallet"] = df["wallet"].str.lower()
    wallet_list = [w.lower() for w in wallet_list]

    # Filter and reorder df to match wallet_list
    df = df.set_index("wallet")
    df = df.loc[wallet_list]  # Reorder explicitly

    assert list(df.index) == wallet_list, "❌ Wallet ordering mismatch"

    # Extract features and target
    X = df[[
        "wallet_age_days",
        "tx_count",
        "avg_tx_value_eth",
        "active_days",
    ]].to_numpy(dtype=np.float32)

    y = df["fico_score"].to_numpy(dtype=np.float32)

    # Debug print
    print(f"🔍 Alignment Check (first 5 wallets):")
    print(df.head()[["wallet_age_days", "fico_score"]])
    print(f"📏 X shape: {X.shape}, y shape: {y.shape}")

    # Normalize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Save
    np.save(output_features_npy, X_scaled)
    np.save(output_labels_npy, y)
    print("✅ Feature engineering complete.")

wallets = features_df["wallet"].values
process_wallet_features(
    "sim_data/sim_wallet_features.csv",
    wallet_list=wallets,
    output_features_npy="sim_data/X_wallet_features.npy",
    output_labels_npy="sim_data/y_fico_scores.npy"  # or a separate version if needed
)

def process_transaction_history(tx_csv: str, wallet_list: list, output_npy: str):
    print(f"📄 Loading transaction CSV: {tx_csv}")
    transactions_df = pd.read_csv(tx_csv)

    wallet_list = [w.lower() for w in wallet_list]
    X_tx_matrix = []

    for wallet in wallet_list:
        # Get txs involving this wallet
        txs = transactions_df[
            (transactions_df["from"].str.lower() == wallet) |
            (transactions_df["to"].str.lower() == wallet)
        ].copy()

        # Clean + convert to float
        txs["value_eth"] = txs["value_eth"].astype(float)
        txs["gas"] = txs["gas"].astype(float)
        txs["gasPrice"] = txs["gasPrice"].astype(float)
        txs["is_outgoing"] = (txs["from"].str.lower() == wallet).astype(int)

        # Select features
        tx_features = txs[["value_eth", "gas", "gasPrice", "is_outgoing"]].values

        # Pad/truncate to 100 txs
        padded = np.full((100, 4), np.nan)
        padded[:min(100, len(tx_features))] = tx_features[:100]
        X_tx_matrix.append(padded)

    X_tx_matrix = np.array(X_tx_matrix)
    print(f"📦 Transaction matrix shape: {X_tx_matrix.shape}")
    np.save(output_npy, X_tx_matrix)
    print(f"✅ Saved to {output_npy}")

wallets = features_df["wallet"].values

process_transaction_history(
    tx_csv="sim_data/sim_transaction_history.csv",
    wallet_list=wallets,
    output_npy="sim_data/X_tx_matrix.npy"
)