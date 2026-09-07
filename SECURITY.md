# Security model and known limitations

GenOracle settles real positions on the strength of a verdict produced by AI
validators. This document states what the contract actually guarantees, what it
does not, and which weaknesses are known and open. It is written for a reviewer
who wants to check the claims rather than take them.

The deterministic half of every claim below is covered by
[`tests/`](tests/README.md) — 71 tests, and a mutation matrix that confirms they
fail when the property they defend is broken.

Deployed contract:
`0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7`
([explorer](https://explorer-studio.genlayer.com/address/0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7))

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
- At most 3 evidence URLs per market, at most 2 per address.
- A winning position is zeroed on claim, so it cannot be claimed twice.
- A market never pays out more than it took in; a failed market refunds exactly
  what it took in; integer remainder stays in the pool rather than being minted
  or destroyed.
- Expiry is permissionless — a market that never reaches consensus can be
  released by anyone once the expiry has passed, and everyone is refunded.

## 3. Known limitations — open

These are real, currently present in the deployed contract, and each is pinned
by a characterization test that asserts today's behaviour. **Fixing any of them
changes `contracts/market.py` and therefore requires a redeploy**, which is why
they are documented here rather than silently patched.

### GO-1 — `www.` variants occupy separate evidence slots

`_url_matches_domain` treats `www.nasa.gov` and `nasa.gov` as the same host, but
`_normalize_url` does not strip `www.` when building the duplicate key. So one
page can be submitted twice, in two spellings, and consume two of the three
evidence slots.

*Test:* `tests/test_evidence.py::KnownWeaknesses::test_www_variant_takes_a_second_evidence_slot`

*Fix:* strip `www.` inside `_normalize_url`, as the domain matcher already does.

### GO-2 — cosmetic URL variants step past the anti-grinding gate

This is the one that matters. `resolve_market` allows a second adjudication only
when `len(evidence) > last_attempt_evidence_count` — the README states this as
"repeat resolution requires new evidence". The counter is satisfied by any URL
with a new normalized form, and `_normalize_url` keeps the query string. So
`…/report?v=2` counts as new evidence for a page validators have already read.

With three evidence slots, a single real page yields the full attempt budget:
three independent runs of a non-deterministic adjudication over identical
content. That is verdict grinding, and the gate meant to prevent it does not.

*Tests:*
`tests/test_evidence.py::KnownWeaknesses::test_query_variant_unlocks_a_second_adjudication`
(drives it end to end: UNKNOWN, gate holds, cosmetic variant, RESOLVED_YES) and
`::test_three_slots_allow_three_rolls_of_one_page`.

*Fix direction:* gate re-adjudication on the count of distinct **rendered
pages**, not the count of URL strings — canonicalize the query and `www.` before
the duplicate check, and cap attempts independently of the evidence count.

### GO-3 — the contract clock is host wall-clock, not consensus time

`_now()` returns `datetime.now(timezone.utc).timestamp()`. That value is
produced independently by whichever machine executes the method, and it is
written into state (`created_at`, `submitted_at`) as well as compared against
every deadline.

This has not been observed to break a transaction on StudioNet, and this
document does not claim it has. What is demonstrated is the precondition: the
contract's time input is host-derived rather than consensus-derived, so two
nodes executing the same call at different instants record different state.

*Test:* `tests/test_lifecycle.py::ClockSource::test_state_written_depends_on_the_host_clock`

*Fix:* read `gl.message_raw["datetime"]`, the timestamp committed with the
transaction, and convert it arithmetically.

## 4. Known limitations — accepted by design

- **Authority availability.** A market is only as good as the site it committed
  to. Official pages move, change or go offline. When that happens the market
  reaches no verdict and expires to a full refund rather than guessing.
- **Deterministic validator re-run is not an injection defence.** Validators
  re-render the same pages and run the same shape of prompt as the leader. A
  page crafted to steer the model can steer both. The quote-grounding check
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
