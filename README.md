# 🔮 GenOracle — Decentralized Prediction Market on GenLayer

A fully decentralized prediction market where outcomes are resolved entirely by GenLayer's Intelligent Contracts (GenVM), eliminating the need for slow or biased human oracles.

**Live dApp:** https://genoracle-market-vuov.vercel.app/  
**Smart Contract (StudioNet):** `0xD44aC5c1F0E9DECf2aC1b355bCaAd8EFAB4fC2e2`

---

## ✨ Features (V2)

### Smart Contract (`market.py`)
| Feature | Implementation |
|---|---|
| **Value-backed Positions** | Per-user `yes_positions` / `no_positions` tracked on-chain |
| **Value Custody** | Internal token ledger (`balances`). Bets deduct real tokens |
| **Faucet** | `faucet()` mints 1000 G-USD tokens to any address |
| **Deadlines** | Each market stores a `deadline` (YYYY-MM-DD) |
| **AI Resolution** | `gl.exec_prompt()` inside `gl.vm.run_nondet_unsafe()` — 5 independent validators must reach consensus |
| **Verifiable Sources** | `gl.nondet.web.render(source_url)` fetches real-world data for AI to analyze |
| **Claims & Payouts** | `claim_winnings()` distributes pro-rata rewards. UNKNOWN = full refund |

### Frontend (React + Vite)
- Connect GenLayer wallet
- Faucet G-USD tokens
- Create prediction markets with custom question, source URL, and deadline
- Place YES/NO bets with real token deduction
- Trigger GenLayer AI Oracle resolution
- Claim winnings after resolution

---

## 🏗️ Architecture

```
User → Frontend (React/Vite on Vercel)
          ↓ genlayer-js
     Smart Contract (market.py on GenLayer StudioNet)
          ↓ gl.nondet.web.render()     ↓ gl.exec_prompt()
     Fetch source URL              AI Analysis
          ↓                            ↓
     5 GenLayer Validators reach Deterministic Consensus
          ↓
     Market resolved → YES / NO / UNKNOWN
          ↓
     Winners claim pro-rata payout
```

---

## 🚀 How to Run Locally

```bash
# Clone repo
git clone https://github.com/nikvn89/genoracle-market
cd genoracle-market

# Install dependencies
npm install

# Start dev server
npm run dev
```

---

## 🧪 Demo Flow

1. Open the dApp and click **Connect GenLayer Wallet**
2. Click **💧 Faucet 1000 G-USD** to get tokens
3. Click a **Quick Test Example** (e.g. "Did Argentina win the 2022 FIFA World Cup?")
4. Click **Initialize Market** and wait for blockchain confirmation
5. Place a **BET YES** or **BET NO**
6. Switch to **AI Resolution (Oracle)** tab
7. Click **🤖 Trigger GenLayer AI** — wait for 5 validators to reach consensus
8. Once resolved, click **💰 Claim Winnings**

---

## 📁 Project Structure

```
├── market.py                  # GenLayer Smart Contract (V2)
└── oracle-market-frontend/
    └── src/
        └── App.tsx            # React frontend
```

---

## 🛠️ Tech Stack

- **Smart Contract:** Python on GenLayer (GenVM)
- **Frontend:** React + TypeScript + Vite
- **Deployment:** Vercel
- **Blockchain:** GenLayer StudioNet
