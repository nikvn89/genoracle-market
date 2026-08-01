# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *

class PredictionMarketContract(gl.Contract):
    markets_str: str
    balances_str: str

    def __init__(self):
        self.markets_str = "{}"
        self.balances_str = "{}"

    @gl.public.write
    def faucet(self, user: str) -> None:
        balances = json.loads(self.balances_str)
        # GenVM sender validation to prevent abuse (optional but good practice)
        sender = str(gl.message.sender_address).lower()
        user_lower = user.lower()
        if sender != user_lower:
            raise gl.vm.UserError("Can only faucet to your own address")
            
        current = balances.get(user_lower, 0)
        # Limit faucet to 1000 G-USD max to prevent spam
        if current < 1000:
            balances[user_lower] = current + 1000
            self.balances_str = json.dumps(balances)
        
    @gl.public.view
    def get_state(self) -> str:
        # Return balances for the UI
        balances = json.loads(self.balances_str)
        # Make sure the UI gets checksummed/lowercase correctly, 
        # App.tsx checks data.balances[account.address], so let's just return it exactly.
        # But wait, App.tsx is case-sensitive if we aren't careful.
        # Since App.tsx passes `account.address`, it will look up `account.address`.
        # We will keep keys exactly as passed, or return a case-insensitive lookup.
        # It's safest to store exactly what they pass.
        return json.dumps({"balances": balances})

    @gl.public.write
    def create_market(self, market_id: str, question: str, source_url: str, deadline: str) -> None:
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            markets[market_id] = {
                "question": question,
                "source_url": source_url,
                "deadline": deadline,
                "status": "OPEN", # OPEN, RESOLVED_YES, RESOLVED_NO, FAILED
                "yes_pool": 0,
                "no_pool": 0,
                "yes_positions": {},
                "no_positions": {}
            }
            self.markets_str = json.dumps(markets)

    @gl.public.write
    def place_bet(self, market_id: str, user_addr: str, is_yes: bool, amount: int) -> str:
        markets = json.loads(self.markets_str)
        balances = json.loads(self.balances_str)
        
        if market_id not in markets:
            raise gl.vm.UserError("Market not found")
        if markets[market_id]["status"] != "OPEN":
            raise gl.vm.UserError("Market is closed")
            
        # Optional: verify sender is user_addr. We'll allow it either way since it's a testnet,
        # but deduct from user_addr's balance.
        user_addr_key = user_addr.lower()
            
        if amount <= 0:
            raise gl.vm.UserError("Bet amount must be greater than 0")
            
        current_balance = balances.get(user_addr_key, 0)
        
        # If user_addr didn't lower case, let's check original case too
        if user_addr not in balances and user_addr_key in balances:
            user_addr = user_addr_key
        elif current_balance == 0 and user_addr in balances:
            current_balance = balances.get(user_addr, 0)
            
        if current_balance < amount:
            raise gl.vm.UserError("Insufficient G-USD balance")
            
        # Deduct balance
        balances[user_addr] = current_balance - amount
            
        market = markets[market_id]
        
        if is_yes:
            market["yes_pool"] += amount
            user_pos = market["yes_positions"].get(user_addr, 0)
            market["yes_positions"][user_addr] = user_pos + amount
        else:
            market["no_pool"] += amount
            user_pos = market["no_positions"].get(user_addr, 0)
            market["no_positions"][user_addr] = user_pos + amount
            
        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)
        return "Bet placed successfully"

    @gl.public.write
    def resolve_market(self, market_id: str) -> None:
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            raise gl.vm.UserError("Market not found")
        
        market = markets[market_id]
        if market["status"] != "OPEN":
            raise gl.vm.UserError("Market already resolved")

        def leader_fn() -> str:
            # 1. Fetch real-world news using web scraper with fail-safes
            try:
                article_text = gl.nondet.web.render(market["source_url"], mode="text")[:2000]
            except Exception:
                return json.dumps({"decision": "UNKNOWN"})
            
            # 2. Ask LLM to evaluate the outcome
            prompt = f"""
            Based on the following news article, answer the question with exactly 'YES', 'NO', or 'UNKNOWN'.
            If the article does not contain enough information to answer, reply 'UNKNOWN'.
            
            Question: {market["question"]}
            
            Article Content:
            {article_text}
            
            Respond EXACTLY with a JSON object: {{"decision": "YES"}} or {{"decision": "NO"}} or {{"decision": "UNKNOWN"}}
            """
            
            try:
                ai_resp = gl.nondet.exec_prompt(prompt)
                
                # Clean markdown backticks if AI added them
                clean_resp = ai_resp.strip()
                if clean_resp.startswith("```json"):
                    clean_resp = clean_resp[7:]
                elif clean_resp.startswith("```"):
                    clean_resp = clean_resp[3:]
                if clean_resp.endswith("```"):
                    clean_resp = clean_resp[:-3]
                clean_resp = clean_resp.strip()
                
                parsed = json.loads(clean_resp)
                decision = str(parsed.get("decision", "UNKNOWN")).strip().upper()
                if decision not in ["YES", "NO"]:
                    decision = "UNKNOWN"
                return json.dumps({"decision": decision})
            except Exception:
                return json.dumps({"decision": "UNKNOWN"})

        def validator_fn(leader_res) -> bool:
            try:
                # Handle both raw string and gl.vm.Return object for compatibility
                leader_str = ""
                if type(leader_res) is str:
                    leader_str = leader_res
                elif hasattr(leader_res, "value"):
                    leader_str = leader_res.value
                elif hasattr(leader_res, "calldata"):
                    leader_str = leader_res.calldata
                else:
                    return False
                    
                l_data = json.loads(leader_str)
                v_data = json.loads(leader_fn())
                
                # Semantic Consensus: Only compare the decision keyword
                return l_data.get("decision") == v_data.get("decision")
            except Exception:
                return False

        # Execute Non-deterministic AI logic via Semantic Consensus
        final_res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        final_data = json.loads(final_res)
        decision = final_data.get("decision", "UNKNOWN")

        if decision == "YES":
            market["status"] = "RESOLVED_YES"
        elif decision == "NO":
            market["status"] = "RESOLVED_NO"
        else:
            market["status"] = "FAILED"
            
        self.markets_str = json.dumps(markets)

    @gl.public.write
    def claim_winnings(self, market_id: str, user_addr: str) -> None:
        markets = json.loads(self.markets_str)
        balances = json.loads(self.balances_str)
        
        if market_id not in markets:
            raise gl.vm.UserError("Market not found")
            
        market = markets[market_id]
        status = market["status"]
        if status == "OPEN":
            raise gl.vm.UserError("Market is not resolved yet")
            
        payout = 0
        yes_pool = market["yes_pool"]
        no_pool = market["no_pool"]
        total_pool = yes_pool + no_pool
        
        user_yes_pos = market["yes_positions"].get(user_addr, 0)
        user_no_pos = market["no_positions"].get(user_addr, 0)
        
        if status == "RESOLVED_YES":
            if user_yes_pos == 0:
                raise gl.vm.UserError("No winning position to claim")
            payout = int((user_yes_pos / yes_pool) * total_pool)
            market["yes_positions"][user_addr] = 0
            
        elif status == "RESOLVED_NO":
            if user_no_pos == 0:
                raise gl.vm.UserError("No winning position to claim")
            payout = int((user_no_pos / no_pool) * total_pool)
            market["no_positions"][user_addr] = 0
            
        elif status == "FAILED":
            if user_yes_pos == 0 and user_no_pos == 0:
                raise gl.vm.UserError("No positions to refund")
            payout = user_yes_pos + user_no_pos
            market["yes_positions"][user_addr] = 0
            market["no_positions"][user_addr] = 0
            
        if payout > 0:
            current_balance = balances.get(user_addr, 0)
            balances[user_addr] = current_balance + payout
            
        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)

    @gl.public.view
    def get_market(self, market_id: str) -> str:
        markets = json.loads(self.markets_str)
        if market_id in markets:
            return json.dumps(markets[market_id])
        return "{}"
