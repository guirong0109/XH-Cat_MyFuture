import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from import_emasco_details import build_details  # noqa: E402


def role(code, **extra):
    base = {"code": code, "title": "T " + code, "description": "D", "group": "managers",
            "url": "https://emasco.mohr.gov.my/masco/" + code, "tags": ["x"], "qualification": "Degree",
            "tasks": ["Do a thing."], "skills": [{"text": "Plan", "type": "basic"}], "extra": "dropped"}
    base.update(extra)
    return base


class BuildDetailsTest(unittest.TestCase):
    def test_build_details_keeps_fields_and_order(self):
        out = build_details({"source": "eMASCO", "roles": [role("2-b"), role("1-a")], "tasksOnly": [], "unparsed": []})
        self.assertEqual(out["schemaVersion"], "emasco-role-details/v1")
        self.assertEqual(out["fetchedAt"], "2026-10-23")
        self.assertEqual([r["code"] for r in out["roles"]], ["1-a", "2-b"])
        self.assertEqual(set(out["roles"][0]), {"code", "title", "description", "url", "group", "tags",
                                                "qualification", "tasks", "skills", "pageState"})
        self.assertEqual(out["roles"][0]["pageState"], "full")

    def test_tasks_only_and_unparsed_states(self):
        old = {"roles": [role("1111-01")], "tasksOnly": [role("1112-01", skills=[])],
               "unparsed": ["1113-01: No tasks and no skills on the page for role 1113-01"]}
        by = {r["code"]: r for r in build_details(old)["roles"]}
        self.assertEqual(by["1112-01"]["pageState"], "tasks_only")
        self.assertEqual(by["1113-01"], {"code": "1113-01", "title": None, "pageState": "unparsed"})
        self.assertEqual(by["1111-01"]["pageState"], "full")

    def test_unparsed_code_already_present(self):
        empty = role("1113-01", tasks=[], skills=[])
        full = role("3118-07")
        old = {"roles": [empty, full], "tasksOnly": [],
               "unparsed": ["1113-01: x", "3118-07: x"]}
        by = {r["code"]: r for r in build_details(old)["roles"]}
        self.assertEqual(by["1113-01"]["pageState"], "unparsed")
        self.assertEqual(by["1113-01"]["title"], "T 1113-01")
        self.assertEqual(by["3118-07"]["pageState"], "full")
        self.assertEqual(len(by), 2)

    def test_bad_skill_type_rejected(self):
        with self.assertRaises(ValueError):
            build_details({"roles": [role("1-a", skills=[{"text": "x", "type": "other"}])]})


if __name__ == "__main__":
    unittest.main()
