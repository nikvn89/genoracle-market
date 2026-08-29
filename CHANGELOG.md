# Changelog

All notable changes to GenOracle. Format follows [Keep a Changelog](https://keepachangelog.com/).

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
