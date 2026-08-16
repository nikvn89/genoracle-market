# TESTING — GenOracle V7

Final deployed contract:

```text
0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7
```

Explorer:

https://explorer-studio.genlayer.com/address/0x89DBE40beA0DF050aB9EFf4BE6a98544A799e5E7

Frontend:

https://genoracle-market.vercel.app

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
