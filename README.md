# 🔮 GenOracle — AI-Adjudicated Prediction Markets on GenLayer

GenOracle is an authority-bound prediction market built with GenLayer Intelligent Contracts.

Users create YES/NO markets, place demo G-USD bets, and lock positions until the settlement deadline. Once betting is closed, GenLayer's AI-powered validators evaluate real-world evidence from the market's predefined authoritative domain and reach consensus on the final outcome.

Instead of trusting a centralized market operator to manually decide the result, GenOracle uses GenLayer as the adjudication layer.

**Live Demo:** https://genoracle-market-nik.vercel.app/

**Intelligent Contract (GenLayer Studionet):**  
`0xfB95876f2537df9ecD95D41cCc29bD1465691D4E`

**Contract Explorer:**  
https://explorer-studio.genlayer.com/address/0xfB95876f2537df9ecD95D41cCc29bD1465691D4E

**GitHub:**  
https://github.com/nikvn89/genoracle-market

---

## First-time setup

GenOracle runs on **GenLayer Studionet**. The frontend now checks the connected wallet network and asks MetaMask to switch to, or add, Studionet automatically when you connect.

```text
Network: GenLayer Studio Network
Chain ID: 61999 (0xf22f)
RPC: https://studio.genlayer.com/api
Native currency: GEN
Explorer: https://explorer-studio.genlayer.com
```

The app also shows the connected network and the wallet's native GEN balance in the header. Demo **G-USD** is contract test credit and is separate from native GEN.

If MetaMask reports insufficient funds for a Studionet write, fund the same test address with the built-in Studionet GEN faucet available in the GenLayer Studio account selector (💧), then reconnect or refresh the app. The public Asimov/Bradbury faucet is not a Studionet faucet.

For browser RPC calls, the deployed app uses a same-origin `/api/rpc` proxy by default; MetaMask itself is configured with the absolute Studionet RPC shown above.

---

## 🎯 The Problem

Prediction markets ultimately depend on one critical question:

**Who decides what actually happened?**

Traditional prediction markets usually rely on centralized operators, manually selected oracle feeds, or predefined data providers.

That works well for simple numerical data, but many real-world outcomes require interpretation of web evidence.

Examples:

- Did a team win a tournament?
- Did an organization officially announce an event?
- Did a regulator approve something?
- Did an authority confirm a particular outcome?

These questions may have clear real-world answers while still requiring contextual interpretation of authoritative information.

GenOracle uses GenLayer to adjudicate these outcomes.

---

## 💡 How GenOracle Works

Every market contains:

- a unique Market ID
- a YES/NO prediction question
- an authoritative domain
- a settlement deadline
- YES and NO betting pools
- individual wallet positions

The authoritative domain is locked when the market is created.

For example:

```text
Question:
Did Argentina win the 2022 FIFA World Cup?

Authoritative domain:
fifa.com
```

When the market is resolved, the Intelligent Contract evaluates evidence under that authority policy.

The leader evaluates the evidence and GenLayer validators independently verify the resolution.

The accepted result becomes:

```text
RESOLVED_YES
```

or

```text
RESOLVED_NO
```

If authoritative evidence is insufficient:

```text
FAILED
```

A failed resolution allows participants to reclaim their positions.

---

## 🧠 GenLayer Intelligent Contract

The core logic lives in the GenLayer Intelligent Contract.

### Authority-Bound Resolution

Each market permanently records its authoritative domain.

Resolution evidence must come from that domain or its subdomains.

This prevents arbitrary sources from being substituted during settlement.

Examples of supported authorities include:

```text
fifa.com
nba.com
nfl.com
uefa.com
sec.gov
federalreserve.gov
nasa.gov
who.int
```

The frontend provides a curated authority selector, while the contract remains the enforcement layer.

### AI + Validator Consensus

Resolution uses GenLayer nondeterministic execution.

The leader:

1. accesses the authoritative source,
2. evaluates the market question against the evidence,
3. produces an exact verdict.

Validators independently evaluate the resolution under the same authority policy.

Only the expected verdict labels are accepted.

This makes GenOracle more than a frontend calling an LLM: the outcome becomes part of GenLayer's consensus execution.

### Resolution Evidence

Resolved markets store:

- final status
- authoritative source
- AI resolution reason

The frontend exposes this information in **Market History**, allowing users and reviewers to inspect why a market was resolved.

---

## 💰 Prediction Market Economics

GenOracle uses demo **G-USD** for testing.

Users can request G-USD from the built-in faucet and place positions on:

```text
YES
```

or

```text
NO
```

Each wallet's position is tracked independently.

Example:

```text
Wallet A
YES: 100 G-USD

Wallet B
NO: 100 G-USD
```

The market then displays:

```text
YES Pool: 100 G-USD
NO Pool: 100 G-USD
```

After resolution, winning participants can claim their payout.

Payouts follow pari-mutuel logic: the losing pool is distributed proportionally among winning positions.

If a market cannot be resolved and enters `FAILED`, participants can claim refunds.

---

## ⏳ Market Lifecycle

```text
CREATE MARKET
      ↓
    OPEN
      ↓
Users bet YES / NO
      ↓
Settlement deadline passes
      ↓
CLOSED_FOR_BETTING
      ↓
AI + Validator Resolution
      ↓
 ┌────────────┬────────────┬─────────┐
 │            │            │         │
RESOLVED_YES RESOLVED_NO  FAILED
 │            │            │
Winner Claim Winner Claim Refund
```

Betting cannot continue after the market deadline.

Resolution only becomes available after betting has closed.

---

## 🛡️ Market Limits

To keep the public market list manageable, GenOracle separates active markets from historical markets.

The current frontend policy displays:

```text
Maximum active markets: 50
Maximum active markets per creator: 5
```

Resolved and failed markets automatically leave the **Active Markets** section and remain accessible through **Market History**.

Historical markets therefore remain auditable without permanently cluttering the active trading interface.

---

## 📜 Market History

Completed markets are retained rather than deleted.

Market History includes:

- `RESOLVED YES`
- `RESOLVED NO`
- `FAILED`
- prediction question
- authoritative domain
- deadline
- YES/NO pools

Selecting a completed market displays its adjudication details:

```text
Authoritative Source
AI Resolution Reason
Final Verdict
```

History is global contract state and remains visible regardless of which wallet is connected.

The interface initially keeps history collapsed and displays historical markets progressively.

---

## 👛 Wallet-Specific Positions

Market state is global, but user positions are wallet-specific.

The frontend displays:

```text
Your YES
Your NO
```

Switching wallets therefore changes the personal position while preserving the same global market and history.

This allows GenOracle to support genuine multi-wallet prediction-market interaction.

---

## 🧪 Verified Tests

### Historical AI Resolution

A historical market was created:

```text
Market ID:
final-ai-test-04

Question:
Did Argentina win the 2022 FIFA World Cup?

Authority:
fifa.com

Deadline:
2026-08-10
```

The market successfully reached:

```text
RESOLVED_YES
```

The contract stored the authoritative source:

```text
https://www.fifa.com/tournaments/mens/worldcup/qatar2022
```

and the resolution reason:

```text
YES — verified from authoritative source
```

This verifies that GenOracle can adjudicate a known historical outcome using the configured authoritative source.

### Two-Wallet Betting

A separate active market was tested using two wallets.

```text
Wallet A:
YES 100 G-USD

Wallet B:
NO 100 G-USD
```

Resulting market state:

```text
YES Pool: 100 G-USD
NO Pool: 100 G-USD
```

When Wallet B was connected, the frontend correctly displayed:

```text
Your YES: 0 G-USD
Your NO: 100 G-USD
```

This verifies independent wallet positions and two-sided market accounting.

### Deadline Enforcement

Markets expose a settlement deadline.

Before that deadline:

- betting remains available
- closing betting is unavailable

After the deadline:

- new betting is blocked
- the market can proceed toward settlement and AI resolution

### Resolution Auditability

A resolved market remains available in Market History with:

- final verdict
- authoritative source
- AI resolution reason

This allows the adjudication result to be inspected after settlement.

---

## ✨ Frontend Features

The React frontend provides:

- Wallet connection
- Demo G-USD faucet
- Market creation
- Curated authoritative-domain selector
- YES/NO betting
- Global YES/NO pools
- Wallet-specific positions
- Deadline-aware betting controls
- Close Betting
- AI Resolve
- Claim Winnings
- Failed-market refunds
- Active Markets
- Market History
- Authoritative source display
- AI resolution explanation
- Active-market counters

The Claim button is only shown when the connected wallet has a winning or refundable position.

---

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │        User         │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ React / Vite UI     │
                    │ genlayer-js + viem  │
                    └──────────┬──────────┘
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ GenLayer Intelligent      │
                 │ Contract                  │
                 │                           │
                 │ Markets                   │
                 │ Positions                 │
                 │ G-USD balances            │
                 │ Deadlines                 │
                 │ Authority policy          │
                 └─────────────┬─────────────┘
                               │
                     Resolution requested
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ Authoritative Web Source  │
                 │ e.g. fifa.com             │
                 └─────────────┬─────────────┘
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ GenLayer AI Validators    │
                 │                           │
                 │ Leader evaluation         │
                 │ Independent verification  │
                 │ Consensus                 │
                 └─────────────┬─────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │ YES / NO / FAILED              │
              │ + Source                       │
              │ + Resolution Reason            │
              └───────────────┬────────────────┘
                              │
                              ▼
                   Claim Winnings / Refund
```

---

## 🔐 Safety & Integrity Properties

GenOracle includes several safeguards:

- Betting positions are associated with individual wallets.
- Market authority is fixed at creation.
- Resolution evidence is restricted by the authority policy.
- Betting deadlines are enforced.
- Positions are locked during settlement.
- Resolved outcomes retain their evidence source.
- Failed adjudication enables refunds.
- Winning claims depend on the wallet's recorded position.
- Historical markets remain publicly inspectable.
- Active-market limits reduce UI/state abuse.

---

## 🚀 Run Locally

Clone the repository:

```bash
git clone https://github.com/nikvn89/genoracle-market
cd genoracle-market
```

Install dependencies:

```bash
npm install
```

Start development mode:

```bash
npm run dev
```

The Vite development server will provide the local URL, normally:

```text
http://localhost:5173
```

Production build:

```bash
npm run build
```

---

## 📁 Project Structure

```text
genoracle-market/
│
├── contracts/
│   └── market.py
│
├── src/
│   ├── App.tsx
│   ├── index.css
│   └── lib/
│       ├── genlayer.ts
│       └── config.ts
│
├── package.json
├── vite.config.ts
├── README.md
└── TESTING.md
```

---

## 🌐 Deployment

### GenLayer Studionet

Current Intelligent Contract:

```text
0xfB95876f2537df9ecD95D41cCc29bD1465691D4E
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0xfB95876f2537df9ecD95D41cCc29bD1465691D4E
```

### Frontend

The frontend is deployed on Vercel:

```text
https://genoracle-market-nik.vercel.app/
```

---

## 🔮 Why GenLayer?

The difficult part of a prediction market is not storing bets.

A normal deterministic smart contract can already do that.

The difficult part is determining:

> **What actually happened in the real world?**

That may require reading web information, understanding natural language, evaluating evidence, and reaching agreement on an ambiguous real-world claim.

GenOracle delegates that problem to GenLayer.

The contract combines deterministic market state and payout rules with nondeterministic AI adjudication and validator consensus.

That makes GenOracle an example of a prediction-market primitive where **AI consensus is part of the settlement mechanism rather than an external oracle service.**