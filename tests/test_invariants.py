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

# Import the contract
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'contracts'))
from market import PredictionMarketContract

def run_tests():
    gl_mock = sys.modules['genlayer']
    contract = PredictionMarketContract()

    print("--- Running Pari-Mutuel Settlement Invariant Tests ---")

    # 1. Setup Market & Users
    market_id = "test_market_01"
    contract.create_market(market_id, "Will BTC hit 100k?", "url", "2026-12-31")
    
    alice = "0xalice"
    bob = "0xbob"
    charlie = "0xcharlie"

    # Faucet balances
    gl_mock.message.sender_address = alice
    contract.faucet(alice)
    gl_mock.message.sender_address = bob
    contract.faucet(bob)
    gl_mock.message.sender_address = charlie
    contract.faucet(charlie)

    # 2. Place Bets
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

    # 3. Close Betting & Resolve
    contract.close_betting(market_id)
    
    # Mocking status to RESOLVED_NO for test (Bypassing AI resolution for unit test)
    markets = json.loads(contract.markets_str)
    markets[market_id]["status"] = "RESOLVED_NO"
    contract.markets_str = json.dumps(markets)

    # 4. Claim Winnings
    # Alice tries to claim (should fail because she bet YES, but NO won)
    try:
        contract.claim_winnings(market_id, alice)
        assert False, "Alice should not be able to claim"
    except MockGLVM.UserError:
        pass

    # Bob claims
    contract.claim_winnings(market_id, bob)
    
    # Charlie claims
    contract.claim_winnings(market_id, charlie)

    # 5. Invariant Checks
    balances = json.loads(contract.balances_str)
    
    # Total pool was 1000. Bob contributed 300/500 (60%) of winning pool.
    # Charlie contributed 200/500 (40%) of winning pool.
    # Expected payout: Bob = 600, Charlie = 400.
    
    # Bob started with 1000, bet 300 -> 700. Won 600 -> 1300.
    assert balances[bob] == 1300, f"Bob balance wrong: {balances[bob]}"
    
    # Charlie started with 1000, bet 200 -> 800. Won 400 -> 1200.
    assert balances[charlie] == 1200, f"Charlie balance wrong: {balances[charlie]}"

    # Alice started with 1000, bet 500 -> 500. Won 0 -> 500.
    assert balances[alice] == 500, f"Alice balance wrong: {balances[alice]}"

    print("✅ Invariant 1 Passed: Exact Proportional Payouts Verified (No loss of liquidity)")
    
    # 6. FAILED market refund test
    market_id_2 = "test_market_02"
    contract.create_market(market_id_2, "Will it rain?", "url", "2026-12-31")
    
    # Dave bets YES (100)
    dave = "0xdave"
    gl_mock.message.sender_address = dave
    contract.faucet(dave)
    contract.place_bet(market_id_2, dave, True, 100)
    
    contract.close_betting(market_id_2)
    
    markets = json.loads(contract.markets_str)
    markets[market_id_2]["status"] = "FAILED"
    contract.markets_str = json.dumps(markets)
    
    # Dave claims refund
    contract.claim_winnings(market_id_2, dave)
    balances = json.loads(contract.balances_str)
    
    # Dave started with 1000, bet 100 -> 900. Refunded 100 -> 1000.
    assert balances[dave] == 1000, f"Dave balance wrong: {balances[dave]}"
    print("✅ Invariant 2 Passed: FAILED Market 100% Refunds Verified")

    # 7. Strict Binding Test
    try:
        gl_mock.message.sender_address = "hacker"
        contract.place_bet(market_id_2, alice, True, 100)
        assert False, "Hacker should not be able to bet for Alice"
    except MockGLVM.UserError:
        pass
    print("✅ Invariant 3 Passed: Sender Transaction Binding Enforced")

    print("\nAll Settlement Invariants Checked and Verified successfully!")

if __name__ == "__main__":
    run_tests()
