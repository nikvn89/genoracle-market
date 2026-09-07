# Changelog

All notable changes to GenOracle. Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.3.0] — 2026-09-07 — Test Coverage, a Frontend Data-Loss Fix & Security Disclosure

Milestone 3. The first two milestones fixed how GenOracle *builds* and how it
*looks*. This one is about whether its contract can be checked.

**No contract change and no redeploy.** `contracts/market.py` is byte-identical
to the deployed version at `0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7`. Three
contract weaknesses were found and are documented rather than patched, because
patching them means redeploying and losing address continuity — they are queued
for the next milestone. The one defect fixed here lives in the frontend, where
a fix ships without touching the chain.

### Fixed

- **The frontend silently discarded any payload containing a double quote.**
  `parseJson` in `src/lib/genlayer.ts` ran `.replace(/\\"/g, '"')` before
  `JSON.parse`, un-escaping the very escaping that makes a quote legal inside a
  JSON string. The payload became invalid JSON, `JSON.parse` threw, and the
  `catch` handed back an empty fallback without a word.

  `get_all_markets` returns every market in **one** string, so a single market
  whose question or `resolution_quote` contained `"` emptied the entire Explore
  panel for every visitor. `get_state` degraded the same way, showing a balance
  of 0. And `resolution_quote` is a verbatim quote lifted from an official news
  page by the model — a double quote in it is ordinary.

  ```text
  single-encoded, quotes inside    before: payload lost    after: ok
  double-encoded, quotes inside    before: payload lost    after: ok
  single-encoded, no quotes        before: ok              after: ok
  ```

  The parser now decodes the JSON layers instead of rewriting the text, which
  handles both the single- and double-encoded shapes the SDK returns and leaves
  the content untouched. Extracted to `src/lib/json.ts` so it can be tested;
  `src/lib/json.test.ts` covers 12 cases, 5 of which fail against the old
  implementation.

  No market on StudioNet had tripped it at the time of the fix — the app was
  rendering normally. It was found by reading, not by an outage.

- **`tests/test_invariants.py` could not run at all.** The repository shipped a
  test file that looked like coverage and was not:

  ```text
  $ python3 tests/test_invariants.py
  NameError: name 'gl' is not defined
  ```

  It failed at import. Its mock replaced `sys.modules['genlayer']` with an
  *instance*, so `from genlayer import *` in the contract never bound `gl`. Its
  assertions had also drifted from the contract they claimed to test — it called
  `create_market(..., "https://news.com/btc", "2026-12-31")` against a signature
  that takes a bare domain and an integer deadline, and `news.com` is not on the
  authority whitelist. It was removed, not repaired.

- **`package-lock.json` was pinned at version `0.0.0`** while `package.json` had
  moved to `1.2.0`.

### Added

- **71 deterministic tests over the deployed contract**, in `tests/`. They
  import `contracts/market.py` verbatim, so they cannot drift from the source
  they cover. `tests/genvm_stub.py` supplies only the deterministic GenVM
  surface; `gl.nondet.web.render` and `gl.nondet.exec_prompt` raise if reached,
  and where a verdict is needed it is injected rather than fabricated. Consensus
  is not simulated and the suite does not pretend otherwise.

  Coverage: pari-mutuel settlement and refunds, double-claim, integer remainder,
  the authority boundary (prefix and suffix lookalikes, userinfo spoofs, ports,
  plain http), duplicate suppression, both evidence caps, the full
  create → bet → evidence → resolve → expire → claim state machine, sender
  binding on every value-moving method, and the public API and calldata types.

  Plus a **500-market randomized sweep** asserting, after every market, that no
  market pays out more than it took in and that
  `sum(balances) == minted − staked + paid` exactly.

- **A mutation matrix, `tests/mutation_check.py` — 22 of 22 mutants killed.**
  A green suite proves nothing until it is shown to go red. Each mutant is one
  edit that breaks a property the suite claims to defend. Four survived the
  first run and are named in `tests/README.md`: two guards were being upheld by
  an unrelated string offset rather than by the check itself, and two paths had
  no dedicated test at all. Tests were added until all 22 failed the suite.

- **`SECURITY.md`** — trust boundaries, what the contract enforces, and three
  open weaknesses, each pinned by a characterization test that asserts today's
  behaviour:

  - **GO-2, the one that matters.** `resolve_market` gates re-adjudication on
    `len(evidence) > last_attempt_evidence_count` — the README calls this
    "repeat resolution requires new evidence". The counter is satisfied by any
    URL with a new normalized form, and `_normalize_url` keeps the query string.
    So `…/report?v=2` counts as new evidence for a page validators have already
    read, and one real page yields the full three-attempt budget: three
    independent runs of a non-deterministic adjudication over identical content.
    The test drives it end to end — UNKNOWN, gate holds, cosmetic variant,
    RESOLVED_YES.
  - **GO-1.** `_url_matches_domain` treats `www.nasa.gov` and `nasa.gov` as one
    host; `_normalize_url` does not. One page, two evidence slots.
  - **GO-3.** `_now()` reads `datetime.now(timezone.utc)` — host wall-clock,
    produced independently by whichever node executes the call, and written into
    state. This has never been observed to break a transaction on StudioNet and
    is not claimed to have; what the test demonstrates is the precondition.

- **A frontend test runner.** The repository had none: `src/` is 2,100 lines
  and nothing had ever been asserted about it. Vitest is wired up as
  `npm test`, currently covering the payload decoder above. CI runs it.

- **`.github/workflows/ci.yml`** — nothing was checking this repository. An
  earlier keeper-bot workflow had been removed and only its run history survives
  in the Actions tab, so despite that history no workflow file was present. Now
  `npm ci`, `npm run build`, the deterministic suite and the mutation matrix all
  run on every push.

  First run, both jobs green: frontend 23s, contract tests 2m 23s.

- **`tests/README.md`** — how to run everything, and an honest account of what
  the suite does not cover.

### Verified

```text
npm ci                                    rc 0
npm run build                             rc 0
npm test                                  rc 0   12 tests
python3 -m unittest discover -s tests     rc 0   71 tests
python3 tests/mutation_check.py           rc 0   22/22 killed

GitHub Actions, first run                 both jobs green
```

---

## [1.2.0] — 2026-08-29 — Visual Design Polish

Milestone 2. Answers the Project Explorer reviewer's recommendation:

> *"Giving the landing page UI a visual design polish will make it look even more
> state-of-the-art for community discovery."*

**No contract change, no redeploy, and no change to logic or data flow** — this
is CSS plus three small presentational components.

### Fixed

- **The authority `<select>` rendered as a native white-on-black control** in the
  middle of a dark interface — the single most visible break on the page. Now
  fully themed with a custom caret. `color-scheme: dark` on the datetime input
  so its picker matches too.

### Changed

- **Design tokens replace scattered hex values.** Four surface steps so panels
  read as layers rather than one flat sheet, three levels of text emphasis, and
  semantic YES / NO hues. Status pills inherit those semantics instead of all
  sharing one blue.

- **Three-column balance.** Column 1 is a long form while columns 2 and 3 are
  short until a market exists, so the row bottomed out two thirds of the way
  across and read as one tall column beside two stubs. A `min-height` floor on
  the right-hand panels holds the row square and centres the empty states inside
  it.

- **Empty states** now carry an icon, a headline and a next action instead of one
  flat sentence. Copy is direction-neutral so it stays true when the columns
  stack on mobile.

### Added

- **Brand lockup.** The app showed a bare wordmark and no mark at all.

- **Pool split as a bar.** `YES 3 / NO 1` should not make a reader do the
  division. The bar carries `role="img"` with an `aria-label` giving both
  percentages, so it is not decoration.

- **Focus rings** via `:focus-visible` on every control; hover lift on buttons
  and cards. All motion sits inside `@media (prefers-reduced-motion: no-preference)`.

### Verified

Playwright screenshots before and after at **1440×1000** and **390×844**.
`npm run build` rc 0.

---

## [1.1.0] — 2026-08-29 — Build Reliability & Repo Hygiene

Milestone 1. GenOracle could not be installed from a clean clone. Nothing was
wrong with the application code — the failure was entirely in dependency
placement — but the effect was that any fresh Vercel build, or any reviewer
cloning the repo, hit a wall before reaching the app.

### Fixed

- **`npm install` failed on a clean clone.** `puppeteer` and `jsdom` were listed
  under `dependencies` rather than `devDependencies`. Puppeteer's postinstall
  downloads a Chrome build (~150 MB) on every install; it returned HTTP 403 and
  aborted, leaving no `node_modules`, so `npm run build` then exited 127 with
  `vite: not found`.

  ```text
  before   npm install                            rc 1   (403 chrome-headless-shell)
           npm run build                          rc 127 (vite: not found)

  diagnosis
           PUPPETEER_SKIP_DOWNLOAD=1 npm install  rc 0
           npm run build                          rc 0
           -> dependency placement, not application code

  after    npm install                            rc 0
           npm run build                          rc 0   (built in 3.1s)
  ```

  Neither package was imported anywhere under `src/`. Their only consumers were
  two ad-hoc smoke scripts at the repo root, so the packages and those two
  scripts were removed together rather than pinned behind a skip-download flag —
  a flag would have left 150 MB of unused browser tooling in the dependency
  graph.

  `node_modules`: **257 MB → 179 MB**.

- **The app shipped with no typecheck.** The build script was `vite build`
  alone and the repo had no `tsconfig.json` at all, so nothing ever ran the
  TypeScript compiler over `src/`. Added the standard three-file tsconfig
  project and changed the script to `tsc -b && vite build`. It passes with
  **zero type errors** — the code was correct, it was simply unverified.

### Changed

- **One project per repo.** `contracts/` held four Python files; only
  `market.py` (815 lines) is the deployed GenOracle contract at
  `0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7`. Removed
  `institutional_proof_of_promise.py` and `proof_of_promise.py` (they belong to
  a different project and live in its own repo), plus `test_search.py`,
  `test_time.py` and `test_gl.py` (one-off GenVM probes). A reviewer opening
  `contracts/` can now see exactly which file the listing refers to.

- Nine loose `.mjs` deploy and probe scripts moved from the repo root into
  `scripts/`, beside the existing `keeper.js`. Kept, not deleted — they are real
  tooling, just not top-level project files.

### Added

- `CHANGELOG.md` — this file.
- `.env.example` — the repo had none, so the three `VITE_` variables the app
  reads were undocumented.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`.
- `typecheck` npm script.

### Not changed

- `contracts/market.py` is untouched. The deployed contract at
  `0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7` is unaffected and **no redeploy is
  required** for this release.
- The same-origin RPC split (`STUDIO_RPC` → `/api/rpc`, `STUDIO_WALLET_RPC` →
  canonical Studio URL) was already correct and is the cleanest of the four
  published projects. Left alone.

---

## [1.0.0] — Published release

Authority-bound AI prediction markets resolved by GenLayer validator consensus.
Users create YES/NO markets, bet with demo G-USD, submit official evidence after
the betting deadline under an authority domain locked at market creation, and
validators adjudicate from that evidence. The contract settles deterministically
and winning bettors claim a parimutuel share of the pool.
