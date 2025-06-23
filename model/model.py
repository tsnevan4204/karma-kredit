import torch
import torch.nn as nn
import numpy as np
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import pickle

# Device setup
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"🖥️ Using device: {device}")

# Parameters
num_epochs = 10
batch_size = 16

# Load data
print("📥 Loading data...")
X_tx = np.load("X_tx_matrix.npy")              # (N, 100, 4)
X_wallet = np.load("X_wallet_features.npy")    # (N, 5)
y = np.load("y_fico_scores.npy")               # (N,)
print(f"✅ X_tx: {X_tx.shape}, X_wallet: {X_wallet.shape}, y: {y.shape}")

# Check alignment
assert X_tx.shape[0] == X_wallet.shape[0] == y.shape[0], "❌ Misaligned data"

# Clean + scale
print("🧼 Cleaning...")
X_tx = np.nan_to_num(X_tx, nan=0.0, posinf=1e6, neginf=-1e6)
X_wallet = np.nan_to_num(X_wallet, nan=0.0, posinf=1e6, neginf=-1e6)
y = np.nan_to_num(y, nan=0.0)

# Flatten for scaling
flat_tx = X_tx.reshape(-1, X_tx.shape[-1])
flat_wallet = X_wallet

scaler_tx = StandardScaler()
flat_tx_scaled = scaler_tx.fit_transform(flat_tx).reshape(X_tx.shape)

scaler_wallet = StandardScaler()
wallet_scaled = scaler_wallet.fit_transform(flat_wallet)

# Combine wallet features into each tx sequence
X_wallet_expanded = np.repeat(wallet_scaled[:, None, :], X_tx.shape[1], axis=1)  # (N, 100, 5)
X_combined = np.concatenate([flat_tx_scaled, X_wallet_expanded], axis=-1)        # (N, 100, 9)

print(f"🔗 Combined input shape: {X_combined.shape}")

# Tensors
X_tensor = torch.tensor(X_combined, dtype=torch.float32)
y_tensor = torch.tensor(y, dtype=torch.float32)

dataset = TensorDataset(X_tensor, y_tensor)
dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

# Model
class TxTransformerFICO(nn.Module):
    def __init__(self, input_dim=9, d_model=64, nhead=4, num_layers=3):
        super().__init__()
        self.input_projection = nn.Linear(input_dim, d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=128,
            dropout=0.1,
            batch_first=True
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.attn_pool = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.Tanh(),
            nn.Linear(64, 1)
        )
        self.regressor = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.ReLU(),
            nn.Linear(64, 1)
        )

    def forward(self, x):
        x = self.input_projection(x)
        x = self.transformer_encoder(x)
        attn_weights = torch.softmax(self.attn_pool(x), dim=1)
        x_pooled = torch.sum(attn_weights * x, dim=1)
        return self.regressor(x_pooled).squeeze(-1)

model = TxTransformerFICO().to(device)
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-2)
criterion = nn.MSELoss()

# Training
print("\n🏋️ Training...")
for epoch in range(num_epochs):
    model.train()
    epoch_losses = []
    for i, (batch_x, batch_y) in enumerate(dataloader):
        batch_x = batch_x.to(device)
        batch_y = batch_y.to(device)

        preds = model(batch_x)
        loss = criterion(preds, batch_y)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        epoch_losses.append(loss.item())
        if i % 10 == 0:
            print(f"🌀 Epoch {epoch+1}, Batch {i}, Loss: {loss.item():.2f}")
    print(f"✅ Epoch {epoch+1} Avg Loss: {np.mean(epoch_losses):.2f}")

# Evaluation
print("\n🧪 Evaluating...")
model.eval()
all_preds, all_targets = [], []

with torch.no_grad():
    for batch_x, batch_y in dataloader:
        batch_x = batch_x.to(device)
        batch_y = batch_y.to(device)

        preds = model(batch_x)
        all_preds.append(preds.cpu().numpy())
        all_targets.append(batch_y.cpu().numpy())

all_preds = np.concatenate(all_preds)
all_targets = np.concatenate(all_targets)

print(f"📏 Predictions: mean={all_preds.mean():.2f}, std={all_preds.std():.2f}")
print(f"🎯 Targets:     mean={all_targets.mean():.2f}, std={all_targets.std():.2f}")

# Metrics
mae = mean_absolute_error(all_targets, all_preds)
r2 = r2_score(all_targets, all_preds)

print("\n📊 Final Metrics:")
print(f"MAE:  {mae:.2f}")
print(f"R²:   {r2:.3f}")

print("\n🔍 Sample Predictions:")
for i in range(10):
    print(f"True: {all_targets[i]:.1f}, Predicted: {all_preds[i]:.1f}")

# Save transaction scaler
with open("scaler_tx.pkl", "wb") as f_tx:
    pickle.dump(scaler_tx, f_tx)

# Save wallet feature scaler
with open("scaler_wallet.pkl", "wb") as f_wallet:
    pickle.dump(scaler_wallet, f_wallet)

print("💾 Saved scalers: scaler_tx.pkl and scaler_wallet.pkl")