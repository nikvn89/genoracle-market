# v0.3.0 - Pari-Mutuel Fixed
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *

class PredictionMarketContract(gl.Contract):
    markets_str: str
    balances_str: str
    claimed_faucet_str: str

    def __init__(self):
        self.markets_str = "{}"
        self.balances_str = "{}"
        self.claimed_faucet_str = "[]"

    @gl.public.write
    def faucet(self, user: str) -> None:
        balances = json.loads(self.balances_str)
        claimed = json.loads(self.claimed_faucet_str)
        
        # GenVM sender validation to prevent abuse
        sender = str(gl.message.sender_address).lower()
        user_lower = user.lower()
        if sender != user_lower:
            raise gl.vm.UserError("Can only faucet to your own address")
            
        if user_lower in claimed:
            raise gl.vm.UserError("Faucet already claimed. One time only per address.")
            
        current = balances.get(user_lower, 0)
        balances[user_lower] = current + 1000
        claimed.append(user_lower)
        
        self.balances_str = json.dumps(balances)
        self.claimed_faucet_str = json.dumps(claimed)
        
    @gl.public.view
    def get_state(self) -> str:
        balances = json.loads(self.balances_str)
        return json.dumps({"balances": balances})

    @gl.public.write
    def create_market(self, market_id: str, question: str, source_url: str, deadline: str) -> None:
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            markets[market_id] = {
                "question": question,
                "source_url": source_url,
                "deadline": deadline, # expected YYYY-MM-DD
                "status": "OPEN", # OPEN, CLOSED_FOR_BETTING, RESOLVED_YES, RESOLVED_NO, FAILED
                "yes_pool": 0,
                "no_pool": 0,
                "yes_positions": {},
                "no_positions": {}
            }
            self.markets_str = json.dumps(markets)

    @gl.public.write
    def close_betting(self, market_id: str) -> None:
        """
        Manually closes betting before resolution can happen. 
        In a production environment, this would rely on gl.block.timestamp.
        """
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            raise gl.vm.UserError("Market not found")
            
        if markets[market_id]["status"] != "OPEN":
            raise gl.vm.UserError("Market is not OPEN")
            
        markets[market_id]["status"] = "CLOSED_FOR_BETTING"
        self.markets_str = json.dumps(markets)

    @gl.public.write
    def place_bet(self, market_id: str, user_addr: str, is_yes: bool, amount: int) -> str:
        markets = json.loads(self.markets_str)
        balances = json.loads(self.balances_str)
        
        if market_id not in markets:
            raise gl.vm.UserError("Market not found")
        if markets[market_id]["status"] != "OPEN":
            raise gl.vm.UserError("Market is closed for betting. Wait for resolution.")
            
        # STRICT SENDER BINDING
        sender = str(gl.message.sender_address).lower()
        user_addr_key = user_addr.lower()
        if sender != user_addr_key:
            raise gl.vm.UserError("Sender must match the betting address")
            
        if amount <= 0:
            raise gl.vm.UserError("Bet amount must be greater than 0")
            
        current_balance = balances.get(user_addr_key, 0)
            
        if current_balance < amount:
            raise gl.vm.UserError("Insufficient G-USD balance")
            
        # Deduct balance
        balances[user_addr_key] = current_balance - amount
            
        market = markets[market_id]
        
        if is_yes:
            market["yes_pool"] += amount
            user_pos = market["yes_positions"].get(user_addr_key, 0)
            market["yes_positions"][user_addr_key] = user_pos + amount
        else:
            market["no_pool"] += amount
            user_pos = market["no_positions"].get(user_addr_key, 0)
            market["no_positions"][user_addr_key] = user_pos + amount
            
        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)
        return "Bet placed successfully"

    @gl.public.write
    def resolve_market(self, market_id: str) -> None:
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            raise gl.vm.UserError("Market not found")
        
        market = markets[market_id]
        if market["status"] == "OPEN":
            raise gl.vm.UserError("Betting must be closed before resolution")
        if market["status"] not in ["OPEN", "CLOSED_FOR_BETTING"]:
            raise gl.vm.UserError("Market already resolved")

        def leader_fn() -> str:
            try:
                article_text = gl.nondet.web.render(market["source_url"], mode="text")[:2000]
            except Exception:
                return json.dumps({"decision": "UNKNOWN"})
            
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
                
                return l_data.get("decision") == v_data.get("decision")
            except Exception:
                return False

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
        if status in ["OPEN", "CLOSED_FOR_BETTING"]:
            raise gl.vm.UserError("Market is not resolved yet")
            
        payout = 0
        yes_pool = market["yes_pool"]
        no_pool = market["no_pool"]
        total_pool = yes_pool + no_pool
        
        user_addr_key = user_addr.lower()
        user_yes_pos = market["yes_positions"].get(user_addr_key, 0)
        user_no_pos = market["no_positions"].get(user_addr_key, 0)
        
        if status == "RESOLVED_YES":
            if user_yes_pos == 0:
                raise gl.vm.UserError("No winning position to claim")
            payout = int((user_yes_pos / yes_pool) * total_pool)
            market["yes_positions"][user_addr_key] = 0
            
        elif status == "RESOLVED_NO":
            if user_no_pos == 0:
                raise gl.vm.UserError("No winning position to claim")
            payout = int((user_no_pos / no_pool) * total_pool)
            market["no_positions"][user_addr_key] = 0
            
        elif status == "FAILED":
            if user_yes_pos == 0 and user_no_pos == 0:
                raise gl.vm.UserError("No positions to refund")
            payout = user_yes_pos + user_no_pos
            market["yes_positions"][user_addr_key] = 0
            market["no_positions"][user_addr_key] = 0
            
        if payout > 0:
            current_balance = balances.get(user_addr_key, 0)
            balances[user_addr_key] = current_balance + payout
            
        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)

    @gl.public.view
    def get_market(self, market_id: str) -> str:
        markets = json.loads(self.markets_str)
        if market_id in markets:
            return json.dumps(markets[market_id])
        return "{}"
