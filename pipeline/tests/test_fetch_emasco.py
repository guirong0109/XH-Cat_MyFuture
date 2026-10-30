# Fixture emasco_2521-03.html: https://emasco.mohr.gov.my/masco/2521-03 (English view, session language set with
# ?lang=en), saved 2026-10-30 with Python urllib after robots.txt allowed everything (User-agent *, empty Disallow).
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_emasco  # noqa: E402
from fetch_emasco import allowed, main, parse_role  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "emasco_2521-03.html")
URL = "https://emasco.mohr.gov.my/masco/2521-03"


def load_fixture():
    with open(FIXTURE, encoding="utf-8") as handle:
        return handle.read()


class ParseRoleTest(unittest.TestCase):
    def test_parse_fixture(self):
        role = parse_role(load_fixture(), "2521-03", URL)
        self.assertEqual(role["code"], "2521-03")
        self.assertEqual(role["title"], "Business Database Analyst")
        self.assertEqual(role["url"], URL)
        self.assertTrue(role["description"].startswith("Business Database Analyst uses data analysis"))
        self.assertGreaterEqual(len(role["tasks"]), 1)
        self.assertEqual(len(role["tasks"]), 7)
        self.assertGreaterEqual(len(role["skills"]), 1)
        self.assertTrue(all(s["type"] in ("basic", "specific") for s in role["skills"]))
        self.assertEqual([s["type"] for s in role["skills"]], ["basic"] * 5 + ["specific"] * 5)
        self.assertEqual(role["tags"], ["TVET"])
        self.assertEqual(role["qualification"], "Bachelor’s degree or equivalent")
        self.assertEqual(role["group"], "professionals")
        self.assertEqual(role["subMajorGroup"],
                         {"code": "25", "title": "Information and Communications Technology Professionals"})
        self.assertEqual(role["pageState"], "full")

    def test_matches_role_details_for_same_role(self):
        path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "emasco", "role_details.json")
        if not os.path.exists(path):
            self.skipTest("role_details.json not present")
        with open(path, encoding="utf-8") as handle:
            old = {r["code"]: r for r in json.load(handle)["roles"]}["2521-03"]
        role = parse_role(load_fixture(), "2521-03", URL)
        for key in ("title", "description", "tasks", "skills", "qualification", "group", "tags"):
            self.assertEqual(role[key], old[key], key)

    def test_page_without_content_is_unparsed(self):
        role = parse_role("<html><body><p>Not found</p></body></html>", "9999-99", "u")
        self.assertEqual(role["pageState"], "unparsed")
        self.assertIsNone(role["title"])
        self.assertEqual(role["tasks"], [])
        self.assertEqual(role["skills"], [])
        self.assertIsNone(role["subMajorGroup"])


class RobotsTest(unittest.TestCase):
    def test_robots_disallow(self):
        self.assertIs(allowed("User-agent: *\nDisallow: /masco/\n", "/masco/2521-03"), False)

    def test_robots_empty_disallow_allows(self):
        self.assertIs(allowed("User-agent: *\nDisallow:\n", "/masco/2521-03"), True)

    def test_robots_other_agent_ignored_and_allow_wins_when_longer(self):
        text = "User-agent: Bad\nDisallow: /\n\nUser-agent: *\nDisallow: /masco/\nAllow: /masco/2521-03\n"
        self.assertIs(allowed(text, "/masco/2521-03"), True)
        self.assertIs(allowed(text, "/masco/2521-04"), False)


class MainTest(unittest.TestCase):
    def run_main(self, fetch, extra=None):
        out = tempfile.mkdtemp()
        argv = ["fetch_emasco.py", "--out-dir", out] + (extra or [])
        code = main(argv, fetch=fetch, today="2026-11-01", sleep=lambda s: None)
        return code, out

    def test_main_refuses_when_disallowed(self):
        calls = []

        def fetch(url):
            calls.append(url)
            return "User-agent: *\nDisallow: /masco/\n"

        code, out = self.run_main(fetch, ["--codes", "2521-03"])
        self.assertEqual(code, 2)
        self.assertEqual(os.listdir(out), [])
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].endswith("/robots.txt"))

    def test_main_writes_crawl_file_and_never_role_details(self):
        page = load_fixture()

        def fetch(url):
            return "User-agent: *\nDisallow:\n" if url.endswith("/robots.txt") else page

        code, out = self.run_main(fetch, ["--codes", "2521-03"])
        self.assertEqual(code, 0)
        self.assertEqual(os.listdir(out), ["crawl-2026-11-01.json"])
        with open(os.path.join(out, "crawl-2026-11-01.json"), encoding="utf-8") as handle:
            data = json.load(handle)
        self.assertEqual(data["schemaVersion"], "emasco-role-details/v1")
        self.assertEqual(data["fetchedAt"], "2026-11-01")
        self.assertEqual([r["code"] for r in data["roles"]], ["2521-03"])
        self.assertEqual(data["roles"][0]["title"], "Business Database Analyst")

    def test_main_waits_between_requests(self):
        sleeps = []
        page = load_fixture()

        def fetch(url):
            return "User-agent: *\nDisallow:\n" if url.endswith("/robots.txt") else page

        out = tempfile.mkdtemp()
        main(["x", "--out-dir", out, "--codes", "2521-03,2521-04"], fetch=fetch, today="2026-11-01",
             sleep=sleeps.append)
        self.assertGreaterEqual(len(sleeps), 2)
        self.assertTrue(all(s >= 1 for s in sleeps))

    def test_fetch_error_becomes_unparsed_stub(self):
        def fetch(url):
            if url.endswith("/robots.txt"):
                return "User-agent: *\nDisallow:\n"
            raise OSError("boom")

        code, out = self.run_main(fetch, ["--codes", "2521-03"])
        self.assertEqual(code, 0)
        with open(os.path.join(out, "crawl-2026-11-01.json"), encoding="utf-8") as handle:
            role = json.load(handle)["roles"][0]
        self.assertEqual(role["pageState"], "unparsed")


if __name__ == "__main__":
    unittest.main()
