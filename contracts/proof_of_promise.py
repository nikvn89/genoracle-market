# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *

class ProofOfPromise(gl.Contract):
    def __init__(self):
        # Store promises as a JSON string
        self.promises_str = "{}"
        # Store evidence URLs linked to promise_id as a JSON string
        self.evidence_str = "{}"

    @gl.public.write
    def create_promise(self, promise_id: str, statement: str, deadline_ts: int) -> None:
        promises = json.loads(self.promises_str)
        if promise_id in promises:
            raise gl.vm.UserError("Promise ID already exists")
            
        promises[promise_id] = {
            "creator": str(gl.message.sender_address),
            "statement": statement,
            "deadline": deadline_ts,
            "status": "ACTIVE", # ACTIVE, FULFILLED, PARTIALLY_FULFILLED, BROKEN, INCONCLUSIVE
            "verdict_data": {}
        }
        self.promises_str = json.dumps(promises)
        
        evidence = json.loads(self.evidence_str)
        evidence[promise_id] = []
        self.evidence_str = json.dumps(evidence)

    @gl.public.write
    def add_evidence(self, promise_id: str, url: str) -> None:
        promises = json.loads(self.promises_str)
        if promise_id not in promises:
            raise gl.vm.UserError("Promise not found")
            
        if promises[promise_id]["status"] != "ACTIVE":
            raise gl.vm.UserError("Cannot add evidence, promise is not ACTIVE")
            
        evidence = json.loads(self.evidence_str)
        if url not in evidence[promise_id]:
            evidence[promise_id].append(url)
        self.evidence_str = json.dumps(evidence)

    @gl.public.write
    def trigger_evaluation(self, promise_id: str) -> None:
        promises = json.loads(self.promises_str)
        if promise_id not in promises:
            raise gl.vm.UserError("Promise not found")
            
        promise = promises[promise_id]
        if promise["status"] != "ACTIVE":
            raise gl.vm.UserError("Promise must be ACTIVE to evaluate")
            
        # In a real app, we'd check gl.block.timestamp > deadline.
        # For testing, we allow triggering anytime.
            
        evidence = json.loads(self.evidence_str).get(promise_id, [])
        if not evidence:
            raise gl.vm.UserError("No evidence provided to evaluate")

        def leader_fn() -> str:
            evidence_texts = []
            # Fetch from up to 3 sources to cross-reference
            for url in evidence[:3]: 
                try:
                    text = gl.nondet.web.render(url, mode="text")[:1500]
                    evidence_texts.append(f"Source URL ({url}):\n{text}")
                except Exception:
                    continue
                    
            if not evidence_texts:
                return json.dumps({"verdict": "INCONCLUSIVE", "confidence_score": 0})
                
            combined_evidence = "\n\n---\n\n".join(evidence_texts)
            
            prompt = f"""
            You are a strict objective auditor. Evaluate if the following promise was fulfilled based ONLY on the evidence provided.
            
            PROMISE TO EVALUATE: {promise['statement']}
            
            EVIDENCE SCRAPED FROM WEB:
            {combined_evidence}
            
            Analyze the evidence and extract obligations. Compare them to reality.
            Respond EXACTLY with a JSON object in this format (no other text):
            {{"verdict": "FULFILLED" | "PARTIALLY_FULFILLED" | "BROKEN" | "INCONCLUSIVE", "confidence_score": <number 0-100>}}
            """
            
            try:
                ai_resp = gl.nondet.exec_prompt(prompt)
                
                # Robust Markdown artifact stripping
                clean_resp = ai_resp.strip()
                if clean_resp.startswith("```json"):
                    clean_resp = clean_resp[7:]
                elif clean_resp.startswith("```"):
                    clean_resp = clean_resp[3:]
                if clean_resp.endswith("```"):
                    clean_resp = clean_resp[:-3]
                    
                parsed = json.loads(clean_resp.strip())
                verdict = parsed.get("verdict", "INCONCLUSIVE")
                score = int(parsed.get("confidence_score", 0))
                
                if verdict not in ["FULFILLED", "PARTIALLY_FULFILLED", "BROKEN"]:
                    verdict = "INCONCLUSIVE"
                    
                return json.dumps({"verdict": verdict, "confidence_score": score})
            except Exception:
                return json.dumps({"verdict": "INCONCLUSIVE", "confidence_score": 0})

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
                
                # 1. Strict Verdict Match requirement
                if l_data.get("verdict") != v_data.get("verdict"):
                    return False
                    
                # 2. Semantic Consensus Requirement (Equivalence check with Tolerance)
                # LLMs have temperature, confidence scores might differ slightly.
                # We enforce that the Validator agrees with the Leader within a 15-point margin.
                l_score = int(l_data.get("confidence_score", 0))
                v_score = int(v_data.get("confidence_score", 0))
                if abs(l_score - v_score) > 15:
                    return False
                    
                return True
            except Exception:
                return False

        final_res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        final_data = json.loads(final_res)
        
        promise["status"] = final_data.get("verdict", "INCONCLUSIVE")
        promise["verdict_data"] = final_data
        
        self.promises_str = json.dumps(promises)

    @gl.public.view
    def get_promise(self, promise_id: str) -> str:
        promises = json.loads(self.promises_str)
        evidence = json.loads(self.evidence_str)
        if promise_id in promises:
            data = promises[promise_id]
            data["evidence"] = evidence.get(promise_id, [])
            return json.dumps(data)
        return "{}"
