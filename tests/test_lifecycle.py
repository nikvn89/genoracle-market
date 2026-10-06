"""
Market lifecycle: who may act, when, and in what order.

Every transition below is driven through the real public method. The only place
this file sets a status directly is where reaching it legitimately requires
validator consensus, which the deterministic suite does not simulate.
"""

import unittest

from harness import CONTRACT_PATH, Harness, ALICE, BOB, CAROL, MALLORY

EXPIRY_PERIOD = 30 * 24 * 60 * 60
EVIDENCE_WINDOW = 60


class Faucet(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=1001)

    def test_first_claim_grants_the_demo_balance(self):
        self.h.faucet(ALICE)
        self.assertEqual(self.h.balance(ALICE), 1000)

    def test_second_claim_is_refused_while_funded(self):
        self.h.faucet(ALICE)
        with self.assertRaises(self.h.module.gl.vm.UserError):
            self.h.faucet(ALICE)

    def test_top_up_is_allowed_once_the_balance_runs_low(self):
        h = self.h
        h.faucet(ALICE)
        h.create_market("m", ALICE, deadline=h.now() + 600)
        h.bet("m", ALICE, True, 900)
        self.assertEqual(h.balance(ALICE), 100)
        h.faucet(ALICE)
        self.assertEqual(h.balance(ALICE), 1100)

    def test_cannot_faucet_to_another_address(self):
        h = self.h
        h.set_sender(MALLORY)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.faucet(ALICE)


class Betting(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=1002)
        self.h.faucet(ALICE)
        self.h.faucet(BOB)
        self.h.create_market("m", ALICE, deadline=self.h.now() + 600)

    def test_sender_must_match_the_betting_address(self):
        h = self.h
        h.set_sender(MALLORY)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.place_bet("m", ALICE, True, 10)

    def test_bet_must_be_positive(self):
        with self.assertRaises(self.h.module.gl.vm.UserError):
            self.h.bet("m", ALICE, True, 0)
        with self.assertRaises(self.h.module.gl.vm.UserError):
            self.h.bet("m", ALICE, True, -50)

    def test_bet_beyond_balance_is_refused(self):
        with self.assertRaises(self.h.module.gl.vm.UserError):
            self.h.bet("m", ALICE, True, 1001)

    def test_betting_stops_at_the_deadline(self):
        h = self.h
        h.bet("m", ALICE, True, 10)
        h.advance(601)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.bet("m", BOB, False, 10)

    def test_repeat_bets_aggregate(self):
        h = self.h
        h.bet("m", ALICE, True, 40)
        h.bet("m", ALICE, True, 60)
        self.assertEqual(h.market("m")["yes_positions"][ALICE.lower()], 100)
        self.assertEqual(h.market("m")["yes_pool"], 100)

    def test_bet_on_unknown_market_is_refused(self):
        with self.assertRaises(self.h.module.gl.vm.UserError):
            self.h.bet("nope", ALICE, True, 10)


class Creation(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=1003)
        self.h.faucet(ALICE)

    def test_deadline_must_be_in_the_future(self):
        h = self.h
        with self.assertRaises(h.module.gl.vm.UserError):
            h.create_market("past", ALICE, deadline=h.now() - 1)

    def test_duplicate_market_id_is_refused(self):
        h = self.h
        h.create_market("dup", ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.create_market("dup", ALICE)

    def test_blank_id_and_question_are_refused(self):
        h = self.h
        with self.assertRaises(h.module.gl.vm.UserError):
            h.create_market("   ", ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.create_market("blank", ALICE, question="   ")

    def test_creator_is_capped_at_five_active_markets(self):
        h = self.h
        for i in range(5):
            h.create_market(f"c{i}", ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.create_market("c5", ALICE)

    def test_settling_a_market_frees_a_creator_slot(self):
        h = self.h
        for i in range(5):
            h.create_market(f"c{i}", ALICE)
        h.force_status("c0", "FAILED")
        h.create_market("c5", ALICE)
        self.assertIn("c5", h.markets())


class Resolution(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=1004)
        self.h.faucet(ALICE)
        self.h.faucet(BOB)
        self.h.create_market("m", ALICE, deadline=self.h.now() + 60)
        self.h.bet("m", ALICE, True, 100)
        self.h.bet("m", BOB, False, 100)

    def _to_evidence_phase(self):
        self.h.advance(61)
        self.h.set_sender(ALICE)
        self.h.contract.submit_evidence("m", "https://nasa.gov/report")

    def test_close_betting_before_the_deadline_is_refused(self):
        h = self.h
        h.set_sender(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.close_betting("m")

    def test_close_betting_moves_open_to_evidence(self):
        h = self.h
        h.advance(61)
        h.set_sender(ALICE)
        h.contract.close_betting("m")
        self.assertEqual(h.market("m")["status"], "EVIDENCE")

    def test_resolution_needs_at_least_one_url(self):
        h = self.h
        h.advance(61 + EVIDENCE_WINDOW)
        h.set_sender(ALICE)
        h.contract.close_betting("m")
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.resolve_market("m")

    def test_resolution_waits_for_the_evidence_window(self):
        h = self.h
        self._to_evidence_phase()
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.resolve_market("m")

    def test_unknown_verdict_keeps_the_market_open_for_evidence(self):
        h = self.h
        self._to_evidence_phase()
        h.advance(EVIDENCE_WINDOW)
        h.set_nondet_result({"decision": "UNKNOWN", "source_url": "",
                             "evidence_quote": "", "reason": "NO_CONSENSUS"})
        h.contract.resolve_market("m")
        self.assertEqual(h.market("m")["status"], "EVIDENCE")
        self.assertEqual(h.market("m")["resolution_attempts"], 1)

    def test_a_malformed_consensus_payload_fails_closed_to_evidence(self):
        h = self.h
        self._to_evidence_phase()
        h.advance(EVIDENCE_WINDOW)
        h.set_nondet_result("not json at all")
        h.contract.resolve_market("m")
        self.assertEqual(h.market("m")["status"], "EVIDENCE")
        self.assertEqual(
            h.market("m")["resolution_reason"], "INVALID_CONSENSUS_RESULT")

    def test_an_out_of_range_verdict_is_treated_as_unknown(self):
        h = self.h
        self._to_evidence_phase()
        h.advance(EVIDENCE_WINDOW)
        h.set_nondet_result({"decision": "MAYBE", "source_url": "",
                             "evidence_quote": "", "reason": "r"})
        h.contract.resolve_market("m")
        self.assertEqual(h.market("m")["status"], "EVIDENCE")

    def test_yes_verdict_settles_and_records_its_grounding(self):
        h = self.h
        self._to_evidence_phase()
        h.advance(EVIDENCE_WINDOW)
        h.set_nondet_result({"decision": "YES",
                             "source_url": "https://nasa.gov/report",
                             "evidence_quote": "the vehicle returned",
                             "reason": "grounded"})
        h.contract.resolve_market("m")
        market = h.market("m")
        self.assertEqual(market["status"], "RESOLVED_YES")
        self.assertEqual(market["resolution_source"], "https://nasa.gov/report")
        self.assertEqual(market["resolution_quote"], "the vehicle returned")

    def test_a_settled_market_cannot_be_resolved_again(self):
        h = self.h
        self._to_evidence_phase()
        h.advance(EVIDENCE_WINDOW)
        h.set_nondet_result({"decision": "NO",
                             "source_url": "https://nasa.gov/report",
                             "evidence_quote": "q", "reason": "r"})
        h.contract.resolve_market("m")
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.resolve_market("m")

    def test_resolution_after_expiry_is_refused(self):
        h = self.h
        self._to_evidence_phase()
        h.advance(EXPIRY_PERIOD)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.resolve_market("m")


class Expiry(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=1005)
        self.h.faucet(ALICE)
        self.h.create_market("m", ALICE, deadline=self.h.now() + 60)
        self.h.bet("m", ALICE, True, 100)

    def test_expiry_before_its_time_is_refused(self):
        h = self.h
        h.set_sender(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.expire_market("m")

    def test_expiry_is_permissionless_and_refunds(self):
        h = self.h
        h.advance(60 + EXPIRY_PERIOD)
        h.set_sender(CAROL)          # a stranger may expire a stuck market
        h.contract.expire_market("m")
        self.assertEqual(h.market("m")["status"], "FAILED")
        h.claim("m", ALICE)
        self.assertEqual(h.balance(ALICE), 1000)

    def test_a_settled_market_cannot_be_expired(self):
        h = self.h
        h.advance(60 + EXPIRY_PERIOD)
        h.force_status("m", "RESOLVED_YES")
        h.set_sender(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.expire_market("m")


class ClockSource(unittest.TestCase):
    """REGRESSION -- GO-3, closed in V8.

    V7 read `datetime.now(timezone.utc)`, the host wall-clock of whichever
    machine executed the call. V8 reads `gl.message_raw["datetime"]`, the
    timestamp committed with the transaction, and converts it with integer
    arithmetic, so every validator executing a call reads the same instant.
    """

    def test_contract_source_no_longer_reads_the_host_clock(self):
        source = open(CONTRACT_PATH, encoding="utf-8").read()
        self.assertNotIn("import datetime", source)
        self.assertNotIn("from datetime", source)
        self.assertNotIn("datetime.now", source)
        self.assertNotIn("time.time", source)
        self.assertEqual(source.count('gl.message_raw["datetime"]'), 1)

    def test_recorded_time_is_the_transaction_time(self):
        h = Harness(seed=1006)
        h.faucet(ALICE)
        h.set_time(1_800_000_000)
        h.create_market("a", ALICE, deadline=2_000_000_000)
        self.assertEqual(h.market("a")["created_at"], 1_800_000_000)

    def test_datetime_arithmetic_matches_the_calendar(self):
        import datetime as dt
        h = Harness(seed=7)
        cases = ["1970-01-01T00:00:00Z", "2024-02-29T23:59:59Z", "2026-12-31T12:00:00.123Z",
                 "2027-01-01T00:00:00+00:00", "2100-03-01T06:30:15Z", "2000-02-29T00:00:01.5Z"]
        for raw in cases:
            h.gl.message_raw["datetime"] = raw
            expected = int(dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp())
            self.assertEqual(h.contract._now(), expected, raw)
        h.gl.message_raw["datetime"] = "2026-10-06T09:00:00+07:00"
        self.assertEqual(h.contract._now(), int(dt.datetime(2026, 10, 6, 2, 0, tzinfo=dt.timezone.utc).timestamp()))
        for bad in ("", "not a date", "2026-13-01T00:00:00Z", "2026-10-06 09:00:00", "2026-10-06T09:00:00+0700"):
            h.gl.message_raw["datetime"] = bad
            with self.assertRaises(h.module.gl.vm.UserError):
                h.contract._now()


if __name__ == "__main__":
    unittest.main(verbosity=2)
