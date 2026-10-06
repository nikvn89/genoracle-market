"""
Golden vectors for the evidence identity, computed by the contract's own
`_normalize_url`. The frontend test src/lib/evidence.test.ts reads the same file,
so the "Recorded as" preview in the UI cannot drift from the contract.

Regenerate: WRITE_VECTORS=1 python3 -m unittest tests/test_identity_vectors.py
"""
import json
import os
import unittest

from harness import Harness

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vectors", "evidence-identity.json")
URLS = [
    "https://nasa.gov/report",
    "https://www.nasa.gov/report",
    "https://WWW.NASA.GOV/Report/",
    "https://nasa.gov/report?v=2",
    "https://nasa.gov/report/?utm_source=x#top",
    "https://nasa.gov/report///",
    "http://www.nasa.gov/report",
    "https://science.nasa.gov/missions/artemis-ii",
    "https://www.fifa.com/en/tournaments/mens/worldcup?tab=results",
    "  https://bls.gov/news.release/cpi.nr0.htm\t",
    "\u001chttps://sec.gov/x\u0085",
    "https://nasa.gov",
    "https://nasa.gov/",
    "https://nasa.gov/a#b?c",
    "",
]


class IdentityVectors(unittest.TestCase):
    def test_vectors_match_the_contract(self):
        c = Harness(seed=3).contract
        data = {"cases": [{"url": u, "recorded_as": c._normalize_url(u)} for u in URLS]}
        if os.environ.get("WRITE_VECTORS") == "1":
            with open(PATH, "w", encoding="utf-8") as handle:
                handle.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        with open(PATH, encoding="utf-8") as handle:
            self.assertEqual(json.load(handle), data)


if __name__ == "__main__":
    unittest.main()
