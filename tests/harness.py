"""
Loads the contract source and gives a test full control over the two inputs a
GenLayer contract reads from its environment: the transaction clock and the sender.

`contracts/market.py` is imported verbatim. If the contract changes, these tests
change with it or they break -- which is the point.
"""

import datetime as _dt
import importlib.util
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import genvm_stub  # noqa: E402

# Overridable so the mutation harness can point the same suite at a mutant.
CONTRACT_PATH = os.environ.get("GENORACLE_CONTRACT") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "contracts",
    "market.py",
)

# The 12 authorities the deployed contract accepts. Kept here as literals on
# purpose: if someone edits the whitelist in the contract, test_whitelist_matches
# fails and forces a deliberate decision instead of silently following along.
APPROVED_DOMAINS = [
    "fifa.com", "uefa.com", "nba.com", "nfl.com", "mlb.com", "nhl.com",
    "federalreserve.gov", "bls.gov", "bea.gov", "sec.gov", "nasa.gov",
    "ethereum.org",
]

ZERO = "0x0000000000000000000000000000000000000000"


def _addr(label: str) -> str:
    """A deterministic, checksum-shaped 20-byte address from a short label."""
    body = label.lower().encode("utf-8").hex()
    return "0x" + (body + "0" * 40)[:40]


ALICE = _addr("alice")
BOB = _addr("bob")
CAROL = _addr("carol")
DAVE = _addr("dave")
MALLORY = _addr("mallory")


def iso_utc(ts: int) -> str:
    """The transaction datetime string GenLayer commits, for a unix timestamp."""
    return _dt.datetime.fromtimestamp(int(ts), _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def load_contract_module():
    genvm_stub.install()
    spec = importlib.util.spec_from_file_location("market", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["market"] = module
    spec.loader.exec_module(module)
    return module


class Harness:
    """One deployed contract instance plus the clock and sender around it."""

    def __init__(self, seed=None):
        self.module = load_contract_module()
        self.gl = genvm_stub.gl
        self.contract = self.module.PredictionMarketContract()
        self.rng = random.Random(seed)
        self.set_time(1_800_000_000)
        self.set_sender(ZERO)

    # -- environment ------------------------------------------------------
    def set_time(self, ts: int):
        """Set the transaction timestamp every following call executes under."""
        self._now = int(ts)
        self.gl.message_raw["datetime"] = iso_utc(self._now)
        return self._now

    def advance(self, seconds: int):
        return self.set_time(self._now + int(seconds))

    def now(self) -> int:
        return self._now

    def set_sender(self, address: str):
        self.gl.message.sender_address = address
        return address

    def set_nondet_result(self, payload):
        """Inject the consensus result resolve_market will act on."""
        self.gl.vm._nondet_result = (
            payload if isinstance(payload, str) else json.dumps(payload)
        )

    # -- state readers ----------------------------------------------------
    def markets(self):
        return json.loads(self.contract.markets_str)

    def market(self, market_id):
        return self.markets()[market_id]

    def balances(self):
        return json.loads(self.contract.balances_str)

    def balance(self, address):
        return self.balances().get(address.lower(), 0)

    # -- convenience actions ---------------------------------------------
    def faucet(self, address):
        self.set_sender(address)
        self.contract.faucet(address)

    def create_market(self, market_id, creator, question="Did the event occur?",
                      domain="nasa.gov", deadline=None):
        self.set_sender(creator)
        if deadline is None:
            deadline = self.now() + 3600
        self.contract.create_market(market_id, question, domain, deadline)
        return deadline

    def bet(self, market_id, address, is_yes, amount):
        self.set_sender(address)
        self.contract.place_bet(market_id, address, is_yes, amount)

    def claim(self, market_id, address):
        self.set_sender(address)
        self.contract.claim_winnings(market_id, address)

    def force_status(self, market_id, status):
        """Set a terminal status directly.

        Used only where reaching the status legitimately requires validator
        consensus, which this suite does not simulate. Every deterministic
        transition is exercised through the real public method instead.
        """
        markets = self.markets()
        markets[market_id]["status"] = status
        self.contract.markets_str = json.dumps(markets)
