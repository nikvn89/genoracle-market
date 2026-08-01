# 🔮 GenOracle V2 — Decentralized Prediction Market on GenLayer

A fully decentralized prediction market where outcomes are resolved entirely by GenLayer's Intelligent Contracts (GenVM). It eliminates the need for slow, manual, or biased human oracles by utilizing LLMs to read real-world news and deterministically resolve markets on-chain.

**Smart Contract (GenVM StudioNet):** `0x5AeFD2B7F70D7951Fb76A37fA4660311cfD747a0`

---

## ✨ Features (V2)

### 🧠 Intelligent Contract (`market.py`)
| Feature | Implementation |
|---|---|
| **Pari-Mutuel Economics** | Peer-to-peer betting. Winners take the losers' liquidity. Zero-sum game. |
| **Value Custody** | Internal token ledger (`balances`). Bets deduct real G-USD tokens. |
| **Faucet Mechanism** | `faucet()` mints 1000 G-USD tokens for testing. |
| **Autonomous AI Oracle** | `gl.nondet.exec_prompt()` resolves markets automatically by analyzing the web. |
| **LLM Hallucination Safe-guard** | Built-in string parser inside GenVM Python contract to strip Markdown code blocks injected by LLMs (e.g., \`\`\`json), preventing the contract from crashing. |
| **Verifiable Sources** | `gl.nondet.web.render(source_url)` fetches real-world data to be analyzed. Auto web search fallback. |
| **Claims & Refunds** | `claim_winnings()` distributes pro-rata rewards. UNKNOWN/FAILED outcomes trigger full refunds. |

### 💻 Frontend (React + Vite)
- Connect GenLayer wallet (Auto-generated in memory)
- **Wallet Switcher**: Switch between Wallet A and Wallet B in the same window to easily simulate multiplayer Pari-Mutuel betting.
- **Smart Polling**: UI automatically polls the GenLayer blockchain to wait for block consensus before displaying success messages.
- **Global Leaderboard**: Ranks users based on their on-chain G-USD balance.
- Create markets, place YES/NO bets, trigger AI resolution, and claim winnings.

---

## 🏗️ Architecture

```
User → Frontend (React/Vite on Vercel)
          ↓ genlayer-js
     Smart Contract (market.py on GenLayer StudioNet)
          ↓ gl.nondet.web.render()     ↓ gl.nondet.exec_prompt()
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

## 🧪 Demo Flow (The "Zero-Sum Game" Test)

To fully experience the DeFi Pari-Mutuel mechanics, follow this exact flow:

1. Open the dApp. You will start as **🧑 Wallet A**.
2. Click **💧 Faucet 1000 G-USD** to fund your wallet.
3. Click a **Quick Test Example** (e.g. "Did Argentina win the 2022 FIFA World Cup?").
4. Click **Initialize Market** and wait for blockchain confirmation.
5. Place a **100 G-USD** bet on **YES**. *(Watch the YES pool increase).*
6. Use the **Wallet Switcher** at the top header to switch to **🕵️ Wallet B**.
7. Click **Faucet** to fund Wallet B.
8. Place a **500 G-USD** bet on **NO**. *(Total Pool becomes 600).*
9. Switch to the **AI Resolution (Oracle)** tab.
10. Click **🤖 Trigger GenLayer AI** — wait for validators to reach consensus.
11. Once resolved to `RESOLVED_YES`, click **💰 Claim Payout** as Wallet B. (You will get an error because you lost).
12. Switch back to **🧑 Wallet A** and click **💰 Claim Payout**.
13. Watch Wallet A's balance jump to **1500 G-USD** and climb to Rank #1 on the **Global Leaderboard**!

---

## 📁 Project Structure

```
├── contracts/
│   └── market.py              # GenLayer Smart Contract (V2)
├── src/
│   ├── App.tsx                # React frontend application
│   └── index.css              # Cyberpunk UI styling
└── deploy_rpc.mjs             # Deployment script for GenLayer
```
