# 🔮 GenOracle — AI-Powered Prediction Market on GenLayer

A fully on-chain prediction market where outcomes are resolved autonomously by GenLayer's Intelligent Contracts. No human oracles. No off-chain servers. The AI reads real-world sources (Wikipedia) and reaches deterministic consensus across 5 validators.

**Live Demo:** https://genoracle-market-nik.vercel.app/
**Smart Contract (GenVM StudioNet):** `0x65581AA3AB5d064571F8EF48D74451Be1cFF9a68`
**GitHub:** https://github.com/nikvn89/genoracle-market

---

## ✨ Key Features

### 🧠 Intelligent Contract (`contracts/market.py`)

| Feature | Implementation |
|---|---|
| **AI Oracle** | Multi-agent system: URL Strategist → Fact Extractor → Chief Judge resolves markets using `gl.nondet.web.render()` on Wikipedia |
| **Multi-Agent Consensus** | `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` — 5 validators independently verify the result |
| **Pari-Mutuel Economics** | Winners take losers' pool proportionally. Real zero-sum game with on-chain token ledger |
| **Deadline Enforcement** | `resolve_market()` checks `date.today() > deadline` — blocks resolution before event closes |
| **Funds Lock** | `CLOSED_FOR_BETTING` status freezes all positions until AI resolves |
| **Sender Verification** | `place_bet()` and `claim_winnings()` verify `gl.message.sender_address == user_addr` |
| **One-Time Faucet** | `claimed_faucet` prevents double-claiming. Re-claim allowed if balance drops below 200 G-USD |
| **FAILED Refunds** | If AI returns UNKNOWN/cannot resolve → 100% refund to all participants |
| **Division-by-Zero Guard** | If winning pool = 0, falls back to full refund |

### 💻 Frontend (React + Vite + TypeScript)

- **Wallet Switcher** — switch between Wallet A and Wallet B to simulate multiplayer betting
- **Load Example** dropdown — auto-fills form with 3 test scenarios (past event YES, past event YES, future LOCKED)
- **AI Tribunal tab** — kanban-style: Pending → Processing → Final Rulings
- **Funds Locked UI** — shows countdown when deadline hasn't passed yet
- **Smart polling** — waits for GenLayer consensus before showing success
- **Global Leaderboard** — ranks users by on-chain G-USD balance

---

## 🏗️ Architecture

```
User → Frontend (React/Vite on Vercel)
          ↓ genlayer-js RPC
     Smart Contract (market.py on GenLayer StudioNet)
          ↓ gl.nondet.web.render()      ↓ gl.nondet.exec_prompt()
     Wikipedia Direct Fetch         LLM Reasoning (3 agents)
          ↓                              ↓
     5 GenLayer Validators reach Deterministic Consensus
          ↓
     Market resolved YES/NO/FAILED on-chain
          ↓
     Winners claim pro-rata payout. FAILED → full refund.
```

---

## 🧪 How to Test (Judge's Guide)

### Pre-seeded markets (ready to resolve)
Two markets are pre-seeded with real 2-sided pools. Go to **AI TRIBUNAL RESOLUTION** tab → click **🤖 Summon Autonomous Tribunal**.

### Full flow test
1. Open https://genoracle-market-nik.vercel.app/
2. Click **Wallet A** → **🏦 Request 1000 G-USD** (faucet)
3. Use **📋 Load example** dropdown → select any scenario → click **🚀 Initialize**
4. Place a **YES** bet as Wallet A
5. Switch to **Wallet B** → click **🏦 Request 1000 G-USD** (or **🔄 Top Up** if already claimed with low balance) → place **NO** bet
6. Go to **AI TRIBUNAL RESOLUTION** → **Close Betting** → **Summon Tribunal**
7. AI reads Wikipedia, reaches consensus, resolves market
8. Switch back to **Wallet A** → **💰 Claim Payout** → balance increases

### 3 Test Scenarios (via Load Example dropdown)

| Scenario | Expected AI Result | Tests |
|---|---|---|
| 🏆 Argentina World Cup 2022 | **YES** | Past event resolution, winner payout |
| 🏅 Paris Olympics 2024 | **YES** | Past event resolution, correct math |
| 🚀 LA Olympics 2028 | **LOCKED** (deadline 2028-09-30) | Funds frozen, no early resolve |

### Custom question
Fill in any factual question + deadline + click Initialize. AI will autonomously determine the best Wikipedia article to verify the answer.

---

## 🚀 Run Locally

```bash
git clone https://github.com/nikvn89/genoracle-market
cd genoracle-market
npm install
npm run dev
# App runs at http://localhost:5173
# Proxies /api/rpc → GenLayer StudioNet
```

To re-seed demo markets:
```bash
node seed_markets.mjs
```

To redeploy contract:
```bash
node deploy_rpc.mjs
```

---

## 📁 Project Structure

```
├── contracts/
│   └── market.py          # GenLayer Intelligent Contract (multi-agent AI oracle)
├── src/
│   ├── App.tsx            # React frontend
│   └── index.css          # Cyberpunk UI
├── deploy_rpc.mjs         # Contract deployment script
├── seed_markets.mjs       # Seeds 2 demo markets with real 2-sided pools
└── vite.config.ts         # Vite + proxy config
```

---

## 🔐 Security Properties Verified

- ✅ Betting bound to `gl.message.sender_address` (no proxy bets)
- ✅ Claiming bound to `gl.message.sender_address` (no proxy claims)  
- ✅ Deadline enforced in contract before resolution
- ✅ Faucet one-time per address
- ✅ Division-by-zero protected in payout math
- ✅ Double-claim protected (positions zeroed after claim)
