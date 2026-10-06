# TESTING — GenOracle

## Contract V8 (current) — on-chain run

⟨Fill from the StudioNet run, then delete this line.⟩

```text
Contract V8:   ⟨V8 address⟩
Deploy tx:     ⟨hash⟩
Source SHA-256 fe5c4c086e45414d6b222087d77e66e1d12f7949294f1152be3999b68379cc80
Frontend:      https://genoracle-market.vercel.app (pointed at V8)
```

Market `artemis-v8-01` — *Did NASA's Orion spacecraft splash down in the Pacific
Ocean at the end of the Artemis I mission?* — authority `nasa.gov`. Wallet A
creates and bets YES, wallet B bets NO.

| # | Where / wallet | Action | Expected | Tx hash | Result |
|---|---|---|---|---|---|
| 1 | Studio | deploy `contracts/market.py` V8 | address; `get_config` reports `contract_version 8.0.0`, `clock_source transaction_datetime`, `max_resolution_attempts 3` | ⟨tx⟩ | ⟨result⟩ |
| 2 | app · A, B | Get Demo G-USD (each) | 1000 G-USD each | ⟨tx⟩ ⟨tx⟩ | ⟨result⟩ |
| 3 | app · A | create `artemis-v8-01`, deadline ≈ 3 minutes ahead | OPEN; `created_at` equals the transaction's timestamp in the explorer (**GO-3**) | ⟨tx⟩ | ⟨result⟩ |
| 4 | app · A / B | bet YES 200 / bet NO 200 | pools 200 / 200 | ⟨tx⟩ ⟨tx⟩ | ⟨result⟩ |
| 5 | app · A | after the deadline, submit `https://www.nasa.gov/blogs/missions/2022/12/11/artemis-i-flight-day-26-orion-splashes-down-concluding-historic-artemis-i-mission/` | accepted; UI shows *Recorded as `nasa.gov/blogs/missions/…-mission`* | ⟨tx⟩ | ⟨result⟩ |
| 6 | Studio · B | `submit_evidence("artemis-v8-01", "https://nasa.gov/blogs/missions/2022/12/11/artemis-i-flight-day-26-orion-splashes-down-concluding-historic-artemis-i-mission?v=2")` | **reverted** *Evidence URL already submitted* — the non-`www`, query-string variant of the same page (**GO-1, GO-2**) | ⟨tx⟩ | ⟨result⟩ |
| 7 | app · A | Resolve with GenLayer AI (≥ 60 s after the deadline) | `RESOLVED_YES`, a verbatim quote from the page, attempt log `Attempt 1 · YES` | ⟨tx⟩ | ⟨result⟩ |
| 8 | app · A | Claim | A's balance 800 → 1200 | ⟨tx⟩ | ⟨result⟩ |
| 9 | app · B | Claim | refused *No winning position* (shown in the UI before sending) | — | ⟨result⟩ |

## Contract V8 — offline

- **genvm-linter** `lint`, `schema`, `typecheck`: pass, 13 methods (8 write, 5 view,
  including the new `normalize_evidence_url`). V7 failed `lint`.
- **Deterministic suite:** 80 tests pass on Python 3.11, 3.12 and 3.13.
- **GenVM Direct Mode suite:** 17 tests pass on the real py-genlayer v0.2.16 SDK.
- **Mutation matrix:** 32/32 killed, each mutant run against both suites. The
  first run left one survivor (a validator mutant that was equivalent: the quote
  check below it already refused a foreign source); it was replaced by a real fault
  (the validator skipping its own quote check), which is killed.
- **Frontend:** `npm ci`, `npm run build` (no chunk-size warning), `npm test` 30/30,
  including 15 golden vectors produced by the contract for the "Recorded as" preview.

## What the V8 run does NOT prove

- The model's verdict on other pages or questions; one market is resolved on-chain.
- A market reaching its three-attempt cap on-chain; that path is covered offline
  (deterministic and Direct Mode suites) only.
- Divergence between validators' clocks under V7 was never observed on-chain;
  V8 removes the precondition rather than fixing an observed failure.

---

# GenOracle V7 — previous deployment

Final deployed contract:

```text
0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7
```

Explorer:

https://explorer-studio.genlayer.com/address/0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7

Frontend:

https://genoracle-market.vercel.app

## Two kinds of evidence in this file

This document records what was observed **on-chain**, with real validator
consensus: the sections below are transaction-level results from StudioNet and
they are the only evidence for anything involving the AI layer.

The **deterministic** half of the contract — settlement arithmetic, the
authority boundary, evidence caps, the state machine, sender binding — is
covered separately and reproducibly by the test suite:

```bash
python3 -m unittest discover -s tests -v     # 71 tests, ~12s
python3 tests/mutation_check.py              # 22 mutants, 22 killed, ~4 min
```

That suite imports `contracts/market.py` verbatim and never simulates consensus;
`gl.nondet.web.render` and `gl.nondet.exec_prompt` raise if reached. See
[tests/README.md](tests/README.md). Three known weaknesses it pins down are in
[SECURITY.md](SECURITY.md).

---

## Final End-to-End Test — PASS

### Market

```text
Market ID:
nasa-artemis-test-01

Question:
Did NASA's Artemis I mission successfully return to Earth?

Authority:
nasa.gov
```

### Participants

Two MetaMask accounts were used.

```text
Wallet A → YES 200 G-USD
Wallet B → NO  200 G-USD
```

Final pools:

```text
YES pool = 200 G-USD
NO pool  = 200 G-USD
Total    = 400 G-USD
```

### Evidence

Official NASA source:

`https://www.nasa.gov/centers-and-facilities/hq/splashdown-nasas-orion-returns-to-earth-after-historic-moon-mission/`

The evidence was submitted only after the betting deadline.

### Resolution

After the 1-minute evidence window:

1. **Resolve with GenLayer AI** was clicked once.
2. Double-submit protection locked the button.
3. GenLayer consensus finalized successfully.
4. The frontend automatically detected accepted onchain state without requiring manual Refresh.
5. Market state changed to:

```text
RESOLVED_YES
```

The rendered NASA source included quote-grounded evidence that Orion returned safely to Earth and completed the Artemis I flight test.

### Claim

The winning YES wallet had:

```text
800 G-USD after placing its 200 G-USD bet.
```

After `claim_winnings` finalized:

```text
Balance = 1200 G-USD
```

Therefore:

```text
Payout = 400 G-USD
```

The user's YES position became `0 G-USD` and the Claim button disappeared.

**Result: PASS**

---

## Secondary Resolution Test — PASS

```text
Question:
Did Argentina win the 2022 FIFA World Cup?

Authority:
fifa.com
```

Evidence:

`https://www.fifa.com/en/tournaments/mens/worldcup/articles/argentina-france-2022-final-greatest-games`

Result:

```text
RESOLVED_YES
```

The final result stored:

- the authoritative FIFA source,
- a verbatim quote grounded in the rendered page,
- an AI resolution reason.

**Result: PASS**

---

## Fresh-User / Frontend Checks

| Check | Result |
|---|---|
| Connect MetaMask | PASS |
| StudioNet network handling | PASS |
| Display connected network | PASS |
| Demo G-USD faucet | PASS |
| Create market | PASS |
| Exact date + time deadline | PASS |
| Bet YES | PASS |
| Bet NO from second wallet | PASS |
| Betting blocked after deadline | PASS |
| Automatic OPEN → EVIDENCE UI | PASS |
| Submit official evidence | PASS |
| Domain enforcement | Implemented |
| Evidence limit display | PASS |
| 1-minute evidence window | PASS |
| AI resolution | PASS |
| Resolve double-submit lock | PASS |
| Automatic accepted-state refresh | PASS |
| Quote-grounded source display | PASS |
| Winning claim | PASS |
| Claimed position zeroed | PASS |
| Market history | PASS |

## Reviewer Test Recommendation

For a quick fresh-user test:

1. Connect MetaMask.
2. Get Demo G-USD.
3. Create a historical market with a deadline about 3 minutes ahead.
4. Bet before the deadline.
5. Wait for automatic EVIDENCE phase.
6. Submit one official URL from the locked authority.
7. Wait 1 minute.
8. Resolve with GenLayer AI once.
9. Wait for automatic result update.
10. Claim if the connected wallet is on the winning side.

No manual Explorer interaction is required for the normal app flow.
