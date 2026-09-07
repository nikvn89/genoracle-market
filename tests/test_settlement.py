"""
Pari-mutuel settlement: the money invariants.

The deterministic half of GenOracle is what decides who gets paid and how much.
Validator consensus only supplies a YES / NO / UNKNOWN label; everything after
that label is arithmetic, and arithmetic is exactly what a test can pin down.

Two invariants are checked on every scenario in this file:

  I1  No inflation.   A market never pays out more than it took in.
  I2  Conservation.   sum(balances) == minted - staked + paid, at every step.
                      Nothing appears and nothing evaporates; integer remainder
                      stays in the pool rather than going anywhere.

A note on how I2 is measured. An earlier draft of this file computed "value
still locked" by summing the surviving `yes_positions` / `no_positions` entries,
and it reported a phantom surplus. That measure was wrong, not the contract: a
losing position stays recorded after settlement even though it is unclaimable,
so summing positions counts the losing stake twice -- once inside the winner's
payout and once as residue. `test_losing_position_is_residue_not_value` pins the
real behaviour down, and I2 is now measured from minted / staked / paid, which
does not depend on position bookkeeping at all.
"""

import unittest

from harness import Harness, ALICE, BOB, CAROL, DAVE

FAUCET_GRANT = 1000


class SettlementInvariants(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=20260907)

    # -- I1 / I2 on a hand-built scenario ---------------------------------
    def test_winners_split_the_whole_pool(self):
        h = self.h
        for who in (ALICE, BOB, CAROL):
            h.faucet(who)
        h.create_market("m", ALICE, deadline=h.now() + 600)

        h.bet("m", ALICE, True, 500)
        h.bet("m", BOB, False, 300)
        h.bet("m", CAROL, False, 200)

        self.assertEqual(h.market("m")["yes_pool"], 500)
        self.assertEqual(h.market("m")["no_pool"], 500)

        h.advance(700)
        h.set_sender(ALICE)
        h.contract.close_betting("m")
        h.force_status("m", "RESOLVED_YES")

        h.claim("m", ALICE)

        # Alice staked 500 of a 1000 pool and was the only YES bettor.
        self.assertEqual(h.balance(ALICE), 1000 - 500 + 1000)
        # The losing side keeps nothing.
        with self.assertRaises(h.module.gl.vm.UserError):
            h.claim("m", BOB)

    def test_no_side_winners_also_split_the_whole_pool(self):
        """The NO payout path is separate code and gets its own scenario."""
        h = self.h
        for who in (ALICE, BOB, CAROL):
            h.faucet(who)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 600)
        h.bet("m", BOB, False, 300)
        h.bet("m", CAROL, False, 100)
        h.advance(700)
        h.force_status("m", "RESOLVED_NO")

        h.claim("m", BOB)
        h.claim("m", CAROL)

        # Pool is 1000, NO side staked 400: Bob 3/4 and Carol 1/4 of everything.
        self.assertEqual(h.balance(BOB), FAUCET_GRANT - 300 + 750)
        self.assertEqual(h.balance(CAROL), FAUCET_GRANT - 100 + 250)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.claim("m", ALICE)

    def test_sender_must_match_the_claiming_address(self):
        h = self.h
        h.faucet(ALICE)
        h.faucet(BOB)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 100)
        h.bet("m", BOB, False, 100)
        h.advance(700)
        h.force_status("m", "RESOLVED_YES")

        h.set_sender(BOB)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.claim_winnings("m", ALICE)
        self.assertEqual(h.balance(ALICE), FAUCET_GRANT - 100)

    def test_claiming_an_unsettled_market_is_refused(self):
        h = self.h
        h.faucet(ALICE)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 100)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.claim("m", ALICE)

    def test_a_position_can_only_be_claimed_once(self):
        h = self.h
        h.faucet(ALICE)
        h.faucet(BOB)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 100)
        h.bet("m", BOB, False, 100)
        h.advance(700)
        h.force_status("m", "RESOLVED_YES")

        h.claim("m", ALICE)
        after_first = h.balance(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.claim("m", ALICE)
        self.assertEqual(h.balance(ALICE), after_first)

    def test_failed_market_refunds_exactly_the_stake(self):
        h = self.h
        for who in (ALICE, BOB):
            h.faucet(who)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 120)
        h.bet("m", ALICE, True, 130)
        h.bet("m", BOB, False, 400)

        h.advance(700)
        h.force_status("m", "FAILED")
        h.claim("m", ALICE)
        h.claim("m", BOB)

        self.assertEqual(h.balance(ALICE), 1000)
        self.assertEqual(h.balance(BOB), 1000)
        self.assertEqual(sum(h.balances().values()), 2 * FAUCET_GRANT)

    def test_one_sided_market_refunds_instead_of_burning(self):
        """RESOLVED_YES with an empty YES pool must not strand the NO side."""
        h = self.h
        h.faucet(BOB)
        h.create_market("m", BOB, deadline=h.now() + 600)
        h.bet("m", BOB, False, 250)
        h.advance(700)
        h.force_status("m", "RESOLVED_YES")

        h.claim("m", BOB)
        self.assertEqual(h.balance(BOB), 1000)

    def test_losing_position_is_residue_not_value(self):
        """A settled losing position stays on record but pays nothing."""
        h = self.h
        h.faucet(ALICE)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 100)
        h.bet("m", ALICE, False, 100)
        h.advance(700)
        h.force_status("m", "RESOLVED_YES")

        h.claim("m", ALICE)
        self.assertEqual(h.balance(ALICE), FAUCET_GRANT)

        market = h.market("m")
        self.assertEqual(market["yes_positions"][ALICE.lower()], 0)
        # Still recorded, deliberately unclaimable.
        self.assertEqual(market["no_positions"][ALICE.lower()], 100)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.claim("m", ALICE)
        self.assertEqual(h.balance(ALICE), FAUCET_GRANT)

    def test_integer_remainder_stays_in_the_pool(self):
        """Three winners on a pool that does not divide evenly."""
        h = self.h
        for who in (ALICE, BOB, CAROL, DAVE):
            h.faucet(who)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 1)
        h.bet("m", BOB, True, 1)
        h.bet("m", CAROL, True, 1)
        h.bet("m", DAVE, False, 100)
        h.advance(700)
        h.force_status("m", "RESOLVED_YES")

        before = sum(h.balances().values())
        for who in (ALICE, BOB, CAROL):
            h.claim("m", who)
        paid = sum(h.balances().values()) - before

        pool = 103
        # floor(1 * 103 / 3) = 34 each -> 102 paid, 1 unit of dust retained.
        self.assertEqual(paid, 102)
        self.assertLess(paid, pool)
        self.assertLess(pool - paid, 3)

    # -- randomized sweep -------------------------------------------------
    def test_invariants_hold_over_500_random_markets(self):
        """500 randomly shaped markets, every outcome, every claim order."""
        h = Harness(seed=987654321)
        rng = h.rng
        players = [ALICE, BOB, CAROL, DAVE]
        for who in players:
            h.faucet(who)

        minted = FAUCET_GRANT * len(players)
        staked_total = 0
        paid_total = 0

        for i in range(500):
            market_id = f"r{i}"
            creator = rng.choice(players)
            deadline = h.now() + 600
            try:
                h.create_market(market_id, creator, deadline=deadline)
            except h.module.gl.vm.UserError:
                # The active-market caps are themselves an invariant. When one
                # bites, settle what is open and carry on.
                paid_total += self._settle_all(h, players)
                h.create_market(market_id, creator, deadline=deadline)

            pool = 0
            for who in players:
                if rng.random() < 0.75 and h.balance(who) > 1:
                    amount = rng.randint(1, min(300, h.balance(who)))
                    h.bet(market_id, who, rng.random() < 0.5, amount)
                    pool += amount
            staked_total += pool

            market = h.market(market_id)
            self.assertEqual(market["yes_pool"] + market["no_pool"], pool)

            h.advance(700)
            outcome = rng.choice(["RESOLVED_YES", "RESOLVED_NO", "FAILED"])
            h.force_status(market_id, outcome)

            before = sum(h.balances().values())
            order = list(players)
            rng.shuffle(order)
            for who in order:
                try:
                    h.claim(market_id, who)
                except h.module.gl.vm.UserError:
                    pass
            paid = sum(h.balances().values()) - before
            paid_total += paid

            # I1 -- a market never pays out more than it took in.
            self.assertLessEqual(
                paid, pool,
                f"{market_id} paid {paid} out of a {pool} pool",
            )
            if outcome == "FAILED":
                # Every refund path is exact: a failed market returns the lot.
                self.assertEqual(
                    paid, pool,
                    f"{market_id} failed but refunded {paid} of {pool}",
                )

            # I2 -- the books balance after every single market.
            self.assertEqual(
                sum(h.balances().values()),
                minted - staked_total + paid_total,
                f"books did not balance after {market_id}",
            )

    @staticmethod
    def _settle_all(h, players):
        paid = 0
        for market_id, market in h.markets().items():
            if market["status"] in ("OPEN", "EVIDENCE"):
                h.force_status(market_id, "FAILED")
                before = sum(h.balances().values())
                for who in players:
                    try:
                        h.claim(market_id, who)
                    except h.module.gl.vm.UserError:
                        pass
                paid += sum(h.balances().values()) - before
        return paid


if __name__ == "__main__":
    unittest.main(verbosity=2)
