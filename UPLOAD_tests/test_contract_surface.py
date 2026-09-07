"""
A guard on the contract's public surface.

The suite imports `contracts/market.py` directly, so it always tests the file in
the repository. This file adds the second half of that guarantee: if the public
API, the authority whitelist or the demo limits change, something here fails and
forces a deliberate decision instead of a silent drift between the contract, the
tests, the frontend and the README.
"""

import inspect
import json
import unittest

from harness import Harness, APPROVED_DOMAINS

EXPECTED_WRITES = {
    "faucet": ["user"],
    "create_market": ["market_id", "question", "authoritative_domain",
                      "deadline_ts"],
    "place_bet": ["market_id", "user_addr", "is_yes", "amount"],
    "close_betting": ["market_id"],
    "submit_evidence": ["market_id", "url"],
    "resolve_market": ["market_id"],
    "expire_market": ["market_id"],
    "claim_winnings": ["market_id", "user_addr"],
}

EXPECTED_VIEWS = {
    "get_state": [],
    "get_market": ["market_id"],
    "get_all_markets": [],
    "get_config": [],
}


class ContractSurface(unittest.TestCase):
    def setUp(self):
        self.h = Harness(seed=2026)
        self.cls = self.h.module.PredictionMarketContract

    def _kind(self, name):
        return getattr(getattr(self.cls, name), "__genvm_public__", None)

    def test_write_methods_and_their_arguments(self):
        for name, params in EXPECTED_WRITES.items():
            with self.subTest(method=name):
                self.assertEqual(self._kind(name), "write")
                actual = list(
                    inspect.signature(getattr(self.cls, name)).parameters
                )
                self.assertEqual(actual, ["self"] + params)

    def test_view_methods_and_their_arguments(self):
        for name, params in EXPECTED_VIEWS.items():
            with self.subTest(method=name):
                self.assertEqual(self._kind(name), "view")
                actual = list(
                    inspect.signature(getattr(self.cls, name)).parameters
                )
                self.assertEqual(actual, ["self"] + params)

    def test_no_undeclared_public_methods(self):
        public = {
            name for name, member in inspect.getmembers(self.cls)
            if getattr(member, "__genvm_public__", None) is not None
        }
        self.assertEqual(
            public, set(EXPECTED_WRITES) | set(EXPECTED_VIEWS),
            "a public method was added or removed without updating the tests",
        )

    def test_calldata_stays_str_int_bool(self):
        """GenVM rejects list/dict calldata; the schema must stay primitive."""
        allowed = {"str", "int", "bool"}
        for name in EXPECTED_WRITES:
            signature = inspect.signature(getattr(self.cls, name))
            for param in list(signature.parameters.values())[1:]:
                with self.subTest(method=name, param=param.name):
                    self.assertIn(
                        getattr(param.annotation, "__name__", str(param.annotation)),
                        allowed,
                    )

    def test_whitelist_matches_the_documented_authorities(self):
        h = self.h
        h.faucet(self.h.rng.choice([  # any funded address will do
            "0x616c696365000000000000000000000000000000"]))
        accepted = []
        for index, domain in enumerate(APPROVED_DOMAINS):
            try:
                h.create_market(
                    f"s{index}",
                    "0x616c696365000000000000000000000000000000",
                    domain=domain,
                )
                accepted.append(domain)
                h.force_status(f"s{index}", "FAILED")
            except h.module.gl.vm.UserError:
                pass
        self.assertEqual(accepted, APPROVED_DOMAINS)

    def test_config_view_reports_the_demo_limits(self):
        config = json.loads(self.h.contract.get_config())
        self.assertEqual(config, {
            "evidence_window_seconds": 60,
            "expiry_period_seconds": 30 * 24 * 60 * 60,
            "max_evidence_urls": 3,
            "max_evidence_per_address": 2,
        })

    def test_empty_market_view_returns_an_empty_object(self):
        self.assertEqual(self.h.contract.get_market("missing"), "{}")

    def test_market_views_expose_the_effective_status(self):
        h = self.h
        alice = "0x616c696365000000000000000000000000000000"
        h.faucet(alice)
        h.create_market("m", alice, deadline=h.now() + 60)
        self.assertEqual(
            json.loads(h.contract.get_market("m"))["effective_status"], "OPEN")
        h.advance(61)
        # Stored status is still OPEN; the view reports what it really is.
        self.assertEqual(h.market("m")["status"], "OPEN")
        self.assertEqual(
            json.loads(h.contract.get_market("m"))["effective_status"],
            "EVIDENCE")
        self.assertEqual(
            json.loads(h.contract.get_all_markets())["m"]["effective_status"],
            "EVIDENCE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
