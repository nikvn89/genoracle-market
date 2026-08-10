# v0.2.16
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

    # ============================================================
    # INTERNAL HELPERS
    # ============================================================

    def _today_iso(self) -> str:
        return date.today().isoformat()

    def _deadline_passed(self, market: dict) -> bool:
        deadline = market.get("deadline", "")

        if not deadline:
            return False

        return self._today_iso() > deadline

    def _normalize_domain(self, domain: str) -> str:
        value = domain.strip().lower()

        if value.startswith("https://"):
            value = value[8:]
        elif value.startswith("http://"):
            value = value[7:]

        value = value.split("/")[0]
        value = value.split(":")[0]

        if value.startswith("www."):
            value = value[4:]

        return value.strip(".")

    def _url_matches_domain(
        self,
        url: str,
        domain: str,
    ) -> bool:
        clean_url = url.strip().lower()
        clean_domain = self._normalize_domain(domain)

        if not clean_url.startswith("https://"):
            return False

        if not clean_domain:
            return False

        remainder = clean_url[8:]
        host = remainder.split("/")[0]

        # Reject credential-style URL tricks:
        # https://trusted.com@evil.com/
        if "@" in host:
            return False

        host = host.split(":")[0]

        if host.startswith("www."):
            host = host[4:]

        return (
            host == clean_domain
            or host.endswith("." + clean_domain)
        )

    def _parse_verdict(self, raw: str) -> str:
        # Steward fix:
        # exact-label parsing only.
        verdict = raw.strip().upper()

        if verdict == "YES":
            return "YES"

        if verdict == "NO":
            return "NO"

        if verdict == "UNKNOWN":
            return "UNKNOWN"

        if verdict == "TOO_EARLY":
            return "TOO_EARLY"

        # Any verbose / malformed response fails closed.
        return "UNKNOWN"

    # ============================================================
    # FAUCET
    # ============================================================

    @gl.public.write
    def faucet(self, user: str) -> None:
        balances = json.loads(self.balances_str)
        claimed = json.loads(self.claimed_faucet_str)

        sender = str(gl.message.sender_address).lower()
        user_lower = user.lower()

        if sender != user_lower:
            raise gl.vm.UserError(
                "Can only faucet to your own address"
            )

        if user_lower in claimed:
            # Keep the existing demo/testing refill behavior.
            if balances.get(user_lower, 0) >= 200:
                raise gl.vm.UserError(
                    "Faucet already claimed. "
                    "Re-claim available when balance drops "
                    "below 200 G-USD."
                )
        else:
            claimed.append(user_lower)

        current = balances.get(user_lower, 0)
        balances[user_lower] = current + 1000

        self.balances_str = json.dumps(balances)
        self.claimed_faucet_str = json.dumps(claimed)

    @gl.public.view
    def get_state(self) -> str:
        balances = json.loads(self.balances_str)
        claimed = json.loads(self.claimed_faucet_str)

        return json.dumps({
            "balances": balances,
            "claimed_faucet": claimed,
        })

    # ============================================================
    # MARKET CREATION
    # ============================================================

    @gl.public.write
    def create_market(
        self,
        market_id: str,
        question: str,
        authoritative_domain: str,
        deadline: str,
    ) -> None:
        markets = json.loads(self.markets_str)

        clean_id = market_id.strip()
        clean_question = question.strip()
        clean_domain = self._normalize_domain(
            authoritative_domain
        )
        clean_deadline = deadline.strip()

        if not clean_id:
            raise gl.vm.UserError(
                "Market ID is required"
            )

        if clean_id in markets:
            raise gl.vm.UserError(
                "Market already exists"
            )

        if not clean_question:
            raise gl.vm.UserError(
                "Question is required"
            )

        if not clean_domain or "." not in clean_domain:
            raise gl.vm.UserError(
                "Valid Authoritative Domain is required "
                "(e.g. fifa.com)"
            )

        # Basic YYYY-MM-DD validation.
        if len(clean_deadline) != 10:
            raise gl.vm.UserError(
                "Deadline must use YYYY-MM-DD"
            )

        if (
            clean_deadline[4] != "-"
            or clean_deadline[7] != "-"
        ):
            raise gl.vm.UserError(
                "Deadline must use YYYY-MM-DD"
            )

        markets[clean_id] = {
            "question": clean_question,
            "authoritative_domain": clean_domain,
            "deadline": clean_deadline,
            "status": "OPEN",
            "yes_pool": 0,
            "no_pool": 0,
            "yes_positions": {},
            "no_positions": {},
            "resolution_reason": "",
            "resolution_source": "",
        }

        self.markets_str = json.dumps(markets)

    # ============================================================
    # BETTING
    # ============================================================

    @gl.public.write
    def place_bet(
        self,
        market_id: str,
        user_addr: str,
        is_yes: bool,
        amount: int,
    ) -> None:
        markets = json.loads(self.markets_str)
        balances = json.loads(self.balances_str)

        if market_id not in markets:
            raise gl.vm.UserError(
                "Market not found"
            )

        market = markets[market_id]

        if market["status"] != "OPEN":
            raise gl.vm.UserError(
                "Market is closed for betting"
            )

        # ========================================================
        # STEWARD FIX #1
        #
        # Deadline now actually controls betting.
        # No new bet is accepted after deadline.
        # ========================================================

        if self._deadline_passed(market):
            raise gl.vm.UserError(
                "Betting deadline has passed"
            )

        sender = str(
            gl.message.sender_address
        ).lower()

        user_addr_key = user_addr.lower()

        if sender != user_addr_key:
            raise gl.vm.UserError(
                "Sender must match the betting address"
            )

        if amount <= 0:
            raise gl.vm.UserError(
                "Bet amount must be > 0"
            )

        current_balance = balances.get(
            user_addr_key,
            0,
        )

        if current_balance < amount:
            raise gl.vm.UserError(
                "Insufficient G-USD balance"
            )

        balances[user_addr_key] = (
            current_balance - amount
        )

        if is_yes:
            market["yes_pool"] += amount

            market["yes_positions"][
                user_addr_key
            ] = (
                market["yes_positions"].get(
                    user_addr_key,
                    0,
                )
                + amount
            )

        else:
            market["no_pool"] += amount

            market["no_positions"][
                user_addr_key
            ] = (
                market["no_positions"].get(
                    user_addr_key,
                    0,
                )
                + amount
            )

        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)

    @gl.public.write
    def close_betting(
        self,
        market_id: str,
    ) -> None:
        markets = json.loads(self.markets_str)

        if market_id not in markets:
            raise gl.vm.UserError(
                "Market not found"
            )

        market = markets[market_id]

        if market["status"] != "OPEN":
            raise gl.vm.UserError(
                "Market is not OPEN"
            )

        # ========================================================
        # STEWARD FIX #1
        #
        # Market cannot be closed before deadline.
        # Betting remains open through the deadline date.
        # ========================================================

        if not self._deadline_passed(market):
            raise gl.vm.UserError(
                "TOO_EARLY: market deadline is "
                + market.get("deadline", "")
            )

        market["status"] = "CLOSED_FOR_BETTING"

        self.markets_str = json.dumps(markets)

    # ============================================================
    # AI ORACLE RESOLUTION
    # ============================================================

    @gl.public.write
    def resolve_market(
        self,
        market_id: str,
    ) -> None:
        markets = json.loads(self.markets_str)

        if market_id not in markets:
            raise gl.vm.UserError(
                "Market not found"
            )

        market = markets[market_id]

        if market["status"] == "OPEN":
            raise gl.vm.UserError(
                "Betting must be closed before resolution"
            )

        if (
            market["status"]
            != "CLOSED_FOR_BETTING"
        ):
            raise gl.vm.UserError(
                "Market already resolved"
            )

        # Keep deterministic deadline protection at resolution.
        if not self._deadline_passed(market):
            raise gl.vm.UserError(
                "TOO_EARLY: event deadline is "
                + market.get("deadline", "")
            )

        question = market["question"]
        domain = self._normalize_domain(
            market.get(
                "authoritative_domain",
                "",
            )
        )

        # ========================================================
        # LEADER
        #
        # 1. Select URL constrained by authority policy.
        # 2. Contract verifies URL belongs to domain.
        # 3. Leader fetches source.
        # 4. Leader independently adjudicates.
        # ========================================================

        def leader_fn() -> str:
            source_prompt = f"""
You are selecting the authoritative source for a
prediction market.

QUESTION:
{question}

ENFORCED AUTHORITY DOMAIN:
{domain}

Select ONE publicly accessible HTTPS page belonging
to the exact authority domain "{domain}" or one of
its subdomains.

The page must contain the strongest available
evidence for resolving the prediction-market
question.

STRICT AUTHORITY POLICY:

1. The URL MUST belong to {domain} or a subdomain
   of {domain}.
2. Do NOT use Wikipedia unless wikipedia.org is the
   configured authority.
3. Do NOT use search engines as the final source.
4. Do NOT use another news site or another domain.
5. Return ONLY one HTTPS URL.
6. No explanation.
7. No markdown.
8. No quotes.
"""

            try:
                source_url = (
                    gl.nondet.exec_prompt(
                        source_prompt
                    )
                    .strip()
                    .splitlines()[0]
                    .strip()
                )
            except Exception:
                return json.dumps({
                    "decision": "UNKNOWN",
                    "source_url": "",
                    "reason": "Source selection failed",
                })

            # Enforce authority deterministically.
            if not self._url_matches_domain(
                source_url,
                domain,
            ):
                return json.dumps({
                    "decision": "UNKNOWN",
                    "source_url": source_url,
                    "reason": "Authority policy violation",
                })

            try:
                source_text = gl.nondet.web.render(
                    source_url,
                    mode="text",
                )
            except Exception:
                return json.dumps({
                    "decision": "UNKNOWN",
                    "source_url": source_url,
                    "reason": (
                        "Authoritative source "
                        "could not be fetched"
                    ),
                })

            if (
                not source_text
                or len(source_text) < 200
            ):
                return json.dumps({
                    "decision": "UNKNOWN",
                    "source_url": source_url,
                    "reason": (
                        "Authoritative source "
                        "contained insufficient evidence"
                    ),
                })

            if len(source_text) > 7000:
                source_text = source_text[:7000]

            judge_prompt = f"""
You are the leader of a decentralized prediction
market oracle.

Resolve the question using ONLY the authoritative
evidence below.

QUESTION:
{question}

ENFORCED AUTHORITY DOMAIN:
{domain}

SOURCE URL:
{source_url}

<AUTHORITATIVE_EVIDENCE>
{source_text}
</AUTHORITATIVE_EVIDENCE>

Return EXACTLY ONE label:

YES
NO
UNKNOWN
TOO_EARLY

Definitions:

YES
The authoritative evidence conclusively confirms
the proposition.

NO
The authoritative evidence conclusively disproves
the proposition.

UNKNOWN
The authoritative evidence is unavailable,
insufficient, ambiguous, irrelevant, or does not
conclusively establish YES or NO.

TOO_EARLY
The authoritative evidence indicates that the
underlying event has not happened yet or is still
pending.

IMPORTANT:

Output ONE LABEL ONLY.
Do not explain.
Do not use punctuation.
Do not output any additional text.
"""

            try:
                ai_response = gl.nondet.exec_prompt(
                    judge_prompt
                )

                # =================================================
                # STEWARD FIX #2
                # Exact parsing. Never:
                # if "YES" in response
                # =================================================

                decision = self._parse_verdict(
                    ai_response
                )

            except Exception:
                return json.dumps({
                    "decision": "UNKNOWN",
                    "source_url": source_url,
                    "reason": "Leader adjudication failed",
                })

            return json.dumps({
                "decision": decision,
                "source_url": source_url,
                "reason": (
                    "Leader fetched and evaluated "
                    "the enforced authoritative source"
                ),
            })

        # ========================================================
        # VALIDATOR
        #
        # STEWARD FIX #3
        #
        # Validator DOES NOT trust a leader-created research report.
        #
        # Validator:
        # 1. receives only leader verdict + source URL
        # 2. checks authority policy itself
        # 3. independently fetches the source URL
        # 4. independently evaluates raw source content
        # 5. performs exact verdict comparison
        # ========================================================

        def validator_fn(
            leader_res,
        ) -> bool:
            try:
                if type(leader_res) is str:
                    leader_str = leader_res

                elif hasattr(
                    leader_res,
                    "value",
                ):
                    leader_str = leader_res.value

                elif hasattr(
                    leader_res,
                    "calldata",
                ):
                    leader_str = leader_res.calldata

                else:
                    return False

                leader_data = json.loads(
                    leader_str
                )

                leader_decision = (
                    leader_data.get(
                        "decision",
                        "UNKNOWN",
                    )
                )

                source_url = leader_data.get(
                    "source_url",
                    "",
                )

                # Only exact valid labels are accepted.
                if leader_decision not in [
                    "YES",
                    "NO",
                    "UNKNOWN",
                    "TOO_EARLY",
                ]:
                    return False

                # A leader source-selection failure is
                # acceptable only as fail-closed UNKNOWN.
                if not source_url:
                    return (
                        leader_decision
                        == "UNKNOWN"
                    )

                # Validator independently enforces authority.
                if not self._url_matches_domain(
                    source_url,
                    domain,
                ):
                    return (
                        leader_decision
                        == "UNKNOWN"
                    )

                # ================================================
                # Independent validator fetch.
                # No leader "research_report" is reused.
                # ================================================

                try:
                    validator_source = (
                        gl.nondet.web.render(
                            source_url,
                            mode="text",
                        )
                    )
                except Exception:
                    return (
                        leader_decision
                        == "UNKNOWN"
                    )

                if (
                    not validator_source
                    or len(validator_source) < 200
                ):
                    return (
                        leader_decision
                        == "UNKNOWN"
                    )

                if len(validator_source) > 7000:
                    validator_source = (
                        validator_source[:7000]
                    )

                validator_prompt = f"""
You are an independent validator in a decentralized
prediction-market oracle.

You MUST independently evaluate the raw authoritative
source fetched by this validator.

QUESTION:
{question}

ENFORCED AUTHORITY DOMAIN:
{domain}

SOURCE URL:
{source_url}

<AUTHORITATIVE_EVIDENCE>
{validator_source}
</AUTHORITATIVE_EVIDENCE>

Return EXACTLY ONE label:

YES
NO
UNKNOWN
TOO_EARLY

Definitions:

YES
The authoritative evidence conclusively confirms
the proposition.

NO
The authoritative evidence conclusively disproves
the proposition.

UNKNOWN
The evidence is unavailable, insufficient,
ambiguous, irrelevant, or does not conclusively
establish YES or NO.

TOO_EARLY
The event has not happened yet or remains pending.

IMPORTANT:

Output ONE LABEL ONLY.
Do not explain.
Do not use punctuation.
Do not output additional text.
"""

                validator_raw = (
                    gl.nondet.exec_prompt(
                        validator_prompt
                    )
                )

                validator_decision = (
                    self._parse_verdict(
                        validator_raw
                    )
                )

                # Exact consensus.
                return (
                    validator_decision
                    == leader_decision
                )

            except Exception:
                return False

        # ========================================================
        # GENLAYER CONSENSUS
        # ========================================================

        final_res = gl.vm.run_nondet_unsafe(
            leader_fn,
            validator_fn,
        )

        try:
            final_data = json.loads(
                final_res
            )
        except Exception:
            final_data = {
                "decision": "UNKNOWN",
                "source_url": "",
                "reason": "Invalid consensus result",
            }

        decision = final_data.get(
            "decision",
            "UNKNOWN",
        )

        source_url = final_data.get(
            "source_url",
            "",
        )

        reason = final_data.get(
            "reason",
            "No resolution reason",
        )

        # Final exact-label safety gate.
        if decision not in [
            "YES",
            "NO",
            "UNKNOWN",
            "TOO_EARLY",
        ]:
            decision = "UNKNOWN"

        market["resolution_source"] = source_url

        if decision == "YES":
            market["status"] = "RESOLVED_YES"

            market["resolution_reason"] = (
                "YES — verified from authoritative "
                "source: "
                + source_url
            )

        elif decision == "NO":
            market["status"] = "RESOLVED_NO"

            market["resolution_reason"] = (
                "NO — verified from authoritative "
                "source: "
                + source_url
            )

        else:
            # UNKNOWN / TOO_EARLY:
            # fail safely so positions can be refunded.
            market["status"] = "FAILED"

            market["resolution_reason"] = (
                decision
                + " — "
                + reason
                + ". Source: "
                + source_url
            )

        self.markets_str = json.dumps(markets)

    # ============================================================
    # SETTLEMENT / REFUND
    # ============================================================

    @gl.public.write
    def claim_winnings(
        self,
        market_id: str,
        user_addr: str,
    ) -> None:
        markets = json.loads(self.markets_str)
        balances = json.loads(self.balances_str)

        if market_id not in markets:
            raise gl.vm.UserError(
                "Market not found"
            )

        market = markets[market_id]
        status = market["status"]

        if status in [
            "OPEN",
            "CLOSED_FOR_BETTING",
        ]:
            raise gl.vm.UserError(
                "Market is not resolved yet"
            )

        user_addr_key = user_addr.lower()

        sender = str(
            gl.message.sender_address
        ).lower()

        if sender != user_addr_key:
            raise gl.vm.UserError(
                "Sender must match the claiming address"
            )

        yes_pool = market["yes_pool"]
        no_pool = market["no_pool"]
        total_pool = yes_pool + no_pool

        user_yes_pos = (
            market["yes_positions"].get(
                user_addr_key,
                0,
            )
        )

        user_no_pos = (
            market["no_positions"].get(
                user_addr_key,
                0,
            )
        )

        payout = 0

        if status == "RESOLVED_YES":
            if yes_pool == 0:
                # Edge case:
                # nobody bet YES. Refund user's positions.
                payout = (
                    user_yes_pos
                    + user_no_pos
                )

                market["yes_positions"][
                    user_addr_key
                ] = 0

                market["no_positions"][
                    user_addr_key
                ] = 0

            elif user_yes_pos == 0:
                raise gl.vm.UserError(
                    "No winning position"
                )

            else:
                payout = (
                    user_yes_pos
                    * total_pool
                ) // yes_pool

                market["yes_positions"][
                    user_addr_key
                ] = 0

        elif status == "RESOLVED_NO":
            if no_pool == 0:
                # Edge case:
                # nobody bet NO. Refund user's positions.
                payout = (
                    user_yes_pos
                    + user_no_pos
                )

                market["yes_positions"][
                    user_addr_key
                ] = 0

                market["no_positions"][
                    user_addr_key
                ] = 0

            elif user_no_pos == 0:
                raise gl.vm.UserError(
                    "No winning position"
                )

            else:
                payout = (
                    user_no_pos
                    * total_pool
                ) // no_pool

                market["no_positions"][
                    user_addr_key
                ] = 0

        elif status == "FAILED":
            if (
                user_yes_pos == 0
                and user_no_pos == 0
            ):
                raise gl.vm.UserError(
                    "No positions to refund"
                )

            # UNKNOWN / TOO_EARLY / oracle failure:
            # refund original positions.
            payout = (
                user_yes_pos
                + user_no_pos
            )

            market["yes_positions"][
                user_addr_key
            ] = 0

            market["no_positions"][
                user_addr_key
            ] = 0

        else:
            raise gl.vm.UserError(
                "Unknown market status"
            )

        if payout > 0:
            current_balance = balances.get(
                user_addr_key,
                0,
            )

            balances[user_addr_key] = (
                current_balance
                + payout
            )

        self.markets_str = json.dumps(markets)
        self.balances_str = json.dumps(balances)

    # ============================================================
    # VIEWS
    # ============================================================

    @gl.public.view
    def get_market(
        self,
        market_id: str,
    ) -> str:
        markets = json.loads(self.markets_str)

        if market_id in markets:
            return json.dumps(
                markets[market_id]
            )

        return "{}"

    @gl.public.view
    def get_all_markets(self) -> str:
        return self.markets_str
