#!/usr/bin/env python3
"""
Mutation check -- does the suite actually have teeth?

A test suite that passes proves nothing on its own; it has to be shown to fail
when the contract is wrong. This script makes 22 small, targeted edits to
`contracts/market.py` -- each one a plausible mistake that breaks a property the
suite claims to protect -- and runs the whole suite against each mutant.

  KILLED    at least one test failed. The property is genuinely defended.
  SURVIVED  every test still passed. That mutant is an untested gap.

Nothing under `contracts/` is modified: each mutant is written to a temporary
directory and the suite is pointed at it through GENORACLE_CONTRACT.

    python3 tests/mutation_check.py
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRACT = os.path.join(ROOT, "contracts", "market.py")
TESTS = os.path.join(ROOT, "tests")

# (id, what it breaks, exact source to replace, replacement)
MUTANTS = [
    ("M01", "winner is paid from their own side only, not the whole pool",
     "payout = (user_yes * total_pool) // yes_pool",
     "payout = (user_yes * yes_pool) // yes_pool"),
    ("M02", "NO winner is paid from their own side only",
     "payout = (user_no * total_pool) // no_pool",
     "payout = (user_no * no_pool) // no_pool"),
    ("M03", "anyone may bet on another address's behalf",
     '        if self._sender() != user_key:\n            raise gl.vm.UserError("Sender must match the betting address")',
     '        if False:\n            raise gl.vm.UserError("Sender must match the betting address")'),
    ("M04", "anyone may claim another address's winnings",
     '        if self._sender() != user_key:\n            raise gl.vm.UserError("Sender must match the claiming address")',
     '        if False:\n            raise gl.vm.UserError("Sender must match the claiming address")'),
    ("M05", "betting is not limited by balance",
     "        if balance < amount:",
     "        if balance < 0:"),
    ("M06", "a winning position is not cleared, so it can be claimed twice",
     "                payout = (user_yes * total_pool) // yes_pool\n                market[\"yes_positions\"][user_key] = 0",
     "                payout = (user_yes * total_pool) // yes_pool"),
    ("M07", "zero and negative bets are accepted",
     "        if amount <= 0:",
     "        if amount < 0:"),
    ("M08", "domain match falls back to a bare suffix test",
     '        return host == clean_domain or host.endswith("." + clean_domain)',
     "        return host.endswith(clean_domain)"),
    ("M09", "plain http evidence is accepted",
     '        if not lower.startswith("https://"):\n            return False',
     "        if False:\n            return False"),
    ("M10", "userinfo and port spoofing are accepted",
     '        if "@" in host or ":" in host:\n            return False',
     "        if False:\n            return False"),
    ("M11", "duplicate evidence URLs are accepted",
     '        for item in evidence:\n            if item.get("normalized_url", "") == normalized:\n                raise gl.vm.UserError("Evidence URL already submitted")',
     "        for item in evidence:\n            pass"),
    ("M12", "the per-market evidence cap is off by one",
     "        if len(evidence) >= self._max_evidence():",
     "        if len(evidence) > self._max_evidence():"),
    ("M13", "the per-address evidence cap is off by one",
     "        if current >= self._max_per_address():",
     "        if current > self._max_per_address():"),
    ("M14", "evidence may be submitted before the betting deadline",
     '        if now < int(market["deadline_ts"]):\n            raise gl.vm.UserError(\n                "Evidence can only be submitted after the betting deadline"\n            )',
     '        if False:\n            raise gl.vm.UserError("unreachable")'),
    ("M15", "resolution does not wait for the evidence window",
     '        if now < int(market["resolve_open_at"]):\n            raise gl.vm.UserError(\n                "TOO_EARLY: evidence collection window is still open"\n            )',
     '        if False:\n            raise gl.vm.UserError("unreachable")'),
    ("M16", "the market may be re-adjudicated without new evidence",
     "        if len(evidence) <= last_count:",
     "        if len(evidence) < last_count:"),
    ("M17", "a market may be created with a deadline in the past",
     "        if deadline_ts <= now:",
     "        if deadline_ts <= 0:"),
    ("M18", "the per-creator active-market cap is removed",
     "        if active_creator >= 5:",
     "        if active_creator >= 500:"),
    ("M19", "betting never closes at the deadline",
     '        if self._now() >= int(market.get("deadline_ts", 0)):\n            return "EVIDENCE"',
     "        if False:\n            return \"EVIDENCE\""),
    ("M20", "the faucet may be sent to someone else's address",
     '        if sender != user_key:\n            raise gl.vm.UserError("Can only faucet to your own address")',
     '        if False:\n            raise gl.vm.UserError("Can only faucet to your own address")'),
    ("M21", "a market may be expired before its expiry time",
     '        if self._now() < int(market["expiry_at"]):\n            raise gl.vm.UserError("TOO_EARLY: market has not reached expiry")',
     '        if False:\n            raise gl.vm.UserError("unreachable")'),
    ("M22", "a failed market refunds only the YES side",
     "            payout = user_yes + user_no\n            market[\"yes_positions\"][user_key] = 0\n            market[\"no_positions\"][user_key] = 0\n\n        else:\n            raise gl.vm.UserError(\"Unknown market status\")",
     "            payout = user_yes\n            market[\"yes_positions\"][user_key] = 0\n            market[\"no_positions\"][user_key] = 0\n\n        else:\n            raise gl.vm.UserError(\"Unknown market status\")"),
]


def run_suite(contract_path):
    env = dict(os.environ, GENORACLE_CONTRACT=contract_path)
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", TESTS],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def main():
    source = open(CONTRACT, encoding="utf-8").read()

    code, output = run_suite(CONTRACT)
    if code != 0:
        print("Baseline suite is already failing; fix that first.\n")
        print(output[-2000:])
        return 1
    print("baseline            PASS\n")

    workdir = tempfile.mkdtemp(prefix="genoracle-mutants-")
    killed, survived, invalid = [], [], []

    try:
        for mutant_id, description, old, new in MUTANTS:
            if source.count(old) != 1:
                invalid.append((mutant_id, description, source.count(old)))
                print(f"{mutant_id}  INVALID   pattern matched "
                      f"{source.count(old)} times -- {description}")
                continue

            path = os.path.join(workdir, f"{mutant_id}.py")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(source.replace(old, new))

            code, _ = run_suite(path)
            if code == 0:
                survived.append((mutant_id, description))
                print(f"{mutant_id}  SURVIVED  {description}")
            else:
                killed.append((mutant_id, description))
                print(f"{mutant_id}  killed    {description}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    total = len(MUTANTS)
    print(f"\n{len(killed)}/{total} killed, {len(survived)} survived, "
          f"{len(invalid)} invalid")

    if survived:
        print("\nUntested gaps:")
        for mutant_id, description in survived:
            print(f"  {mutant_id}  {description}")

    return 0 if not survived and not invalid else 1


if __name__ == "__main__":
    sys.exit(main())
