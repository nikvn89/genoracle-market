"""
Evidence admission: the authority boundary and the anti-grinding gate.

GenOracle's central claim is that validators only ever read pages the market
committed to in advance. Everything that claim rests on is deterministic Python
in `submit_evidence` and `_url_matches_domain`, so it is testable here without
touching a validator.

This file also contains two CHARACTERIZATION tests. They assert what the
deployed contract does today rather than what it should do, because what it does
today is weaker than the README implies. They are marked, and
`SECURITY.md` tracks both. When the contract is fixed, these two tests must be
inverted -- that is the point of writing them down.
"""

import unittest

from harness import Harness, ALICE, BOB, APPROVED_DOMAINS


class EvidenceAdmission(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=424242)
        self.h.faucet(ALICE)
        self.h.create_market("m", ALICE, domain="nasa.gov",
                             deadline=self.h.now() + 60)
        self.h.advance(70)
        self.h.set_sender(ALICE)

    def submit(self, url):
        self.h.contract.submit_evidence("m", url)

    def assertRejected(self, url):
        with self.assertRaises(self.h.module.gl.vm.UserError, msg=url):
            self.submit(url)

    # -- the authority boundary -------------------------------------------
    def test_plain_http_is_rejected(self):
        self.assertRejected("http://nasa.gov/report")

    def test_non_http_scheme_is_rejected(self):
        self.assertRejected("ftp://nasa.gov/report")

    def test_prefix_lookalike_domain_is_rejected(self):
        """evilnasa.gov must not pass as nasa.gov."""
        self.assertRejected("https://evilnasa.gov/report")

    def test_suffix_lookalike_domain_is_rejected(self):
        """nasa.gov.evil.com must not pass as nasa.gov."""
        self.assertRejected("https://nasa.gov.evil.com/report")

    def test_userinfo_spoof_is_rejected(self):
        """https://evil.com@nasa.gov/ resolves to nasa.gov; still rejected."""
        self.assertRejected("https://evil.com@nasa.gov/report")

    def test_explicit_port_is_rejected(self):
        self.assertRejected("https://nasa.gov:8443/report")

    def test_oversized_url_is_rejected(self):
        self.assertRejected("https://nasa.gov/" + "a" * 520)

    def test_http_url_crafted_to_realign_the_host_slice_is_rejected(self):
        """The scheme guard, tested where it is the only thing holding.

        `_url_matches_domain` slices the host at a fixed offset that assumes
        `https://`. Most http URLs are then rejected by the host comparison as a
        side effect, so a plain `http://nasa.gov/...` does not actually exercise
        the scheme check. This URL is one character longer, which realigns the
        slice back onto `nasa.gov` -- so only the explicit https guard rejects
        it.
        """
        self.assertRejected("http://wnasa.gov/report")

    def test_userinfo_on_a_subdomain_is_rejected(self):
        """The `@` guard, tested where the host comparison would pass it.

        `https://evil.com@nasa.gov/` is already rejected by the host compare, so
        it does not exercise the userinfo guard. This one ends in `.nasa.gov`
        after the `@`, so the host compare would accept it and only the explicit
        guard refuses.

        The guard is defence in depth rather than the authority boundary itself:
        such a URL does resolve to a real nasa.gov page. It is kept because a
        URL a reviewer cannot read at a glance has no place in committed
        evidence.
        """
        self.assertRejected("https://reader@science.nasa.gov/report")

    def test_subdomain_of_the_authority_is_accepted(self):
        self.submit("https://science.nasa.gov/report")
        self.assertEqual(len(self.h.market("m")["evidence"]), 1)

    def test_uppercase_host_is_accepted(self):
        self.submit("https://NASA.GOV/report")
        self.assertEqual(len(self.h.market("m")["evidence"]), 1)

    def test_www_prefix_is_accepted(self):
        self.submit("https://www.nasa.gov/report")
        self.assertEqual(len(self.h.market("m")["evidence"]), 1)

    def test_every_whitelisted_authority_accepts_its_own_domain(self):
        h = Harness(seed=7)
        h.faucet(ALICE)
        for index, domain in enumerate(APPROVED_DOMAINS):
            market_id = f"w{index}"
            h.create_market(market_id, ALICE, domain=domain,
                            deadline=h.now() + 60)
            h.advance(70)
            h.set_sender(ALICE)
            h.contract.submit_evidence(market_id, f"https://{domain}/a")
            self.assertEqual(len(h.market(market_id)["evidence"]), 1, domain)
            # Keep the per-creator active cap from biting mid-sweep.
            h.force_status(market_id, "FAILED")

    def test_unapproved_authority_cannot_create_a_market(self):
        h = Harness(seed=8)
        h.faucet(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.create_market("x", ALICE, domain="news.com")

    # -- duplicate suppression that works ---------------------------------
    def test_trailing_slash_is_the_same_url(self):
        self.submit("https://nasa.gov/report")
        self.assertRejected("https://nasa.gov/report/")

    def test_fragment_is_the_same_url(self):
        self.submit("https://nasa.gov/report")
        self.assertRejected("https://nasa.gov/report#section-2")

    def test_case_variants_are_the_same_url(self):
        self.submit("https://nasa.gov/report")
        self.assertRejected("https://NASA.gov/REPORT")

    # -- caps --------------------------------------------------------------
    def test_market_accepts_at_most_three_urls(self):
        self.submit("https://nasa.gov/a")
        self.submit("https://nasa.gov/b")
        self.h.set_sender(BOB)
        self.submit("https://nasa.gov/c")
        self.assertRejected("https://nasa.gov/d")

    def test_one_address_may_submit_at_most_two_urls(self):
        self.submit("https://nasa.gov/a")
        self.submit("https://nasa.gov/b")
        self.assertRejected("https://nasa.gov/c")
        # A different address still has its own allowance.
        self.h.set_sender(BOB)
        self.submit("https://nasa.gov/c")
        self.assertEqual(len(self.h.market("m")["evidence"]), 3)

    def test_evidence_before_the_deadline_is_rejected(self):
        h = Harness(seed=9)
        h.faucet(ALICE)
        h.create_market("early", ALICE, deadline=h.now() + 3600)
        h.set_sender(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.submit_evidence("early", "https://nasa.gov/a")

    def test_evidence_after_expiry_is_rejected(self):
        h = Harness(seed=10)
        h.faucet(ALICE)
        h.create_market("late", ALICE, deadline=h.now() + 60)
        h.advance(60 + 30 * 24 * 60 * 60 + 1)
        h.set_sender(ALICE)
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.submit_evidence("late", "https://nasa.gov/a")


class KnownWeaknesses(unittest.TestCase):
    """CHARACTERIZATION -- asserts today's behaviour, not the desired one.

    `_normalize_url` lowercases, drops the fragment and drops one trailing
    slash. It does not drop `www.` and it does not drop the query string, while
    `_url_matches_domain` *does* treat `www.` as the same host. So two spellings
    of one page can occupy two evidence slots.

    That matters beyond a wasted slot. `resolve_market` gates a second
    adjudication on `len(evidence) > last_attempt_evidence_count` -- "new
    evidence is required before another resolution attempt". A cosmetic variant
    of a page already submitted satisfies that counter, so the gate can be
    stepped past without producing anything new for validators to read.

    Both are tracked in SECURITY.md as GO-1 and GO-2. Fixing them changes the
    contract and therefore needs a redeploy; these tests exist so the weakness
    is recorded and measured rather than assumed away.
    """

    def setUp(self):
        self.h = Harness(seed=555)
        self.h.faucet(ALICE)
        self.h.faucet(BOB)
        self.h.create_market("m", ALICE, deadline=self.h.now() + 60)
        self.h.bet("m", ALICE, True, 100)
        self.h.bet("m", BOB, False, 100)
        self.h.advance(70)
        self.h.set_sender(ALICE)

    def test_www_variant_takes_a_second_evidence_slot(self):
        """GO-1: www and non-www forms of one page are counted separately."""
        self.h.contract.submit_evidence("m", "https://nasa.gov/report")
        self.h.contract.submit_evidence("m", "https://www.nasa.gov/report")
        self.assertEqual(len(self.h.market("m")["evidence"]), 2)

    def test_query_variant_unlocks_a_second_adjudication(self):
        """GO-2: a query-string variant satisfies the new-evidence gate."""
        h = self.h
        h.contract.submit_evidence("m", "https://nasa.gov/report")
        h.advance(60)

        h.set_nondet_result({"decision": "UNKNOWN", "source_url": "",
                             "evidence_quote": "", "reason": "NO_CONSENSUS"})
        h.contract.resolve_market("m")
        self.assertEqual(h.market("m")["status"], "EVIDENCE")
        self.assertEqual(h.market("m")["resolution_attempts"], 1)

        # Without new evidence the gate holds.
        with self.assertRaises(h.module.gl.vm.UserError):
            h.contract.resolve_market("m")

        # A cosmetic variant of the same page steps past it.
        h.contract.submit_evidence("m", "https://nasa.gov/report?v=2")
        h.set_nondet_result({"decision": "YES",
                             "source_url": "https://nasa.gov/report",
                             "evidence_quote": "q", "reason": "r"})
        h.contract.resolve_market("m")

        self.assertEqual(h.market("m")["status"], "RESOLVED_YES")
        self.assertEqual(h.market("m")["resolution_attempts"], 2)

    def test_three_slots_allow_three_rolls_of_one_page(self):
        """GO-2, upper bound: one real page yields the full attempt budget."""
        h = self.h
        urls = ["https://nasa.gov/report",
                "https://nasa.gov/report?v=2",
                "https://www.nasa.gov/report"]
        h.contract.submit_evidence("m", urls[0])
        h.contract.submit_evidence("m", urls[1])
        h.set_sender(BOB)
        h.contract.submit_evidence("m", urls[2])
        h.advance(60)

        distinct_pages = {u.split("?")[0].replace("www.", "") for u in urls}
        self.assertEqual(len(distinct_pages), 1)
        self.assertEqual(len(h.market("m")["evidence"]), 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
