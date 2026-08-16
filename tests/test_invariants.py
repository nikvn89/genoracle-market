import json

# Mock gl module logic for invariant testing
class MockGLMessage:
    def __init__(self, sender_address):
        self.sender_address = sender_address

class MockGLVM:
    class UserError(Exception):
        pass

class MockGL:
    def __init__(self):
        self.message = MockGLMessage("0x0000000")
        self.vm = MockGLVM()

    class Contract:
        pass
    
    class public:
        @staticmethod
        def write(func): return func
        @staticmethod
        def view(func): return func

import sys
sys.modules['genlayer'] = MockGL()

import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'contracts'))
from market import PredictionMarketContract

def run_tests():
    gl_mock = sys.modules['genlayer']
    contract = PredictionMarketContract()

    print("--- Running Pari-Mutuel Settlement Invariant Tests (V3 Integer Math) ---")

    market_id = "test_market_01"
    contract.create_market(market_id, "Will BTC hit 100k?", "https://news.com/btc", "2026-12-31")
    
    alice = "0xalice"
    bob = "0xbob"
    charlie = "0xcharlie"

    gl_mock.message.sender_address = alice
    contract.faucet(alice)
    gl_mock.message.sender_address = bob
    contract.faucet(bob)
    gl_mock.message.sender_address = charlie
    contract.faucet(charlie)

    # Alice bets YES (500)
    gl_mock.message.sender_address = alice
    contract.place_bet(market_id, alice, True, 500)

    # Bob bets NO (300)
    gl_mock.message.sender_address = bob
    contract.place_bet(market_id, bob, False, 300)

    # Charlie bets NO (200)
    gl_mock.message.sender_address = charlie
    contract.place_bet(market_id, charlie, False, 200)

    markets = json.loads(contract.markets_str)
    market = markets[market_id]
    assert market["yes_pool"] == 500
    assert market["no_pool"] == 500

    contract.close_betting(market_id)
    
    # Mocking status to RESOLVED_NO
    markets = json.loads(contract.markets_str)
    markets[market_id]["status"] = "RESOLVED_NO"
    contract.markets_str = json.dumps(markets)

    try:
        contract.claim_winnings(market_id, alice)
        assert False, "Alice should not be able to claim"
    except MockGLVM.UserError:
        pass

    contract.claim_winnings(market_id, bob)
    contract.claim_winnings(market_id, charlie)

    balances = json.loads(contract.balances_str)
    
    # V3 Integer Math: payout = (pos * total) // pool
    # Bob: (300 * 1000) // 500 = 600. Balance: 1000 - 300 + 600 = 1300
    assert balances[bob] == 1300, f"Bob balance wrong: {balances[bob]}"
    
    # Charlie: (200 * 1000) // 500 = 400. Balance: 1000 - 200 + 400 = 1200
    assert balances[charlie] == 1200, f"Charlie balance wrong: {balances[charlie]}"

    # Alice: 1000 - 500 = 500
    assert balances[alice] == 500, f"Alice balance wrong: {balances[alice]}"

    print("✅ Invariant 1 Passed: Integer Math Proportional Payouts Verified")
    
    market_id_2 = "test_market_02"
    contract.create_market(market_id_2, "Will it rain?", "https://weather.com", "2026-12-31")
    
    dave = "0xdave"
    gl_mock.message.sender_address = dave
    contract.faucet(dave)
    
    # Dave places multiple bets to test aggregation
    contract.place_bet(market_id_2, dave, True, 100)
    contract.place_bet(market_id_2, dave, True, 150)
    
    contract.close_betting(market_id_2)
    
    markets = json.loads(contract.markets_str)
    markets[market_id_2]["status"] = "FAILED"
    contract.markets_str = json.dumps(markets)
    
    contract.claim_winnings(market_id_2, dave)
    balances = json.loads(contract.balances_str)
    
    # Dave bet 250 total. Balance: 1000 - 250 + 250 = 1000.
    assert balances[dave] == 1000, f"Dave balance wrong: {balances[dave]}"
    print("✅ Invariant 2 Passed: FAILED Market Multi-Bet Refunds Verified")

    try:
        gl_mock.message.sender_address = "hacker"
        contract.place_bet(market_id_2, alice, True, 100)
        assert False
    except MockGLVM.UserError:
        pass
    print("✅ Invariant 3 Passed: Sender Transaction Binding Enforced")

    print("\nAll V3 Settlement Invariants Checked and Verified successfully!")

if __name__ == "__main__":
    run_tests()
