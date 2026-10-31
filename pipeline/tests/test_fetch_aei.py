import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_aei import extract  # noqa: E402

TASKS = {"8823": "8823", "Direct budgets.": "8823", "8824": "8824"}


def row(key, metric, value, category="onet", level="0", geo="global", name=""):
    return {"category_name": category, "hierarchy_level": level, "geo_level": geo, "geo_id": "GLOBAL" if geo == "global" else "MYS",
            "metric_id": metric, "value": value, "node_external_id": key, "node_name": name}


def three(key, **kw):
    return [row(key, "pct", "0.5", **kw), row(key, "collaboration_bucket_automation_pct", "30", **kw),
            row(key, "collaboration_bucket_augmentation_pct", "60", **kw)]


class ExtractTest(unittest.TestCase):
    def test_extract_task_rows_only(self):
        rows = (three("8823") + three("8824", category="request") + three("8824", level="1") + three("8824", geo="country")
                + [row("8824", "multitasking_pct", "9")])
        self.assertEqual(extract(rows, TASKS), [("8823", 0.5, 30.0, 60.0)])

    def test_match_by_id_or_text(self):
        rows = three("8823") + three("Direct budgets.")
        stats = {}
        out = extract(rows, {"8823": "8823", "Direct budgets.": "9999"}, stats)
        self.assertEqual([r[0] for r in out], ["8823", "9999"])

    def test_unmatched_counted(self):
        rows = three("8823") + three("zzz") + three("yyy")
        stats = {}
        out = extract(rows, TASKS, stats)
        self.assertEqual(len(out), 1)
        self.assertEqual(stats["matched"], 1)
        self.assertEqual(stats["unmatched"], 2)
        self.assertEqual(stats["unmatchedExamples"], ["zzz", "yyy"])

    def test_one_period(self):
        old = three("8823")
        for r in old:
            r["date_start"] = "2026-04-01"
        new = three("8824")
        for r in new:
            r["date_start"] = "2026-05-01"
        self.assertEqual([r[0] for r in extract(old + new, TASKS, period="2026-05-01")], ["8824"])

    def test_missing_metric_left_empty(self):
        out = extract([row("8823", "pct", "0.5")], TASKS)
        self.assertEqual(out, [("8823", 0.5, None, None)])


if __name__ == "__main__":
    unittest.main()
