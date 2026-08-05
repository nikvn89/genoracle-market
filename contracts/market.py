# v0.5.0 - GenOracle V3 (Real Deadline Enforcement + Bet Lock after Deadline)
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from datetime import date
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
        claimed = json.loads(self.claimed_faucet_str)
        return json.dumps({"balances": balances, "claimed_faucet": claimed})

    @gl.public.write
    def create_market(self, market_id: str, question: str, authoritative_domain: str, deadline: str) -> None:
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
                "no_positions": {},
                "resolution_reason": ""
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

        # Enforce deadline: no bets accepted after the settlement deadline
        deadline = markets[market_id].get("deadline", "")
        if deadline:
            today_str = date.today().isoformat()
            if today_str > deadline:
                raise gl.vm.UserError(f"Betting closed. Settlement deadline was {deadline}.")
            
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

        # REAL deadline enforcement: block resolution if event deadline has not passed
        deadline = market.get("deadline", "")
        if deadline:
            today_str = date.today().isoformat()
            if today_str <= deadline:
                raise gl.vm.UserError(f"TOO_EARLY: Event deadline is {deadline}. Today is {today_str}. Funds remain locked.")
            
        domain = market.get("authoritative_domain", "")

        def leader_fn() -> str:
            # Agent 1: The Search Strategist
            query_prompt = f"""
            You are an expert search strategist. The user wants to find the answer to this question: "{market["question"]}"
            Generate a precise search query to find the exact fact, strongly including any dates, times, or specific entities mentioned.
            Output ONLY the query string, nothing else. Do not use quotes.
            """
            try:
                query = gl.nondet.exec_prompt(query_prompt).strip().replace(" ", "+")
                
                if domain:
                    search_url = f"https://html.duckduckgo.com/html/?q=site:{domain}+{query}"
                else:
                    search_url = f"https://html.duckduckgo.com/html/?q={query}"
                    
                search_text = gl.nondet.web.render(search_url, mode="text")
                if len(search_text) > 4000:
                    search_text = search_text[:4000]
                    
            except Exception as e:
                return json.dumps({"decision": "UNKNOWN", "reason": f"Web Search failed: {str(e)}"})
                
            # Agent 2: The Researcher
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
                
            # Agent 3: The Chief Judge
            judge_prompt = f"""
            You are the Chief Judge of an Oracle Protocol.
            Based strictly on the following Research Report, answer the question: "{market["question"]}"
            
            Research Report:
            {research_report}
            
            RULES for Output:
            1. If the facts in the report DEFINITIVELY CONFIRM the event occurred, output exactly: YES
            2. If the facts in the report DEFINITIVELY DENY the event occurred, output exactly: NO
            3. If the event has not happened yet (in the future), output exactly: TOO_EARLY
            4. If the report says "no information", "search failed", "Captcha", or if the facts are missing/ambiguous, output exactly: UNKNOWN
            
            Output ONLY a single word from the options above. Do not explain.
            """
            
            try:
                ai_resp = gl.nondet.exec_prompt(judge_prompt).strip().upper()
                if "YES" in ai_resp: decision = "YES"
                elif "NO" in ai_resp: decision = "NO"
                elif "TOO_EARLY" in ai_resp: decision = "TOO_EARLY"
                else: decision = "UNKNOWN"
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
                    return leader_decision == "UNKNOWN"
                    
                judge_prompt = f"""
                You are the Chief Judge of an Oracle Protocol.
                Based strictly on the following Research Report, answer the question: "{market["question"]}"
                
                Research Report:
                {research}
                
                RULES for Output:
                1. If the facts in the report DEFINITIVELY CONFIRM the event occurred, output exactly: YES
                2. If the facts in the report DEFINITIVELY DENY the event occurred, output exactly: NO
                3. If the event has not happened yet (in the future), output exactly: TOO_EARLY
                4. If the report says "no information", "search failed", "Captcha", or if the facts are missing/ambiguous, output exactly: UNKNOWN
                
                Output ONLY a single word from the options above. Do not explain.
                """
                ai_resp = gl.nondet.exec_prompt(judge_prompt).strip().upper()
                
                if "YES" in ai_resp: val_decision = "YES"
                elif "NO" in ai_resp: val_decision = "NO"
                elif "TOO_EARLY" in ai_resp: val_decision = "TOO_EARLY"
                else: val_decision = "UNKNOWN"
                
                return leader_decision == val_decision
            except Exception:
                return False

        final_res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        final_data = json.loads(final_res)
        decision = final_data.get("decision", "UNKNOWN")
        reason = final_data.get("research", final_data.get("reason", "Ambiguous facts or exception"))

        if decision == "YES":
            market["status"] = "RESOLVED_YES"
        elif decision == "NO":
            market["status"] = "RESOLVED_NO"
        elif decision == "TOO_EARLY":
            # AI says too early but deadline has passed — treat as UNKNOWN/FAILED
            market["status"] = "FAILED"
            reason = "AI could not find conclusive evidence for this event."
        else:
            market["status"] = "FAILED"
            
        market["resolution_reason"] = reason
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
        
        # PROPORTIONAL INTEGER MATH
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
