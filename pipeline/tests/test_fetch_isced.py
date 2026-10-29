import io
import json
import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_isced import write_snapshot  # noqa: E402

CONCORDANCE = (
    "ISCED-F 2013 Code,ISCED-F 2013 Title,CIP Canada 2016 Code,CIP Canada 2016 Title,Explanatory Notes\r\n"
    "0613,Software and applications development and analysis,11.0701,Computer science,\r\n"
    "0913,Nursing and midwifery,51.3801,Registered nursing/registered nurse,\r\n"
    "0912*,Medicine,51.3801*,Registered nursing/registered nurse,Only the clinical part\r\n"
    "9999,Field unknown,99.9999,Unknown,\r\n"
).encode("cp1252")


def cell(ref, text):
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def crosswalk_xlsx():
    rows = [
        ["O*NET-SOC 2019 Crosswalks"],
        ["2020 CIP Code", "2020 CIP Title", "O*NET-SOC 2019 Code", "O*NET-SOC 2019 Title"],
        ["11.0701", "Computer Science", "15-1252.00", "Software Developers"],
        ["51.3801", "Registered Nursing/Registered Nurse", "29-1141.00", "Registered Nurses"],
        ["52.0101", "Business/Commerce, General", "11-1021.00", "General and Operations Managers"],
    ]
    sheet = "".join(
        f'<row r="{i + 1}">' + "".join(cell(f"{'ABCD'[j]}{i + 1}", v) for j, v in enumerate(row)) + "</row>"
        for i, row in enumerate(rows))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml",
                         '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                         f"<sheetData>{sheet}</sheetData></worksheet>")
    return buffer.getvalue()


def read_tsv(path):
    with open(path, encoding="utf-8", newline="") as handle:
        lines = handle.read().split("\n")
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"))) for line in lines[1:] if line]


class FetchIscedTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.manifest = write_snapshot(CONCORDANCE, crosswalk_xlsx(), self.dir, now="2026-10-30")

    def test_fields_list_every_isced_code_once_with_its_broad_field(self):
        fields = read_tsv(os.path.join(self.dir, "fields.tsv"))
        self.assertEqual([f["code"] for f in fields], ["0613", "0912", "0913", "9999"])
        nursing = next(f for f in fields if f["code"] == "0913")
        self.assertEqual(nursing["title"], "Nursing and midwifery")
        self.assertEqual((nursing["broad_code"], nursing["broad_title"]), ("09", "Health and welfare"))

    def test_concordance_keeps_partial_links_and_notes(self):
        links = read_tsv(os.path.join(self.dir, "isced_cip.tsv"))
        medicine = next(l for l in links if l["isced_code"] == "0912")
        self.assertEqual(medicine["cip_code"], "51.3801")
        self.assertEqual(medicine["partial"], "Y")
        self.assertEqual(medicine["note"], "Only the clinical part")
        self.assertEqual(next(l for l in links if l["isced_code"] == "0913")["partial"], "N")

    def test_crosswalk_rows_come_from_onet_unchanged(self):
        rows = read_tsv(os.path.join(self.dir, "cip_onet.tsv"))
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0], {"cip_code": "11.0701", "cip_title": "Computer Science", "code": "15-1252.00", "title": "Software Developers"})

    def test_manifest_hashes_each_file_and_counts_the_bridge(self):
        self.assertEqual(sorted(self.manifest["files"]), ["cip_onet.tsv", "fields.tsv", "isced_cip.tsv"])
        self.assertEqual(self.manifest["downloadedAt"], "2026-10-30")
        # 0613 and 0913 reach O*NET through a CIP code; 0912 too (partial); 9999 does not.
        self.assertEqual(self.manifest["bridge"], {"fields": 4, "fieldsLinkedToOnet": 3})
        with open(os.path.join(self.dir, "manifest.json"), encoding="utf-8") as handle:
            self.assertEqual(json.load(handle), self.manifest)


if __name__ == "__main__":
    unittest.main()
