# Security model and known limitations

GenOracle settles real positions on the strength of a verdict produced by AI
validators. This document states what the contract actually guarantees, what it
does not, and which weaknesses are known and open. It is written for a reviewer
who wants to check the claims rather than take them.

Every claim below is covered by [`tests/`](tests/README.md): 80 deterministic
tests, 17 GenVM Direct Mode tests that run the contract inside the real
py-genlayer SDK, and a 32-mutant matrix that confirms they fail when the
property they defend is broken.

Contract V8 (current): `0xf076703b8EE0b4b9feba427335Bf2D7331A0E192` — source SHA-256
`fe5c4c086e45414d6b222087d77e66e1d12f7949294f1152be3999b68379cc80`.
Contract V7 (previous, still readable): `0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7`.

---

## 1. Trust boundaries

| Layer | Decides | Trusted to |
|---|---|---|
| Market creator | the question, the authority domain, the betting deadline | nothing — all three are frozen at creation and cannot be edited afterwards |
| Evidence submitter | which URLs validators read | stay inside the committed domain; **never** supplies a verdict |
| AI validators | YES / NO / UNKNOWN, plus a verbatim quote | read only the committed URLs; a quote absent from the validator's own render is refused |
| Contract | who is paid, and how much | pure integer arithmetic, no model involvement |

The separation that matters: **a verdict never moves money on its own.** The
model produces a label; the payout is arithmetic over positions recorded before
the label existed.

## 2. What the contract enforces

Each item is covered by a named test.

- Betting closes at the deadline; the stored status cannot lag behind the clock,
  because the views report an *effective* status.
- `sender` must equal the address being bet for, claimed for, or fauceted to.
- Bets must be positive and within balance.
- Evidence is accepted only after the deadline, only over HTTPS, and only on the
  committed authority domain or a subdomain of it. Prefix lookalikes
  (`evilnasa.gov`), suffix lookalikes (`nasa.gov.evil.com`), explicit ports and
  userinfo spoofs are all refused.
- At most 3 evidence URLs per market, at most 2 per address, each a distinct
  page under the canonical identity (V8).
- At most 3 adjudications per market, each recorded in `attempt_log` (V8).
- Every deadline compares against the transaction's committed datetime (V8).
- A winning position is zeroed on claim, so it cannot be claimed twice.
- A market never pays out more than it took in; a failed market refunds exactly
  what it took in; integer remainder stays in the pool rather than being minted
  or destroyed.
- Expiry is permissionless — a market that never reaches consensus can be
  released by anyone once the expiry has passed, and everyone is refunded.

## 3. Closed in V8

V7 (`0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7`) shipped with three weaknesses
that were disclosed here in v1.3.0, each pinned by a test that demonstrated it.
V8 fixes all three. Fixing them changed `contracts/market.py`, so V8 is a fresh
deployment with empty state; V7 stays readable at its address.

### GO-1 — `www.` variants occupied separate evidence slots — CLOSED

The duplicate key now drops a leading `www.`, the same way the domain matcher
always did, so `https://nasa.gov/report` and `https://www.nasa.gov/report` are
one page.

*Tests:* `tests/test_evidence.py::ClosedWeaknesses::test_www_variant_cannot_take_a_second_evidence_slot`,
`tests/direct/test_genvm_direct.py::test_cosmetic_variants_cannot_buy_another_adjudication`.
*Mutant:* M23 (www. kept in the identity) is killed.

### GO-2 — cosmetic URL variants stepped past the anti-grinding gate — CLOSED

Every evidence URL is recorded under one canonical identity: lower-case host
without `www.`, path without trailing slashes; scheme, query string and fragment
ignored. `…/report?v=2` is refused as `Evidence URL already submitted`, so the
"new evidence" gate in `resolve_market` can only be passed by a different page.
Independently of evidence, a market gets **at most three adjudications**
(`MAX_RESOLUTION_ATTEMPTS`); after that it can only expire to a full refund.
Every attempt is written to `attempt_log` with its outcome, reason, evidence
count and transaction time, so a grinding attempt would be visible on-chain.

*Tests:* `ClosedWeaknesses::test_query_variant_cannot_unlock_a_second_adjudication`,
`::test_three_slots_need_three_distinct_pages`,
`::test_attempt_budget_is_capped_independently_of_evidence`, and the Direct Mode
`test_three_attempts_then_only_expiry`. *Mutants:* M24, M25, M26 are killed.

### GO-3 — the contract clock was host wall-clock — CLOSED

`_now()` reads `gl.message_raw["datetime"]`, the timestamp committed with the
transaction, and converts it with integer calendar arithmetic (fractional
seconds and `±HH:MM` offsets handled; anything malformed reverts with
`Invalid transaction datetime`). The contract no longer imports `datetime`.

*Tests:* `tests/test_lifecycle.py::ClockSource` (source scan, recorded time
equals transaction time, arithmetic against the calendar for leap days, century
years, offsets and malformed input) and the Direct Mode clock tests.
*Mutants:* M29, M30 are killed.

### Also hardened in V8

- **Prompt fence.** The market question now sits inside
  `<UNTRUSTED_QUESTION>` tags and may not contain any fence marker (in any
  letter case); a rendered page has every `<UNTRUSTED_EVIDENCE>` /
  `</UNTRUSTED_EVIDENCE>` marker stripped to a fixed point before it enters the
  prompt, so a page can no longer close its own evidence block and speak as
  the prompt. Questions are capped at 300 characters.
  *Tests:* `test_contract_surface.py::PromptFence`,
  `test_genvm_direct.py::test_a_page_cannot_close_the_evidence_tag`. *Mutants:* M27, M28.
- **Model output parsing.** The leader asks for JSON and accepts it parsed or as
  text, including a ```` ```json ```` fenced answer; anything that is not a JSON
  object becomes `UNKNOWN` (`INVALID_LEADER_OUTPUT`), never a verdict. *Mutant:* M31.
- **Linter clean.** `genvm-linter lint` used to report the rendering helper as
  unreachable from the equivalence block; rendering now happens inside the
  leader and validator functions themselves and the lint passes.

## 3b. Known limitations — open (V8)

- **Query-addressed pages collapse.** Because the query string is ignored, two
  official pages that differ only by query (`/?p=123` versus `/?p=456`) are one
  identity. Submit the page's permalink. This is the price of making cosmetic
  variants worthless.
- **Aliases of one page are still distinct.** A page reachable under two
  different paths (a redirect, a short link) counts twice. The three-attempt cap
  bounds what that buys.
- **Reading the clock in views.** `get_market` / `get_all_markets` compute
  `effective_status` from the transaction datetime of the read call, as the
  deadlines do in writes.

## 4. Known limitations — accepted by design

- **Authority availability.** A market is only as good as the site it committed
  to. Official pages move, change or go offline. When that happens the market
  reaches no verdict and expires to a full refund rather than guessing.
- **Deterministic validator re-run is not an injection defence.** Validators
  re-render the same pages and run the same shape of prompt as the leader. A
  page crafted to steer the model can steer both; the V8 fence stops a page
  from breaking out of its evidence block, not from arguing inside it. The quote-grounding check
  raises the cost — an invented quote is rejected — but a real quote in a
  manipulated context is not caught. The authority whitelist is the actual
  defence here, which is why it is a fixed list of 12 domains.
- **`UNKNOWN` does not refund.** It leaves the market in the evidence phase, on
  purpose, so a temporarily unreadable page does not destroy a market. Funds are
  released by expiry.
- **Demo G-USD is not a token.** Balances are contract-internal integers from a
  faucet. There is no transfer, no external value, and no gas relationship.
- **Losing positions stay on record.** After settlement a losing position is
  still visible in `get_market`. It is unclaimable — bookkeeping residue, not
  value — and `tests/test_settlement.py::test_losing_position_is_residue_not_value`
  pins that down.

## 5. Out of scope for this deployment

No token incentives, no evidence bonds, no reputation, no dispute court, no
appeals. GenOracle is a StudioNet demonstration of one idea — authority-bound
evidence plus AI adjudication plus deterministic settlement — and a Project
Explorer listing for it should be read as **Preview**, not Live.

## 6. Reporting

Open an issue at
<https://github.com/nikvn89/genoracle-market/issues>. There is no bug bounty and
no funds at risk: StudioNet balances are demo credits.
