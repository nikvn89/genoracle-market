# GenOracle Market - AI-Governed Prediction Market on GenLayer

GenOracle replaces traditional Oracles with GenLayer’s Intelligent Contracts. Instead of relying on a centralized third party to report outcomes, GenOracle autonomously fetches real-world news using `gl.nondet.web.render` and utilizes GenLayer's LLM Validators to determine the outcome.

## 📁 Repository Structure
- `/src` - The Frontend built with React, Vite, and genlayer-js. Implements a robust Asynchronous Kanban UX to gracefully handle GenLayer's 40-second block times.
- `/contracts` - Contains `market.py`, the GenLayer Intelligent Contract powering the prediction market.

## 🧠 Technical Highlights:
- **Semantic Consensus:** Instead of strict string matching (`strict_eq`), we implemented a custom `validator_fn` via `run_nondet_unsafe`. It parses the AI's JSON output to ensure Validators semantically agree on the outcome ('YES' or 'NO'), eliminating hallucination errors.
- **Fail-safe Logic:** The contract gracefully handles unreachable URLs or malformed AI responses by defaulting to an 'UNKNOWN' state rather than reverting the blockchain transaction.
- **Asynchronous UX:** We implemented a Kanban-style dashboard with background polling. When a user triggers the AI Oracle, the UI moves to a "Processing" state without freezing, delivering a smooth, production-ready Web3 experience.

## 🚀 Live Links
- **Contract Address (StudioNet)**: 0xAF6d04CbcF8E25046ac6118f5Ea9148D9E4D1Ed5
- **Live dApp**: [https://genoracle-market-vuov.vercel.app/](https://genoracle-market-vuov.vercel.app/)
