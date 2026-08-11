# 🧪 GenOracle — Testing & Verification

This document records the main tests performed against the deployed GenOracle Intelligent Contract and frontend on GenLayer Studionet.

## Deployment Under Test

**Intelligent Contract**

```text
0xfB95876f2537df9ecD95D41cCc29bD1465691D4E
```

**Explorer**

https://explorer-studio.genlayer.com/address/0xfB95876f2537df9ecD95D41cCc29bD1465691D4E

**Frontend**

https://genoracle-market-nik.vercel.app/

---

## 1. Historical AI Resolution

### Objective

Verify that GenOracle can resolve a known real-world event using an authoritative source and GenLayer AI consensus.

### Market

```text
Market ID:
final-ai-test-04

Question:
Did Argentina win the 2022 FIFA World Cup?

Authoritative domain:
fifa.com

Deadline:
2026-08-10
```

### Procedure

1. Create the market.
2. Wait for the transaction to finalize.
3. Close betting after the deadline.
4. Call `resolve_market`.
5. Wait for GenLayer consensus.
6. Read the final market state using `get_market`.

### Result

```text
Status:
RESOLVED_YES
```

The contract stored the authoritative source:

```text
https://www.fifa.com/tournaments/mens/worldcup/qatar2022
```

Resolution reason:

```text
YES — verified from authoritative source
```

### Verification

**PASS ✅**

The known historical outcome was correctly adjudicated as YES using the configured FIFA authority.

The result, authoritative source, and resolution reason were persisted in contract state and displayed by the frontend.

---

## 2. Two-Wallet Betting

### Objective

Verify that multiple wallets can take opposing positions in the same market and that positions are tracked independently.

### Test Market

```text
Market ID:
two-wallet-final-01
```

### Wallet A

Position:

```text
YES: 100 G-USD
```

### Wallet B

Position:

```text
NO: 100 G-USD
```

### Resulting Pools

```text
YES Pool: 100 G-USD
NO Pool: 100 G-USD
```

When Wallet B was connected, the frontend displayed:

```text
Your YES: 0 G-USD
Your NO: 100 G-USD
```

The global market pools remained unchanged when switching wallets.

### Verification

**PASS ✅**

The contract correctly maintained:

- global YES pool
- global NO pool
- independent YES positions
- independent NO positions
- wallet-specific balances

This confirms that GenOracle supports genuine multi-wallet market participation rather than frontend-only simulated positions.

---

## 3. Demo G-USD Faucet

### Objective

Verify that users can obtain demo funds required for Studionet testing.

### Procedure

1. Connect wallet.
2. Select `Get Demo G-USD`.
3. Wait for transaction finalization.
4. Refresh contract state.

### Observed Result

```text
Balance:
1000 G-USD
```

The balance can then be used for YES/NO positions.

### Verification

**PASS ✅**

Demo funds were successfully issued and reflected in the frontend balance.

---

## 4. Deadline Enforcement

### Objective

Verify that betting and settlement follow the market deadline.

### Before Deadline

For an OPEN market whose deadline has not passed:

```text
Bet YES     → available
Bet NO      → available
Close       → unavailable
Resolve     → unavailable
```

### After Deadline

Once the deadline has passed:

```text
New bets    → blocked
Close       → available
Resolve     → available after closing
```

### Verification

**PASS ✅**

The tested active market remained open for betting while its deadline was in the future, and the frontend correctly prevented premature settlement actions.

Historical settlement was successfully executed after its deadline.

---

## 5. Authority-Bound Resolution

### Objective

Verify that a market's adjudication is tied to its predefined authoritative domain.

Historical test configuration:

```text
Question:
Did Argentina win the 2022 FIFA World Cup?

Authority:
fifa.com
```

Final evidence:

```text
https://www.fifa.com/tournaments/mens/worldcup/qatar2022
```

### Verification

**PASS ✅**

The final resolution used a source belonging to the configured authoritative domain.

This prevents the resolver from freely substituting unrelated web sources during adjudication.

---

## 6. Dynamic Web / Vision Fallback

### Objective

Verify resolution against authoritative websites whose relevant information may not be reliably exposed through simple text extraction.

Earlier resolver tests against FIFA could locate relevant FIFA pages but returned:

```text
UNKNOWN
```

because the extracted page content was insufficient for a conclusive verdict.

The final resolver adds an authoritative screenshot/vision fallback when textual evidence is inconclusive.

The final historical test then produced:

```text
RESOLVED_YES
```

### Verification

**PASS ✅**

The fallback successfully allowed the resolver to adjudicate the FIFA historical test without changing the required authoritative domain.

---

## 7. Market History

### Objective

Verify that completed markets remain inspectable without cluttering the active market interface.

### Observed Result

After resolution, `final-ai-test-04` appeared under:

```text
Market History
```

with:

```text
RESOLVED YES
```

Selecting the historical market displayed:

- final verdict
- authoritative domain
- authoritative source
- AI resolution reason
- YES pool
- NO pool
- wallet position

### Verification

**PASS ✅**

Resolved markets remain auditable and are separated from currently active markets.

---

## 8. Active Market Limits

The frontend exposes the current market capacity:

```text
Active Markets: X / 50
```

and creator capacity:

```text
Your active: X / 5
```

The intended limits are:

```text
Maximum active markets:
50

Maximum active markets per creator:
5
```

Completed markets move into Market History instead of remaining in the active section.

### Verification

**PASS ✅**

The frontend correctly reads active market state and displays both global and creator-specific usage counters.

---

## 9. Wallet-Specific UI

### Objective

Verify that personal positions change according to the connected wallet while global market state remains consistent.

For Wallet B in the two-sided betting test:

```text
YES Pool: 100 G-USD
NO Pool: 100 G-USD

Your YES: 0 G-USD
Your NO: 100 G-USD
```

Changing the connected wallet changes `Your YES` and `Your NO` according to that wallet's contract position.

Market History remains globally visible.

### Verification

**PASS ✅**

Global market state and wallet-specific state are correctly separated.

---

## 10. Claim UI Protection

### Objective

Verify that wallets without a winning/refundable position are not presented with an invalid claim action.

For historical market:

```text
final-ai-test-04

YES Pool: 0
NO Pool: 0

Your YES: 0
Your NO: 0
```

The frontend does not display `Claim Winnings` for that wallet.

Claim actions are shown only when the connected wallet has an eligible winning or refundable position.

### Verification

**PASS ✅**

The final frontend correctly hides irrelevant claim actions.

---

# Final Test Summary

| Test | Result |
|---|---|
| Intelligent Contract deployment | ✅ PASS |
| Historical AI adjudication | ✅ PASS |
| Authoritative-domain resolution | ✅ PASS |
| FIFA real-world source | ✅ PASS |
| AI result persistence | ✅ PASS |
| Two-wallet betting | ✅ PASS |
| Independent wallet positions | ✅ PASS |
| YES/NO pool accounting | ✅ PASS |
| Demo G-USD faucet | ✅ PASS |
| Deadline controls | ✅ PASS |
| Active / History separation | ✅ PASS |
| Resolution source display | ✅ PASS |
| AI resolution reason display | ✅ PASS |
| Wallet-specific UI | ✅ PASS |
| Claim UI eligibility | ✅ PASS |
| Production frontend build | ✅ PASS |

---

## Production Build

The final frontend was also compiled successfully using:

```bash
npm run build
```

The Vite production build completed successfully.

---

## Conclusion

GenOracle has been tested across the two core parts of the application:

### Deterministic market mechanics

```text
Create
→ Fund
→ Bet
→ Track positions
→ Enforce deadline
→ Close
→ Claim / Refund
```

### Nondeterministic GenLayer adjudication

```text
Question
→ Authoritative domain
→ Web evidence
→ AI evaluation
→ Independent validator verification
→ Consensus
→ YES / NO / FAILED
→ Persist source and reason
```

The tests demonstrate that GenOracle combines deterministic prediction-market accounting with GenLayer's nondeterministic AI consensus for real-world settlement.