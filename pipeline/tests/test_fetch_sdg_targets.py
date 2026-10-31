import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from fetch_sdg_targets import parse_goal_targets  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "sdg_goal4_targets.json")
OUT = os.path.join(HERE, "..", "..", "data", "sdg", "targets.json")


class ParseGoal4(unittest.TestCase):
    def load(self):
        with open(FIXTURE, encoding="utf-8") as f:
            return json.load(f)

    def test_parse_goal4(self):
        targets = {t["code"]: t for t in parse_goal_targets(self.load())}
        self.assertIn("4.4", targets)
        self.assertTrue(targets["4.4"]["title"].startswith("By 2030, substantially increase the number of youth and adults"))
        self.assertEqual(targets["4.4"]["goal"], "4")

    def test_lettered_targets_are_strings_with_goal_from_code(self):
        targets = {t["code"]: t for t in parse_goal_targets(self.load())}
        for code in ("4.a", "4.b", "4.c"):
            self.assertEqual(targets[code]["goal"], "4")
        self.assertEqual(len(targets), 10)

    def test_goal_field_null_in_api_is_derived(self):
        payload = [{"code": "9", "targets": [{"goal": None, "code": "9.1", "title": "x"}]}]
        self.assertEqual(parse_goal_targets(payload), [{"code": "9.1", "goal": "9", "title": "x"}])

    def test_flat_target_list_also_parses(self):
        payload = [{"goal": "1", "code": "1.1", "title": "y", "indicators": None}]
        self.assertEqual(parse_goal_targets(payload), [{"code": "1.1", "goal": "1", "title": "y"}])


@unittest.skipUnless(os.path.exists(OUT), "data/sdg/targets.json not written yet")
class WrittenFile(unittest.TestCase):
    def test_counts_17_and_169(self):
        with open(OUT, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(len(data["goals"]), 17)
        self.assertEqual(len(data["targets"]), 169)
        goals = {g["code"] for g in data["goals"]}
        self.assertTrue(all(t["goal"] in goals for t in data["targets"]))
        self.assertEqual(len({t["code"] for t in data["targets"]}), len(data["targets"]))


if __name__ == "__main__":
    unittest.main()
