import requests
import pandas as pd
from datetime import datetime
import numpy as np
import dotenv
import os

dotenv.load_dotenv()

ETHERSCAN_API_KEY = os.getenv("ETHERSCAN_API_KEY")
BSCSCAN_API_KEY = os.getenv("BSCSCAN_API_KEY")
BASE_ETH_URL = os.getenv("BASE_ETH_URL", "https://api.etherscan.io/api")
BASE_BNB_URL = os.getenv("BASE_BNB_URL", "https://api.bscscan.com/api")
PAYPAL_USD_CONTRACT = os.getenv("PAYPAL_USD_CONTRACT", "").lower()  # ERC-20 address

def get_scan_url(chain: str) -> str:
    if chain == "ethereum":
        return BASE_ETH_URL
    elif chain == "bnb":
        return BASE_BNB_URL
    else:
        raise ValueError(f"Unsupported chain: {chain}")

def get_api_key(chain: str) -> str:
    if chain == "ethereum":
        if not ETHERSCAN_API_KEY:
            raise ValueError("ETHERSCAN_API_KEY environment variable not set")
        return ETHERSCAN_API_KEY
    elif chain == "bnb":
        if not BSCSCAN_API_KEY:
            raise ValueError("BSCSCAN_API_KEY environment variable not set")
        return BSCSCAN_API_KEY
    else:
        raise ValueError(f"No API key available for chain: {chain}")

# Wallet age
def get_wallet_age(wallet: str, base_url: str, api_key: str) -> int:
    url = (
        f"{base_url}?module=account&action=txlist"
        f"&address={wallet}&startblock=0&endblock=99999999&page=1&offset=1"
        f"&sort=asc&apikey={api_key}"
    )
    response = requests.get(url).json()
    txs = response.get("result", [])
    if not txs:
        return 0
    first_tx_time = int(txs[0]["timeStamp"])
    age_days = (datetime.utcnow() - datetime.utcfromtimestamp(first_tx_time)).days
    return age_days

# Generic transaction history (ETH or BNB)
def get_transaction_history(wallet: str, base_url: str, api_key: str) -> pd.DataFrame:
    url = (
        f"{base_url}?module=account&action=txlist"
        f"&address={wallet}&startblock=0&endblock=99999999"
        f"&page=1&offset=100&sort=desc&apikey={api_key}"
    )
    response = requests.get(url).json()
    txs = response.get("result", [])
    if not isinstance(txs, list):
        return pd.DataFrame()  # Fallback on malformed response
    df = pd.DataFrame(txs)
    if not df.empty and "timeStamp" in df.columns:
        df["timeStamp"] = df["timeStamp"].astype(int)
        df = df.sort_values("timeStamp", ascending=False)
    return df

# ERC-20 Token Transfer History
def get_erc20_transfers(wallet: str, base_url: str, api_key: str, token_contract: str) -> pd.DataFrame:
    url = (
        f"{base_url}?module=account&action=tokentx"
        f"&address={wallet}&contractaddress={token_contract}"
        f"&page=1&offset=100&sort=desc&apikey={api_key}"
    )
    response = requests.get(url).json()
    txs = response.get("result", [])
    df = pd.DataFrame(txs)
    if not df.empty and "timeStamp" in df.columns:
        df["timeStamp"] = df["timeStamp"].astype(int)
        df = df.sort_values("timeStamp", ascending=False)
    return df

# Main entry: returns features and transactions
def get_wallet_features(wallet: str, chain: str = "ethereum"):
    print(f"📡 Fetching data for wallet on {chain}: {wallet}")

    wallet = wallet.lower()
    
    # Handle Flow EVM testnet and other unsupported chains with mock data
    if chain in ["flow-evm-testnet", "flow", "flow-evm"]:
        print(f"⚠️  Chain {chain} not supported by API, using mock data")
        # Return mock data for Flow EVM testnet
        feature_vector = {
            "wallet": wallet,
            "wallet_age_days": 30,  # Mock 30 days
            "tx_count": 5,          # Mock 5 transactions
            "avg_tx_value_eth": 0.1, # Mock average value
            "active_days": 10       # Mock 10 active days
        }
        # Create mock transaction DataFrame
        mock_tx_data = {
            "hash": [f"0x{i:064x}" for i in range(5)],
            "from": [wallet if i % 2 == 0 else f"0x{'1' * 40}" for i in range(5)],
            "to": [f"0x{'2' * 40}" if i % 2 == 0 else wallet for i in range(5)],
            "value_eth": [0.1, 0.2, 0.05, 0.3, 0.15],
            "timeStamp": [1700000000 + i * 86400 for i in range(5)],  # Mock timestamps
            "gas": [21000] * 5,
            "gasPrice": [20000000000] * 5
        }
        tx_df = pd.DataFrame(mock_tx_data)
        tx_df["datetime"] = pd.to_datetime(tx_df["timeStamp"], unit="s")
        return pd.DataFrame([feature_vector]), tx_df

    try:
        base_url = get_scan_url(chain)
        api_key = get_api_key(chain)

        if chain == "paypalusd":
            tx_df = get_erc20_transfers(wallet, base_url, api_key, PAYPAL_USD_CONTRACT)
        else:
            tx_df = get_transaction_history(wallet, base_url, api_key)

        age = get_wallet_age(wallet, base_url, api_key)
        print(f"📆 Wallet age: {age} days | 📈 Transactions: {len(tx_df)}")

        if not tx_df.empty:
            tx_df["datetime"] = pd.to_datetime(tx_df["timeStamp"], unit="s")
            if "value" in tx_df.columns:
                tx_df["value_eth"] = tx_df["value"].astype(float) / 1e18
            else:
                tx_df["value_eth"] = 0.0
            active_days = tx_df["datetime"].dt.date.nunique()
            avg_tx_value = tx_df["value_eth"].mean()
            tx_count = len(tx_df)
        else:
            active_days = 0
            avg_tx_value = 0.0
            tx_count = 0

        feature_vector = {
            "wallet": wallet,
            "wallet_age_days": age,
            "tx_count": tx_count,
            "avg_tx_value_eth": avg_tx_value,
            "active_days": active_days
        }

        return pd.DataFrame([feature_vector]), tx_df
    
    except Exception as e:
        print(f"❌ Error fetching wallet data: {e}")
        # Return empty data on error
        feature_vector = {
            "wallet": wallet,
            "wallet_age_days": 0,
            "tx_count": 0,
            "avg_tx_value_eth": 0.0,
            "active_days": 0
        }
        return pd.DataFrame([feature_vector]), pd.DataFrame()

# Format for model
def format_wallet_data_to_numpy(summary_df, tx_df, wallet):
    wallet_row = summary_df.iloc[0]
    X_wallet = np.array([
        wallet_row["wallet_age_days"],
        wallet_row["tx_count"],
        wallet_row["avg_tx_value_eth"],
        wallet_row["active_days"]
    ], dtype=np.float32)

    if not tx_df.empty:
        tx_df["value_eth"] = tx_df.get("value_eth", 0).astype(float)
        tx_df["gas"] = tx_df.get("gas", 0).astype(float)
        tx_df["gasPrice"] = tx_df.get("gasPrice", 0).astype(float)
        tx_df["from"] = tx_df["from"].str.lower()
        tx_df["to"] = tx_df["to"].str.lower()
        tx_df["is_outgoing"] = (tx_df["from"] == wallet.lower()).astype(int)

        tx_features = tx_df[["value_eth", "gas", "gasPrice", "is_outgoing"]].fillna(0).to_numpy(dtype=np.float32)
    else:
        tx_features = np.empty((0, 4), dtype=np.float32)

    padded_tx = np.full((100, 4), np.nan, dtype=np.float32)
    length = min(len(tx_features), 100)
    padded_tx[:length] = tx_features[:length]

    return X_wallet, padded_tx