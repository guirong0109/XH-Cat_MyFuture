import hashlib
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_radar_bridge import build_bridge, STEPS  # noqa: E402

ONET_SOC = (
    "O*NET-SOC 2019 Code,O*NET-SOC 2019 Title,2018 SOC Code,2018 SOC Title\n"
    "15-1252.00,Software Developers,15-1252,Software Developers\n"
    "15-2051.01,Business Intelligence Analysts,15-2051,Data Scientists\n"
).encode("utf-8")
SOC_2010_2018 = (
    "Some title row\n"
    "2010 SOC Code,2010 SOC Title,2018 SOC Code,2018 SOC Title\n"
    "15-1132,Software Developers Applications,15-1252,Software Developers\n"
    "15-1133,Software Developers Systems Software,15-1252,Software Developers\n"
).encode("utf-8")
ISCO_SOC = (
    "ISCO-08 Code,ISCO-08 Title EN,Part,2010 SOC Code,2010 SOC Title,Comment\n"
    "2512,Software developers,,15-1132,Software Developers Applications,\n"
).encode("utf-8")


def step(bridge, step_id):
    return next(s for s in bridge["steps"] if s["id"] == step_id)


class BuildBridgeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, data):
        with open(os.path.join(self.dir, name), "wb") as handle:
            handle.write(data)

    def test_steps_without_their_file_are_pending_and_hashes_are_recorded(self):
        self.put("2019_to_SOC_Crosswalk.csv", ONET_SOC)
        bridge = build_bridge(self.dir, now="2026-10-30")
        onet = step(bridge, "onet_to_soc2018")
        self.assertEqual(onet["status"], "built")
        self.assertEqual(onet["source"]["sha256"], hashlib.sha256(ONET_SOC).hexdigest())
        self.assertEqual(onet["links"]["15-1252.00"], ["15-1252"])
        for pending in ("soc2018_to_soc2010", "soc2010_to_isco08", "isco08_to_masco2020_major"):
            item = step(bridge, pending)
            self.assertEqual(item["status"], "pending")
            self.assertIsNone(item["source"])
            self.assertTrue(item["pendingReason"])
            self.assertEqual(item["links"], {})

    def test_the_masco_step_stays_pending_even_when_every_other_file_is_present(self):
        self.put("2019_to_SOC_Crosswalk.csv", ONET_SOC)
        self.put("soc_2010_to_2018_crosswalk.csv", SOC_2010_2018)
        self.put("isco_soc_crosswalk.csv", ISCO_SOC)
        bridge = build_bridge(self.dir, now="2026-10-30")
        self.assertEqual(step(bridge, "soc2018_to_soc2010")["links"]["15-1252"], ["15-1132", "15-1133"])
        self.assertEqual(step(bridge, "soc2010_to_isco08")["links"]["15-1132"], ["2512"])
        self.assertEqual(step(bridge, "soc2010_to_isco08")["source"]["sha256"], hashlib.sha256(ISCO_SOC).hexdigest())
        self.assertEqual(step(bridge, "isco08_to_masco2020_major")["status"], "pending")

    def test_nothing_present_gives_a_bridge_of_pending_steps(self):
        bridge = build_bridge(self.dir, now="2026-10-30")
        self.assertEqual([s["status"] for s in bridge["steps"]], ["pending"] * 5)
        json.dumps(bridge)

    def test_masco_step_pending_without_isco_file(self):
        bridge = build_bridge(self.dir, now="2026-10-30", emasco_codes=["2512-01"])
        item = step(bridge, "masco2020_unit_to_isco08")
        self.assertEqual(item["status"], "pending")
        self.assertEqual(item["pendingReason"], "waits for the ISCO-08 code list in the BLS ISCO file")
        self.assertEqual(item["links"], {})
        self.assertEqual(item["method"], "same_code")
        self.assertEqual(item["label"], "code match, not an official table")
        self.assertEqual(item["from"], {"system": "MASCO", "version": "2020"})
        self.assertEqual(item["to"], {"system": "ISCO-08", "version": "2008"})
        self.assertIsNone(item["source"]["file"])
        self.assertIsNone(item["source"]["sha256"])
        self.assertEqual(item["source"]["url"], "https://jtksm.gov.my/sites/default/files/2022-12/MASCO_2020_BI_Edaran.pdf")

    def test_masco_step_same_code_only_for_isco_codes(self):
        self.put("isco_soc_crosswalk.csv", ISCO_SOC)
        bridge = build_bridge(self.dir, now="2026-10-30", emasco_codes=["2512-01", "1611-01", "2512-02"])
        item = step(bridge, "masco2020_unit_to_isco08")
        self.assertEqual(item["status"], "built")
        self.assertEqual(item["links"], {"2512": ["2512"]})
        self.assertIsNone(item["pendingReason"])

    def test_isco_file_name_variants(self):
        for name in ("ISCO_SOC_Crosswalk.csv", "ISCO_SOC_Crosswalk.xlsx"):
            self.assertIn(name.lower(), [n.lower() for n in STEPS[2][3]])
        self.put("ISCO_SOC_Crosswalk.csv", ISCO_SOC)
        bridge = build_bridge(self.dir, now="2026-10-30")
        self.assertEqual(step(bridge, "soc2010_to_isco08")["status"], "built")
        self.assertEqual(step(bridge, "soc2010_to_isco08")["source"]["file"], "ISCO_SOC_Crosswalk.csv")


if __name__ == "__main__":
    unittest.main()
