# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
from dataclasses import dataclass

@allow_storage
@dataclass
class Market:
    question: str
    source_url: str
    status: str
    yes_bets: bigint
    no_bets: bigint

class PredictionMarketContract(gl.Contract):
    markets: TreeMap[str, Market]

    def __init__(self):
        pass

    @gl.public.write
    def create_market(self, market_id: str, question: str, source_url: str) -> None:
        if not market_id or not question or not source_url:
            raise gl.vm.UserError("Missing parameters")
        
        self.markets[market_id] = Market(
            question=question,
            source_url=source_url,
            status="OPEN",
            yes_bets=bigint(0),
            no_bets=bigint(0)
        )

    @gl.public.write
    def place_bet(self, market_id: str, is_yes: bool) -> None:
        if market_id not in self.markets:
            raise gl.vm.UserError("Market not found")
            
        market = self.markets[market_id]
        if market.status != "OPEN":
            raise gl.vm.UserError("Market is closed")
            
        # Sử dụng gl.message.value để nhận tiền cược
        amount = gl.message.value if hasattr(gl.message, "value") else bigint(0)
        
        if is_yes:
            market.yes_bets += amount
        else:
            market.no_bets += amount

    @gl.public.write
    def resolve_market(self, market_id: str) -> None:
        if market_id not in self.markets:
            raise gl.vm.UserError("Market not found")
        
        market = self.markets[market_id]
        if market.status != "OPEN":
            raise gl.vm.UserError("Market already resolved")

        url = market.source_url
        req_question = market.question

        def leader_fn() -> str:
            try:
                article_text = gl.nondet.web.render(url, mode="text")
                if len(article_text) > 8000:
                    article_text = article_text[:8000]
                if not article_text.strip():
                    article_text = "EMPTY_PAGE"
            except Exception:
                article_text = "FETCH_FAILED"
            
            prompt = (
                "Based on the following news article, answer the question with exactly 'YES' or 'NO'. "
                "If the article does not contain enough information to answer, reply 'UNKNOWN'.\n"
                "Question: " + req_question + "\n"
                "Article Content:\n" + article_text + "\n"
                "Return exactly a JSON object: {\"result\": \"YES/NO/UNKNOWN\"}"
            )
            
            ai_response = gl.nondet.exec_prompt(prompt)
            
            try:
                parsed = json.loads(ai_response)
                result = str(parsed.get("result", "UNKNOWN")).upper()
                if result not in ["YES", "NO", "UNKNOWN"]:
                    result = "UNKNOWN"
                return json.dumps({"result": result}, sort_keys=True)
            except Exception:
                return json.dumps({"result": "UNKNOWN"}, sort_keys=True)

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
                
            try:
                leader_data = json.loads(leader_res.value)
                leader_result = leader_data.get("result", "")
            except Exception:
                return False

            try:
                val_data = json.loads(leader_fn())
                val_result = val_data.get("result", "")
            except Exception:
                return False

            return leader_result == val_result

        final_result_str = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        final_data = json.loads(final_result_str)
        
        ai_answer = final_data["result"]

        if ai_answer == "YES":
            market.status = "RESOLVED_YES"
        elif ai_answer == "NO":
            market.status = "RESOLVED_NO"
        else:
            market.status = "FAILED"

    @gl.public.view
    def get_market(self, market_id: str) -> str:
        if market_id in self.markets:
            m = self.markets[market_id]
            return json.dumps({
                "question": m.question,
                "source_url": m.source_url,
                "status": m.status,
                "yes_bets": int(m.yes_bets),
                "no_bets": int(m.no_bets)
            })
        return "{}"
