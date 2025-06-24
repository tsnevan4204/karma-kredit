import requests
import pandas as pd
from datetime import datetime
import numpy as np
import dotenv
import os

dotenv.load_dotenv()

CHAIN_RPC_URLS = {
    "ethereum": os.getenv("ETHEREUM_URL") or "",
    "sepolia": os.getenv("SEPOLIA_URL")  or "",
    "bnb": os.getenv("BSC_URL") or "",
    "bsc-testnet": os.getenv("BSC_TEST_URL") or "",
    "flow-evm": os.getenv("FLOW_EVM_URL") or "",
    "flow-evm-testnet": os.getenv("ALCHEMY_FLOW_EVM_TEST_URL") or "",
}

def get_rpc_url(chain: str) -> str:
    if chain not in CHAIN_RPC_URLS or not CHAIN_RPC_URLS[chain]:
        raise ValueError(f"No RPC URL configured for chain: {chain}")
    return CHAIN_RPC_URLS[chain]

def get_wallet_age(wallet: str, rpc_url: str) -> int:
    # Skip Alchemy Extended APIs for Flow - go straight to basic methods
    if "flow" in rpc_url.lower():
        print(f"🌊 Using Flow-compatible method for wallet age")
    else:
        # Try alchemy_getAssetTransfers first for other chains
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "alchemy_getAssetTransfers",
            "params": [{
                "fromBlock": "0x0",
                "toBlock": "latest",
                "fromAddress": wallet,
                "category": ["external", "erc20", "erc721", "internal"],
                "maxCount": "100",
                "order": "asc"
            }]
        }
        response = requests.post(rpc_url, json=payload).json()
        print(f"🔍 Wallet age API response: {response}")
        transfers = response.get("result", {}).get("transfers", [])
        
        if transfers:
            ts = transfers[0].get("metadata", {}).get("blockTimestamp")
            if ts:
                tx_time = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
                return (datetime.utcnow() - tx_time).days
    
    print(f"🔍 Using eth_getTransactionCount fallback")
    # Fallback: check if wallet has any transaction count
    count_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getTransactionCount",
        "params": [wallet, "latest"]
    }
    count_response = requests.post(rpc_url, json=count_payload).json()
    print(f"🔍 Transaction count response: {count_response}")
    tx_count = count_response.get("result", "0x0")
    if tx_count == "0x0":
        return 0
    # If wallet has transactions but alchemy_getAssetTransfers didn't find them,
    # estimate age as 1 day (recent wallet)
    return 1

def get_transaction_history(wallet: str, rpc_url: str) -> pd.DataFrame:
    print(f"⚡ Fetching transaction history for wallet: {wallet}")
    wallet = wallet.lower()

    # Get latest block number
    latest_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_blockNumber",
        "params": []
    }
    latest_response = requests.post(rpc_url, json=latest_payload).json()
    latest_block = latest_response.get("result")
    if not latest_block:
        return pd.DataFrame()

    # Pull logs involving this wallet (by address only)
    log_payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "eth_getLogs",
        "params": [{
            "fromBlock": "0x0",
            "toBlock": latest_block,
            "address": wallet,
            "topics": []
        }]
    }

    log_response = requests.post(rpc_url, json=log_payload).json()
    logs = log_response.get("result", [])

    transactions = []
    for log in logs:
        transactions.append({
            "hash": log.get("transactionHash", "unknown"),
            "from": "unknown",
            "to": "unknown",
            "value": 0,
            "timestamp": datetime.utcnow().isoformat(),
            "blockNumber": int(log.get("blockNumber", "0x0"), 16)
        })

    return pd.DataFrame(transactions)


def get_wallet_features(wallet: str, chain: str = "ethereum"):
    print(f"📡 Fetching data for wallet on {chain}: {wallet}")
    wallet = wallet.lower()
    rpc_url = get_rpc_url(chain)
    tx_df = get_transaction_history(wallet, rpc_url)
    age = get_wallet_age(wallet, rpc_url)
    print(f"📆 Wallet age: {age} days | 📈 Transactions: {len(tx_df)}")

    if not tx_df.empty:
        tx_df = tx_df[tx_df["timestamp"].notnull()].copy()
        tx_df["datetime"] = pd.to_datetime(tx_df["timestamp"], errors="coerce")

        if "value" in tx_df.columns:
            ser = pd.to_numeric(tx_df["value"], errors="coerce")
            if isinstance(ser, pd.Series):
                tx_df["value"] = ser.fillna(0).astype(float)
            else:
                tx_df["value"] = 0.0
            tx_df["value_eth"] = tx_df["value"] / 1e18
        else:
            tx_df["value_eth"] = pd.Series([0.0] * len(tx_df), index=tx_df.index)

        tx_df.loc[:, "datetime"] = pd.to_datetime(tx_df["datetime"], errors="coerce")
        datetime_series = pd.Series(tx_df["datetime"])
        active_dates = datetime_series.dropna().dt.normalize()
        active_days = active_dates.nunique()
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

def format_wallet_data_to_numpy(summary_df, tx_df, wallet):
    wallet_row = summary_df.iloc[0]
    X_wallet = np.array([
        wallet_row["wallet_age_days"],
        wallet_row["tx_count"],
        wallet_row["avg_tx_value_eth"],
        wallet_row["active_days"]
    ], dtype=np.float32)

    if not tx_df.empty:
        # Ensure required columns exist (Alchemy doesn't provide gas/gasPrice in asset transfers)
        for col in ["value_eth", "gas", "gasPrice"]:
            if col not in tx_df.columns:
                tx_df[col] = 0.0
            else:
                ser = pd.to_numeric(tx_df[col], errors="coerce")
                if isinstance(ser, pd.Series):
                    tx_df[col] = ser.fillna(0).astype(float)
                else:
                    tx_df[col] = 0.0

        # Handle from/to addresses safely (may not exist in all Alchemy responses)
        tx_df["from"] = tx_df.get("from", "").astype(str).str.lower()
        tx_df["to"] = tx_df.get("to", "").astype(str).str.lower()
        tx_df["is_outgoing"] = (tx_df["from"] == wallet.lower()).astype(int)

        tx_features = tx_df[["value_eth", "gas", "gasPrice", "is_outgoing"]].to_numpy(dtype=np.float32)
    else:
        tx_features = np.empty((0, 4), dtype=np.float32)

    padded_tx = np.full((100, 4), np.nan, dtype=np.float32)
    length = min(len(tx_features), 100)
    padded_tx[:length] = tx_features[:length]

    return X_wallet, padded_tx 