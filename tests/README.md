# Deterministic contract tests

> Frontend tests live beside the code they cover, in `src/`, and run with
> `npm test`. This directory is the contract.

80 deterministic tests and 17 GenVM Direct Mode tests over `contracts/market.py`,
plus a mutation matrix that checks the
tests actually fail when the contract is wrong.

```bash
python3 -m unittest discover -s tests -v     # the suite          (~12s)
python3 tests/mutation_check.py              # does it have teeth (~4 min)
```

Python 3.11+. No packages to install, no GenVM, no network, no wallet.

```bash
pip install -r requirements-test.txt         # genlayer-test 0.29.2, pytest, genvm-linter
python3 -m pytest tests/direct -q            # the GenVM Direct Mode suite  (~1s after GenVM is cached)
```

The Direct Mode suite is the other half. It deploys `contracts/market.py` into
genlayer-test's Direct Mode — the real py-genlayer v0.2.16 SDK, real storage,
real `gl.message_raw`, the real leader function — and answers
`gl.nondet.web.render` and `gl.nondet.exec_prompt` with mocks. The rendered pages
and model answers are assumed inputs; what is tested is what the contract does
with them: quote grounding, the attempt ledger, the prompt fence, the clock.

## What is being tested, and what is not

The suite imports `contracts/market.py` **verbatim** — the same file that is
deployed as contract V8. No contract logic is
copied into the tests, so they cannot drift away from the source they claim to
cover. `genvm_stub.py` supplies only the deterministic runtime surface the
contract touches: the base class, the public decorators, `gl.message` and
`gl.vm.UserError`.

Validator consensus is **not** simulated, and the suite never fabricates one.
`gl.nondet.web.render` and `gl.nondet.exec_prompt` raise if reached. Where a test
needs a verdict, it injects one through `harness.set_nondet_result(...)` and then
tests what the contract *does with it* — the state transition, the attempt
counter, the settlement arithmetic. That is the half a test can honestly own; the
consensus half is evidenced on-chain in [`../TESTING.md`](../TESTING.md).

## Files

| File | Covers |
|---|---|
| `harness.py` | loads the real contract; gives a test control of the clock and the sender |
| `genvm_stub.py` | the deterministic GenVM surface, and nothing more |
| `test_settlement.py` | pari-mutuel payouts, refunds, double-claim, integer remainder, and a 500-market randomized sweep |
| `test_evidence.py` | the authority boundary, the canonical evidence identity, caps, the adjudication budget and attempt log (GO-1/GO-2 regressions) |
| `test_lifecycle.py` | faucet, betting, creation caps, the resolve/expire state machine, and the transaction clock (GO-3 regression) |
| `test_contract_surface.py` | the public API, calldata types, the authority whitelist, the demo limits and the prompt fence |
| `test_identity_vectors.py` | golden vectors for the evidence identity, shared with the frontend test `src/lib/evidence.test.ts` |
| `direct/test_genvm_direct.py` | the contract on the real GenVM (Direct Mode): resolution end to end with quote grounding, the validator, the fence against a hostile page, the clock, the budget |
| `mutation_check.py` | 32 mutants, each run against both suites; a green run that misses one is reported as a gap |

## The randomized sweep

`test_invariants_hold_over_500_random_markets` builds 500 markets with random
participants, random stakes, random outcomes and a random claim order, and after
every single one asserts:

- **I1 — no inflation.** A market never pays out more than it took in, and a
  failed market refunds exactly what it took in.
- **I2 — conservation.** `sum(balances) == minted − staked + paid`, exactly.

An earlier draft measured I2 by summing the surviving position entries and
reported a phantom surplus. That measure was wrong, not the contract — a losing
position stays recorded after settlement, so summing positions counts the losing
stake twice. The note is left in the test file because a suite that quietly
corrects its own false alarms is not one you can trust the green light from.

## Mutation results

32 of 32 mutants killed (V8). Each mutant is a single edit that breaks one property
the suite claims to protect — winners paid from their own side instead of the
pool, the sender check dropped from `place_bet` or `claim_winnings`, the domain
matcher weakened to a bare suffix test, the evidence caps moved by one, the
anti-grinding gate inverted, and so on. Every one of them turns the suite red.

Four survived on the first run and are worth naming, because they show what a
green suite can hide:

- Removing the HTTPS check survived, because `http://nasa.gov/…` was already
  being rejected by an unrelated host-slice offset. The test now uses
  `http://wnasa.gov/report`, which realigns that slice so the scheme guard is the
  only thing left holding.
- Removing the userinfo guard survived for the same reason. The test now uses
  `https://reader@science.nasa.gov/report`, where the host comparison would
  otherwise pass.
- The NO-side payout and the `claim_winnings` sender check had no dedicated test
  at all; the settlement invariants held under both mutations because paying a
  winner too *little* still satisfies "never pay out more than the pool".

## Known limitations pinned here

Three tests assert what the contract does today rather than what it should do.
They are labelled CHARACTERIZATION in the source and tracked in
[`../SECURITY.md`](../SECURITY.md) as GO-1, GO-2 and GO-3. When the contract is
fixed, those three tests must be inverted — which is the point of writing them
down instead of leaving the weakness implicit.
