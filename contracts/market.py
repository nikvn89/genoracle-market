# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from datetime import date
from genlayer import *


# GenOracle V5 - Multi-Source Authority Resolution
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

    def _evidence_window(self, content: str) -> str:
        """Keep representative text from long pages.

        Some authoritative pages contain large navigation/header payloads.
        Taking only the first N characters can discard the actual result.
        For long pages, preserve beginning + middle + end deterministically.
        """
        if len(content) <= 24000:
            return content

        first = content[:8000]
        middle_start = max(0, (len(content) // 2) - 4000)
        middle = content[middle_start:middle_start + 8000]
        last = content[-8000:]

        return (
            first
            + "\n\n--- MIDDLE OF AUTHORITATIVE PAGE ---\n\n"
            + middle
            + "\n\n--- END OF AUTHORITATIVE PAGE ---\n\n"
            + last
        )

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
        creator = str(gl.message.sender_address).lower()

        # ========================================================
        # ACTIVE MARKET LIMITS
        #
        # Keep the protocol usable long-term without deleting
        # auditable on-chain market history. Only OPEN and
        # CLOSED_FOR_BETTING markets consume active slots.
        # Resolved / failed markets remain in History but no
        # longer count toward these limits.
        #
        # - Max 50 active markets across GenOracle
        # - Max 5 active markets per creator wallet
        # ========================================================
        active_total = 0
        active_by_creator = 0

        for existing_market in markets.values():
            existing_status = existing_market.get(
                "status",
                "",
            )

            if existing_status in [
                "OPEN",
                "CLOSED_FOR_BETTING",
            ]:
                active_total += 1

                if (
                    existing_market.get("creator", "")
                    == creator
                ):
                    active_by_creator += 1

        if active_total >= 50:
            raise gl.vm.UserError(
                "Maximum active market limit reached (50)"
            )

        if active_by_creator >= 5:
            raise gl.vm.UserError(
                "Maximum active markets per creator reached (5)"
            )

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

        # Curated authority whitelist.
        # This stays inline so the contract storage layout and public schema
        # remain identical to the already-working GenOracle contract.
        if not (
            clean_domain == "fifa.com"
            or clean_domain == "uefa.com"
            or clean_domain == "nba.com"
            or clean_domain == "nfl.com"
            or clean_domain == "mlb.com"
            or clean_domain == "nhl.com"
            or clean_domain == "federalreserve.gov"
            or clean_domain == "bls.gov"
            or clean_domain == "bea.gov"
            or clean_domain == "sec.gov"
            or clean_domain == "nasa.gov"
            or clean_domain == "ethereum.org"
        ):
            raise gl.vm.UserError(
                "Authoritative domain is not approved by GenOracle"
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
            "creator": creator,
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
            # Try several DISTINCT pages from the enforced authority.
            # A single weak/generic page must not decide the market when
            # another official page states the result explicitly.
            tried_sources = []
            last_source_url = ""
            last_reason = "No conclusive authoritative source"

            for attempt in range(4):
                avoid_note = ""
                if tried_sources:
                    avoid_note = (
                        "\nALREADY TRIED — DO NOT RETURN ANY OF THESE URLS:\n"
                        + "\n".join(tried_sources)
                    )

                source_prompt = f"""
You are selecting evidence for a decentralized
prediction-market oracle.

QUESTION:
{question}

ENFORCED AUTHORITY DOMAIN:
{domain}
{avoid_note}

Return ONE official HTTPS page from {domain} or one
of its subdomains whose HUMAN-READABLE BODY CONTENT
most directly answers the exact question.

SOURCE QUALITY RULES, IN PRIORITY ORDER:

1. Prefer a page that explicitly states the outcome
   needed to answer the question — for example an
   official final result, recap, winner/champion page,
   press release, decision, report, announcement, or
   completed-event summary.
2. Prefer a specific event/result page over a generic
   overview, homepage, archive, "full list", search
   page, live tracker, or interactive dashboard.
3. The answer must be supported by visible page text
   or rendered page content, not merely implied by the
   URL, title, metadata, or your prior knowledge.
4. Select a DIFFERENT URL from every page listed under
   ALREADY TRIED.
5. Never use a search engine, Wikipedia, another news
   site, or a different authority as the final source.
6. Before returning the URL, check that the page is
   likely to contain a direct sentence, score, table,
   ruling, number, or statement that resolves the
   proposition.
7. Return ONLY one HTTPS URL. No explanation, markdown,
   labels, or quotes.
"""

                try:
                    source_url = (
                        gl.nondet.exec_prompt(source_prompt)
                        .strip()
                        .splitlines()[0]
                        .strip()
                    )
                except Exception:
                    last_reason = "Source selection failed"
                    continue

                if not self._url_matches_domain(source_url, domain):
                    last_source_url = source_url
                    last_reason = "Authority policy violation"
                    continue

                if source_url in tried_sources:
                    last_reason = "Duplicate source selected"
                    continue

                tried_sources.append(source_url)
                last_source_url = source_url

                # Prefer rendered readable text for modern/dynamic sites.
                try:
                    source_text = gl.nondet.web.render(
                        source_url,
                        mode="text",
                        wait_after_loaded="8s",
                    )
                except Exception:
                    source_text = ""

                if not source_text or len(source_text) < 200:
                    try:
                        source_text = gl.nondet.web.render(
                            source_url,
                            mode="html",
                            wait_after_loaded="8s",
                        )
                    except Exception:
                        source_text = ""

                if not source_text or len(source_text) < 200:
                    last_reason = (
                        "Authoritative page could not provide enough "
                        "rendered evidence"
                    )
                    continue

                evidence = self._evidence_window(source_text)

                judge_prompt = f"""
You are the leader of a decentralized prediction
market oracle.

Resolve the QUESTION using ONLY the authoritative
evidence copied from the official page below.

QUESTION:
{question}

ENFORCED AUTHORITY DOMAIN:
{domain}

SOURCE URL:
{source_url}

<AUTHORITATIVE_EVIDENCE>
{evidence}
</AUTHORITATIVE_EVIDENCE>

Return EXACTLY ONE label:
YES
NO
UNKNOWN
TOO_EARLY

YES = the evidence explicitly and conclusively confirms
the proposition.
NO = the evidence explicitly and conclusively disproves
the proposition.
UNKNOWN = the page is related but does not actually
state enough facts to decide YES or NO, or the evidence
is unavailable/ambiguous.
TOO_EARLY = the underlying event is still pending or
has not happened yet.

Important:
- Judge the proposition, not whether the page is about
  the same topic.
- A score, named winner/champion, official decision,
  published figure, or equally direct statement counts
  as conclusive evidence when it answers the question.
- Do not infer a result merely from the URL or title.
- Output ONE LABEL ONLY.
"""

                try:
                    decision = self._parse_verdict(
                        gl.nondet.exec_prompt(judge_prompt)
                    )
                except Exception:
                    last_reason = "Leader adjudication failed"
                    continue

                if decision in ["YES", "NO", "TOO_EARLY"]:
                    return json.dumps({
                        "decision": decision,
                        "source_url": source_url,
                        "reason": (
                            "Conclusive result found on an enforced "
                            "authoritative source after multi-source review"
                        ),
                    })

                # If extracted text is inconclusive, independently inspect
                # the rendered page visually before abandoning this URL.
                try:
                    source_image = gl.nondet.web.render(
                        source_url,
                        mode="screenshot",
                        wait_after_loaded="8s",
                    )
                    vision_prompt = f"""
Resolve the prediction-market QUESTION using ONLY
what is visibly shown in this screenshot of the
official authoritative page.

QUESTION:
{question}

SOURCE URL:
{source_url}

Return EXACTLY ONE label:
YES
NO
UNKNOWN
TOO_EARLY

A visible score, winner/champion, ruling, result, or
other direct statement is conclusive when it answers
the question. Do not infer from the URL.
Output ONE LABEL ONLY.
"""
                    vision_decision = self._parse_verdict(
                        gl.nondet.exec_prompt(
                            vision_prompt,
                            images=[source_image],
                        )
                    )
                except Exception:
                    vision_decision = "UNKNOWN"

                if vision_decision in ["YES", "NO", "TOO_EARLY"]:
                    return json.dumps({
                        "decision": vision_decision,
                        "source_url": source_url,
                        "reason": (
                            "Conclusive result found from an enforced "
                            "authoritative page using screenshot fallback"
                        ),
                    })

                last_reason = (
                    "Authoritative page was relevant but inconclusive; "
                    "continued to another distinct official source"
                )

            return json.dumps({
                "decision": "UNKNOWN",
                "source_url": last_source_url,
                "reason": (
                    "No conclusive YES/NO evidence was found after "
                    "reviewing up to four distinct pages on the enforced "
                    "authority domain"
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

                # Validator independently performs the same source-fetch
                # strategy. It does not reuse the leader's evidence.
                try:
                    validator_source = (
                        gl.nondet.web.render(
                            source_url,
                            mode="text",
                            wait_after_loaded="5s",
                        )
                    )
                except Exception:
                    validator_source = ""

                if (
                    not validator_source
                    or len(validator_source) < 200
                ):
                    try:
                        validator_source = (
                            gl.nondet.web.render(
                                source_url,
                                mode="html",
                                wait_after_loaded="5s",
                            )
                        )
                    except Exception:
                        validator_source = ""

                if (
                    not validator_source
                    or len(validator_source) < 200
                ):
                    return (
                        leader_decision
                        == "UNKNOWN"
                    )

                validator_evidence = self._evidence_window(
                    validator_source
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
{validator_evidence}
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
ambiguous, irrelevant, or does not actually state
enough facts to establish YES or NO.

TOO_EARLY
The event has not happened yet or remains pending.

IMPORTANT:

A score, named winner/champion, official decision,
published figure, or equally direct statement counts
as conclusive evidence when it answers the question.
Do not infer a result merely from the URL or title.
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

                # If text is inconclusive while the leader reached a
                # conclusive verdict, independently inspect the SAME
                # authoritative URL as a screenshot.
                if (
                    validator_decision == "UNKNOWN"
                    and leader_decision in [
                        "YES",
                        "NO",
                        "TOO_EARLY",
                    ]
                ):
                    try:
                        validator_image = gl.nondet.web.render(
                            source_url,
                            mode="screenshot",
                            wait_after_loaded="5s",
                        )
                        validator_vision_prompt = f"""
Independently resolve the prediction-market
QUESTION using ONLY what is visibly shown in this
screenshot of the authoritative page.

QUESTION:
{question}

ENFORCED AUTHORITY DOMAIN:
{domain}

SOURCE URL:
{source_url}

Return EXACTLY ONE label:
YES
NO
UNKNOWN
TOO_EARLY

Do not infer a result merely from the URL.
Output ONE LABEL ONLY. No explanation.
"""
                        validator_vision_raw = gl.nondet.exec_prompt(
                            validator_vision_prompt,
                            images=[validator_image],
                        )
                        validator_decision = self._parse_verdict(
                            validator_vision_raw
                        )
                    except Exception:
                        validator_decision = "UNKNOWN"

                # Exact verdict consensus.
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
