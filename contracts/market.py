# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *

class PredictionMarketContract(gl.Contract):
    markets_str: str

    def __init__(self):
        self.markets_str = "{}"

    @gl.public.write
    def create_market(self, market_id: str, question: str, source_url: str) -> None:
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            markets[market_id] = {
                "question": question,
                "source_url": source_url,
                "status": "OPEN", # OPEN, RESOLVED_YES, RESOLVED_NO, FAILED
                "yes_bets": 0,
                "no_bets": 0
            }
            self.markets_str = json.dumps(markets)

    @gl.public.write
    def place_bet(self, market_id: str, is_yes: bool, amount: int) -> str:
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            return "Market not found"
        if markets[market_id]["status"] != "OPEN":
            return "Market is closed"
            
        if is_yes:
            markets[market_id]["yes_bets"] += amount
        else:
            markets[market_id]["no_bets"] += amount
            
        self.markets_str = json.dumps(markets)
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
                # Nếu web sập hoặc bị block, trả về UNKNOWN để Contract không bị revert cứng
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
                parsed = json.loads(ai_resp)
                decision = str(parsed.get("decision", "UNKNOWN")).strip().upper()
                if decision not in ["YES", "NO"]:
                    decision = "UNKNOWN"
                return json.dumps({"decision": decision})
            except Exception:
                return json.dumps({"decision": "UNKNOWN"})

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return): return False
            try:
                l_data = json.loads(leader_res.value)
                v_data = json.loads(leader_fn())
                
                # Semantic Consensus: Chỉ so sánh từ khóa quyết định
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

    @gl.public.view
    def get_market(self, market_id: str) -> str:
        markets = json.loads(self.markets_str)
        if market_id in markets:
            return json.dumps(markets[market_id])
        return "{}"
