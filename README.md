# GenOracle

**Authority-bound AI prediction markets resolved by GenLayer validator consensus.**

GenOracle is a full-stack GenLayer dApp where users create YES/NO prediction markets, bet with demo G-USD, submit official evidence after the betting deadline, and let GenLayer AI validators adjudicate the result from pre-committed authoritative sources.

The contract then settles the market deterministically and allows winning bettors to claim their share of the pool.


## Build

```bash
npm install       # clean clone, no browser download
npm run build     # tsc -b && vite build
```

Requires Node 18+. `contracts/market.py` is the deployed Intelligent Contract at
`0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7` on GenLayer StudioNet; it is the
only file in `contracts/`. Deploy and probe tooling lives in `scripts/`.

See [CHANGELOG.md](CHANGELOG.md) for what changed in 1.1.0.

## Why GenLayer

Prediction-market resolution often depends on interpreting unstructured official information.

A deterministic smart contract can enforce deadlines, balances, betting rules and payouts, but it cannot reliably answer questions such as:

> Did NASA's Artemis I mission successfully return to Earth?

GenOracle separates the workflow into three layers:

1. **Humans or agents locate official evidence.**
2. **GenLayer validators independently render and interpret that evidence.**
3. **The contract settles YES / NO outcomes deterministically.**

Evidence submitters do **not** submit a verdict. They only provide official URLs under the authoritative domain locked when the market was created.

## Core Flow

```text
Create Market
      ↓
Bet YES / NO
      ↓
Betting Deadline
      ↓
Submit Official Evidence
      ↓
GenLayer AI Validator Consensus
      ↓
RESOLVED_YES / RESOLVED_NO
      ↓
Winner Claims
```

If the evidence is insufficient, the market remains in the evidence phase so new evidence can be added. If no conclusive resolution is reached before expiry, the market fails closed and bettors can reclaim their positions.

## V7 Resolution Model

Each market permanently commits to:

- a natural-language YES/NO question,
- an authoritative domain,
- a betting deadline.

After the deadline:

- anyone may submit an HTTPS URL under the committed domain,
- evidence submissions are permissionless,
- each address may submit at most 2 URLs,
- each market accepts at most 3 evidence URLs,
- duplicate URLs are rejected,
- off-domain URLs are rejected.

GenLayer validators independently fetch the committed evidence and discard irrelevant pages.

For a YES or NO outcome, the AI result must include a **verbatim quote** from the rendered official evidence. Validators independently verify that the quoted text exists in their own render before accepting the verdict.

This reduces the risk of a model resolving a market from prior knowledge instead of the submitted evidence.

## Market States

```text
OPEN
  ↓ deadline
EVIDENCE
  ├── YES evidence consensus → RESOLVED_YES
  ├── NO evidence consensus  → RESOLVED_NO
  ├── UNKNOWN                → remains EVIDENCE
  └── expiry                 → FAILED → refunds
```

## Deterministic Settlement

GenOracle uses a simple pari-mutuel pool.

Example:

```text
YES pool = 200 G-USD
NO pool  = 200 G-USD
Total    = 400 G-USD
```

If YES wins, the YES side shares the full 400 G-USD pool proportionally to its YES positions.

Claims are sender-bound and positions are zeroed after settlement, preventing double claims.

## Supported Authorities

The current V7 demo whitelist includes:

- `fifa.com`
- `uefa.com`
- `nba.com`
- `nfl.com`
- `mlb.com`
- `nhl.com`
- `federalreserve.gov`
- `bls.gov`
- `bea.gov`
- `sec.gov`
- `nasa.gov`
- `ethereum.org`

## First-Time Setup

1. Open the deployed app.
2. Click **Connect Wallet**.
3. MetaMask will connect or switch to **GenLayer Studio Network**.
4. Chain ID: **61999**.
5. Click **Get Demo G-USD** to receive contract-local test credits.

During the current StudioNet tests, transactions finalized successfully while MetaMask displayed a native balance of `0 GEN`. Demo G-USD is internal test credit used by this dApp and is not the network gas token.

## How to Try It

For the fastest reviewer flow, use a historical event with an official page that already exists.

### Example: NASA Artemis I

Create a market:

```text
Market ID:
nasa-artemis-demo

Question:
Did NASA's Artemis I mission successfully return to Earth?

Authority:
nasa.gov

Deadline:
Set approximately 3 minutes in the future
```

Then:

1. Click **Get Demo G-USD**.
2. Create the market.
3. Bet YES or NO before the deadline.
4. Wait for the betting deadline. The UI automatically changes to **EVIDENCE**.
5. Submit an official NASA evidence URL:
   `https://www.nasa.gov/centers-and-facilities/hq/splashdown-nasas-orion-returns-to-earth-after-historic-moon-mission/`
6. Wait for the 1-minute evidence window.
7. Click **Resolve with GenLayer AI** once.
8. The button locks while consensus is pending.
9. The frontend checks accepted onchain state automatically and updates when consensus settles.
10. If your position won, click **Claim Winnings**.

## Tested End-to-End

The final V7 deployment was tested with two MetaMask accounts:

```text
Question:
Did NASA's Artemis I mission successfully return to Earth?

Authority:
nasa.gov

YES pool: 200 G-USD
NO pool:  200 G-USD
```

Observed result:

```text
GenLayer consensus: RESOLVED_YES
Winning YES position: 200 G-USD
Total market pool:    400 G-USD
Winner payout:        400 G-USD
```

The winner's app balance moved from 800 G-USD after betting to 1200 G-USD after claiming, and the claimed position was cleared to zero.

A separate FIFA test also resolved:

```text
Did Argentina win the 2022 FIFA World Cup?
→ RESOLVED_YES
```

using official `fifa.com` evidence and a quote grounded in the rendered source.

## Frontend Safety / UX

The frontend includes:

- automatic StudioNet network handling,
- connected-network display,
- synchronous click locks for write actions,
- persistent double-submit protection for AI resolution,
- automatic accepted-state polling while consensus is pending,
- manual Refresh as a fallback,
- automatic OPEN → EVIDENCE UI transition after the deadline,
- exact date/time deadlines,
- market history,
- evidence counters and limits.

## Deployment

**Website**  
https://genoracle-market.vercel.app

**GitHub**  
https://github.com/nikvn89/genoracle-market

**GenLayer Studio Contract**  
https://explorer-studio.genlayer.com/address/0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7

**Contract address**

```text
0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7
```

This is a StudioNet deployment, so a Project Explorer listing should be treated as **Preview** rather than Live.

## Tech Stack

- GenLayer Intelligent Contracts / GenVM Python
- GenLayer AI-validator consensus
- `gl.nondet.web.render`
- `gl.nondet.exec_prompt`
- `gl.vm.run_nondet_unsafe`
- React
- Vite
- TypeScript
- genlayer-js
- viem
- MetaMask
- Vercel

## Security Properties

- betting is blocked after the deadline,
- sender must match the betting/claim address,
- authority is committed before betting,
- submitted evidence must use HTTPS and match the committed domain,
- duplicate evidence is rejected,
- evidence submission is capped,
- irrelevant evidence should be discarded rather than treated as an UNKNOWN vote,
- YES/NO verdicts require quote-grounded evidence,
- UNKNOWN does not immediately trigger refunds,
- repeat resolution requires new evidence,
- claims zero the user's settled position.

## Limitations

GenOracle relies on the availability and integrity of the authoritative websites selected by market creators. Official pages can change, disappear, become unavailable, or render differently over time.

V7 intentionally does not add token incentives, evidence bonds, reputation systems or a dispute court. The goal is a simple public GenLayer demonstration of permissionless evidence submission, decentralized AI adjudication and deterministic settlement.
