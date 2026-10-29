import io
import json
import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_onet import write_snapshot  # noqa: E402


def table(*rows):
    return "\n".join("\t".join(row) for row in rows) + "\n"


SKILL_HEADER = ("O*NET-SOC Code", "Element ID", "Element Name", "Scale ID", "Data Value", "N")


def zip_31():
    """O*NET 31.0 layout: Job Titles, Essential/Transferable Skills, Software Skills."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("db_31_0_text/Occupation Data.txt", table(
            ("O*NET-SOC Code", "Title", "Description"), ("15-2051.00", "Data Scientists", "Develop methods.")))
        archive.writestr("db_31_0_text/Job Titles.txt", table(
            ("O*NET-SOC Code", "Job Title", "Short Title", "Source(s)"), ("15-2051.00", "Data Analytics Scientist", "n/a", "08")))
        archive.writestr("db_31_0_text/Sample of Reported Titles.txt", table(
            ("O*NET-SOC Code", "Reported Job Title", "Shown in My Next Move"), ("15-2051.00", "Data Scientist", "Y")))
        archive.writestr("db_31_0_text/Essential Skills.txt", table(
            SKILL_HEADER, ("15-2051.00", "2.A.1.a", "Reading Comprehension", "IM", "4.00", "8"),
            ("15-2051.00", "2.A.1.a", "Reading Comprehension", "LV", "4.50", "8")))
        archive.writestr("db_31_0_text/Transferable Skills.txt", table(
            SKILL_HEADER, ("15-2051.00", "2.B.1.a", "Social Perceptiveness", "IM", "3.10", "8")))
        archive.writestr("db_31_0_text/Software Skills.txt", table(
            ("O*NET-SOC Code", "Workplace Example", "Element ID", "Element Name", "Hot Technology", "In Demand"),
            ("15-2051.00", "Python", "2.E.5.c", "Development environment software", "Y", "Y")))
    return buffer.getvalue()


def zip_30():
    """Older layout: Alternate Titles, Skills, Technology Skills."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("db_30_0_text/Occupation Data.txt", table(("O*NET-SOC Code", "Title", "Description"), ("15-2051.00", "Data Scientists", "D.")))
        archive.writestr("db_30_0_text/Alternate Titles.txt", table(("O*NET-SOC Code", "Title", "Alternate Title"), ("15-2051.00", "Data Scientists", "Data Miner")))
        archive.writestr("db_30_0_text/Sample of Reported Titles.txt", table(("O*NET-SOC Code", "Title", "Reported Job Title"), ("15-2051.00", "Data Scientists", "Data Miner")))
        archive.writestr("db_30_0_text/Skills.txt", table(
            ("O*NET-SOC Code", "Title", "Element ID", "Element Name", "Scale ID", "Data Value"), ("15-2051.00", "X", "2.A.1.c", "Writing", "IM", "3.0")))
        archive.writestr("db_30_0_text/Technology Skills.txt", table(
            ("O*NET-SOC Code", "Title", "Example", "Commodity Code", "Commodity Title"), ("15-2051.00", "X", "SQL", "1", "Database software")))
    return buffer.getvalue()


def lines(directory, name):
    with open(os.path.join(directory, name), encoding="utf-8") as handle:
        return handle.read().splitlines()


class FetchOnetTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        write_snapshot(zip_31(), self.dir, version="31.0", source_url="https://example.test/db.zip", now="2026-10-29")

    def test_trims_the_31_layout_to_the_listed_columns(self):
        self.assertEqual(lines(self.dir, "occupations.tsv"), ["code\ttitle\tdescription", "15-2051.00\tData Scientists\tDevelop methods."])
        self.assertEqual(lines(self.dir, "job_titles.tsv"), ["code\ttitle", "15-2051.00\tData Analytics Scientist", "15-2051.00\tData Scientist"])
        self.assertEqual(lines(self.dir, "skills.tsv"), [
            "element_id\telement\tcode\timportance",
            "2.A.1.a\tReading Comprehension\t15-2051.00\t4.00",
            "2.B.1.a\tSocial Perceptiveness\t15-2051.00\t3.10",
        ])
        self.assertEqual(lines(self.dir, "software.tsv"), ["example\telement_id\telement\tcode", "Python\t2.E.5.c\tDevelopment environment software\t15-2051.00"])

    def test_older_layout_still_works(self):
        out = tempfile.mkdtemp()
        write_snapshot(zip_30(), out, version="30.0", source_url="u", now="2026-10-29")
        self.assertEqual(lines(out, "job_titles.tsv"), ["code\ttitle", "15-2051.00\tData Miner"])
        self.assertEqual(lines(out, "software.tsv"), ["example\telement_id\telement\tcode", "SQL\t\tDatabase software\t15-2051.00"])

    def test_manifest_has_version_and_hashes(self):
        with open(os.path.join(self.dir, "manifest.json"), encoding="utf-8") as handle:
            manifest = json.load(handle)
        self.assertEqual(manifest["version"], "31.0")
        self.assertEqual(manifest["licence"], "CC BY 4.0")
        self.assertEqual(manifest["downloadedAt"], "2026-10-29")
        self.assertIn("CC BY 4.0", manifest["attribution"])
        self.assertEqual(sorted(manifest["files"]), ["job_titles.tsv", "occupations.tsv", "skills.tsv", "software.tsv"])
        self.assertTrue(all(len(value) == 64 for value in manifest["files"].values()))

    def test_missing_file_in_zip_raises(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("x/Occupation Data.txt", "O*NET-SOC Code\tTitle\tDescription\n")
        with self.assertRaises(ValueError):
            write_snapshot(buffer.getvalue(), tempfile.mkdtemp(), version="31.0", source_url="u", now="2026-10-29")


if __name__ == "__main__":
    unittest.main()
