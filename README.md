# 🔮 GenOracle V3 — Decentralized Prediction Market on GenLayer

A fully decentralized prediction market where outcomes are resolved entirely by GenLayer's Intelligent Contracts (GenVM). It eliminates the need for slow, manual, or biased human oracles by utilizing LLMs to read real-world news and deterministically resolve markets on-chain.

**Smart Contract (GenVM StudioNet):** `0x2Bc86A7851d384f722Eb7D4137eDa563AC13023c`

---

## ✨ Features (V3)

### 🧠 Intelligent Contract (`market.py`)
| Feature | Implementation |
|---|---|
| **Pari-Mutuel Economics** | Peer-to-peer betting. Winners take the losers' liquidity. Zero-sum game. |
| **Value Custody** | Internal token ledger (`balances`). Bets deduct real G-USD tokens. |
| **AI Time-Lock (`TOO_EARLY`)** | Real `datetime.date.today()` comparison in contract — blocks resolution before deadline. Funds remain locked. |
| **Autonomous AI Oracle** | Multi-Agent Tribunal (Searcher → Researcher → Chief Judge) resolves markets without human intervention. |
| **Verifiable Sources** | DuckDuckGo HTML search via `gl.nondet.web.render()` — no Captcha, no blocks. |
| **Bet Deadline Lock** | `place_bet()` rejects bets after the settlement deadline at contract level. |
| **Claims & Refunds** | Pro-rata payout for winners. `FAILED` markets trigger 100% refund for all participants. |

### 💻 Frontend (React + Vite)
- Connect GenLayer wallet (Auto-generated in memory)
- **Wallet Switcher**: Switch between Wallet A and Wallet B to easily simulate multiplayer Pari-Mutuel betting.
- **Smart Polling**: UI automatically polls the GenLayer blockchain to wait for block consensus before displaying success messages.
- **Global Leaderboard**: Ranks users based on their on-chain G-USD balance.
- Create professional markets, place YES/NO bets, trigger AI resolution, and claim winnings.

---

## 🏗️ Architecture

```
User → Frontend (React/Vite on Vercel)
          ↓ genlayer-js
     Smart Contract (market.py on GenLayer StudioNet)
          ↓ gl.nondet.web.render()     ↓ gl.nondet.exec_prompt()
     Agent 1: Search Strategy          Agent 2: Fact Extraction
          ↓                            ↓
     Agent 3: Chief Judge evaluates facts (YES/NO/UNKNOWN/TOO_EARLY)
          ↓
     5 GenLayer Validators reach Deterministic Consensus
          ↓
     Winners claim pro-rata payout (or full refund if UNKNOWN)
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

## 🧪 Demo Flow (The "Zero-Sum Game" Test)

To fully experience the DeFi Pari-Mutuel mechanics, follow this exact flow:

1. Open the dApp. You will start as **🧑 Wallet A**.
2. Click **🏦 Request 1000 G-USD** to fund your wallet.
3. Use the professional interface to create a market, or use one of the pre-seeded markets.
4. Place a **100 G-USD** bet on **YES**. *(Watch the YES pool increase).*
5. Use the **Wallet Switcher** at the top header to switch to **🕵️ Wallet B**.
6. Click **Faucet** to fund Wallet B.
7. Place a **500 G-USD** bet on **NO**. *(Total Pool becomes 600).*
8. Switch to the **AI TRIBUNAL RESOLUTION** tab.
9. Click **🤖 Summon Autonomous Tribunal** — wait for validators to reach consensus.
10. Once resolved to `RESOLVED_YES`, click **💰 Claim Payout** as Wallet B. (You will get an error because you lost).
11. Switch back to **🧑 Wallet A** and click **💰 Claim Payout**.
12. Watch Wallet A's balance jump to **1500 G-USD** and climb to Rank #1 on the **Global Leaderboard**!

---

## 📁 Project Structure

```
├── contracts/
│   └── market.py              # GenLayer Smart Contract (V3 Multi-Agent)
├── src/
│   ├── App.tsx                # React frontend application
│   └── index.css              # Cyberpunk UI styling
├── deploy_rpc.mjs             # Deployment script for GenLayer
└── seed_markets.mjs           # Script to populate initial professional markets
```
