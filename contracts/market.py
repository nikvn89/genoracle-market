# v0.4.0 - GenOracle V3 (Multi-Agent Tribunal & Precise Integer Math)
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
        
        # GenVM sender validation
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
    def create_market(self, market_id: str, question: str, authoritative_domain: str, deadline: str) -> None:
        if not authoritative_domain or "." not in authoritative_domain:
            raise gl.vm.UserError("Valid Authoritative Domain is required (e.g. bbc.com)")
            
        markets = json.loads(self.markets_str)
        if market_id not in markets:
            markets[market_id] = {
                "question": question,
                "authoritative_domain": authoritative_domain.lower(),
                "deadline": deadline,
                "status": "OPEN", 
                "yes_pool": 0,
                "no_pool": 0,
                "yes_positions": {},
                "no_positions": {}
            }
            self.markets_str = json.dumps(markets)

    @gl.public.write
    def close_betting(self, market_id: str) -> None:
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
            raise gl.vm.UserError("Market is closed for betting.")
            
        sender = str(gl.message.sender_address).lower()
        user_addr_key = user_addr.lower()
        if sender != user_addr_key:
            raise gl.vm.UserError("Sender must match the betting address")
            
        if amount <= 0:
            raise gl.vm.UserError("Bet amount must be > 0")
            
        current_balance = balances.get(user_addr_key, 0)
        if current_balance < amount:
            raise gl.vm.UserError("Insufficient G-USD balance")
            
        balances[user_addr_key] = current_balance - amount
        market = markets[market_id]
        
        if is_yes:
            market["yes_pool"] += amount
            market["yes_positions"][user_addr_key] = market["yes_positions"].get(user_addr_key, 0) + amount
        else:
            market["no_pool"] += amount
            market["no_positions"][user_addr_key] = market["no_positions"].get(user_addr_key, 0) + amount
            
        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)
        return "Bet placed"

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
            
        domain = market.get("authoritative_domain", "")

        def leader_fn() -> str:
            # 1. Agent 1: The Search Strategist
            query_prompt = f"""
            You are an expert search strategist. The user wants to find the answer to this question: "{market["question"]}"
            Generate a concise 2 to 4 word search query (keywords only) to search on the domain "{domain}".
            Output ONLY the query string, nothing else. Example: US election winner 2024
            """
            try:
                query = gl.nondet.exec_prompt(query_prompt).strip().replace(" ", "+")
                search_url = f"https://html.duckduckgo.com/html/?q=site:{domain}+{query}"
                # DuckDuckGo HTML search returns snippets containing the answers!
                search_text = gl.nondet.web.render(search_url, mode="text")[:4000]
            except Exception:
                return json.dumps({"decision": "UNKNOWN", "reason": "Agent 1 or Web Search failed"})
                
            # 2. Agent 2: The Researcher
            research_prompt = f"""
            You are a meticulous Data Researcher.
            Analyze the following search engine results and extract only the factual events related to this question: "{market["question"]}"
            Do not make a final decision, just list the facts found in the snippets.
            
            Search Results:
            {search_text}
            """
            
            try:
                research_report = gl.nondet.exec_prompt(research_prompt)
            except Exception:
                return json.dumps({"decision": "UNKNOWN", "reason": "Researcher Agent failed"})
                
            # 3. Agent 3: The Chief Judge
            judge_prompt = f"""
            You are the Chief Judge of an Oracle Protocol.
            Based strictly on the following Research Report, answer the question: "{market["question"]}"
            
            Research Report:
            {research_report}
            
            If the facts definitively confirm the event, output exactly: {{"decision": "YES"}}
            If the facts definitively deny the event, output exactly: {{"decision": "NO"}}
            If the facts are ambiguous or irrelevant, output exactly: {{"decision": "UNKNOWN"}}
            
            Output ONLY valid JSON.
            """
            
            try:
                ai_resp = gl.nondet.exec_prompt(judge_prompt)
                clean_resp = ai_resp.strip()
                if clean_resp.startswith("```json"): clean_resp = clean_resp[7:]
                elif clean_resp.startswith("```"): clean_resp = clean_resp[3:]
                if clean_resp.endswith("```"): clean_resp = clean_resp[:-3]
                
                parsed = json.loads(clean_resp.strip())
                decision = str(parsed.get("decision", "UNKNOWN")).strip().upper()
                if decision not in ["YES", "NO"]: decision = "UNKNOWN"
                return json.dumps({"decision": decision, "research": research_report})
            except Exception:
                return json.dumps({"decision": "UNKNOWN", "reason": "Judge Agent failed parsing", "research": ""})

        def validator_fn(leader_res) -> bool:
            try:
                leader_str = ""
                if type(leader_res) is str: leader_str = leader_res
                elif hasattr(leader_res, "value"): leader_str = leader_res.value
                elif hasattr(leader_res, "calldata"): leader_str = leader_res.calldata
                else: return False
                    
                l_data = json.loads(leader_str)
                leader_decision = l_data.get("decision")
                research = l_data.get("research", "")
                
                if not research:
                    return False
                    
                judge_prompt = f"""
                You are the Chief Judge of an Oracle Protocol.
                Based strictly on the following Research Report, answer the question: "{market["question"]}"
                
                Research Report:
                {research}
                
                If the facts definitively confirm the event, output exactly: {{"decision": "YES"}}
                If the facts definitively deny the event, output exactly: {{"decision": "NO"}}
                If the facts are ambiguous or irrelevant, output exactly: {{"decision": "UNKNOWN"}}
                
                Output ONLY valid JSON.
                """
                ai_resp = gl.nondet.exec_prompt(judge_prompt)
                clean_resp = ai_resp.strip()
                if clean_resp.startswith("```json"): clean_resp = clean_resp[7:]
                elif clean_resp.startswith("```"): clean_resp = clean_resp[3:]
                if clean_resp.endswith("```"): clean_resp = clean_resp[:-3]
                
                v_data = json.loads(clean_resp.strip())
                val_decision = str(v_data.get("decision", "UNKNOWN")).strip().upper()
                
                return leader_decision == val_decision
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
        
        # PROPORTIONAL INTEGER MATH FIX
        if status == "RESOLVED_YES":
            if user_yes_pos == 0:
                raise gl.vm.UserError("No winning position")
            payout = (user_yes_pos * total_pool) // yes_pool
            market["yes_positions"][user_addr_key] = 0
            
        elif status == "RESOLVED_NO":
            if user_no_pos == 0:
                raise gl.vm.UserError("No winning position")
            payout = (user_no_pos * total_pool) // no_pool
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

    @gl.public.view
    def get_all_markets(self) -> str:
        return self.markets_str
