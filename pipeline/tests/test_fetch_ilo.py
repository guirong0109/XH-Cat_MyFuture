import io
import json
import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fetch_ilo import build_snapshot, gradient, read_occupations  # noqa: E402

HEADER = ["label4d", "label1d", "ISCO_08", "Title", "taskID", "Task_ISCO", "score_2025", "mean_score_2025", "SD_2025"]
ROWS = [
    ["2512 - Software developers", "2 - Professionals", "2512", "Software developers", "1", "Design software", "0.8", "0.62", "0.05"],
    ["2512 - Software developers", "2 - Professionals", "2512", "Software developers", "2", "Test software", "0.7", "0.62", "0.05"],
    ["9111 - Domestic cleaners", "9 - Elementary", "9111", "Domestic cleaners and helpers", "1", "Clean", "0.1", "0.2", "0.1"],
]


def cell(ref, text):
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def fixture_xlsx(header=HEADER):
    rows = [header] + ROWS
    columns = "ABCDEFGHI"
    sheet = "".join(
        f'<row r="{i + 1}">' + "".join(cell(f"{columns[j]}{i + 1}", v) for j, v in enumerate(row)) + "</row>"
        for i, row in enumerate(rows))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml",
                         '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                         f"<sheetData>{sheet}</sheetData></worksheet>")
    return buffer.getvalue()


class GradientTest(unittest.TestCase):
    def test_gradient_bounds(self):
        self.assertEqual(gradient(0.6, 0.1), "G4")
        self.assertEqual(gradient(0.6, 0.15), "G3")  # mean - sd < 0.5
        self.assertEqual(gradient(0.55, 0.0), "G3")
        self.assertEqual(gradient(0.45, 0.1), "G2")
        self.assertEqual(gradient(0.35, 0.2), "G1")
        self.assertEqual(gradient(0.35, 0.1), "minimal")
        self.assertEqual(gradient(0.2, 0.1), "not_exposed")


class SnapshotTest(unittest.TestCase):
    def test_one_row_per_isco(self):
        rows = read_occupations(fixture_xlsx())
        self.assertEqual([r["isco"] for r in rows], ["2512", "9111"])
        self.assertEqual(rows[0], {"isco": "2512", "title": "Software developers", "mean": 0.62, "sd": 0.05, "gradient": "G4"})
        self.assertEqual(rows[1]["gradient"], "not_exposed")

    def test_missing_column_fails(self):
        with self.assertRaises(ValueError):
            read_occupations(fixture_xlsx([h.replace("SD_2025", "SD_XXXX") for h in HEADER]))

    def test_snapshot_files(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = build_snapshot(fixture_xlsx(), directory, now="2026-10-30")
            with open(os.path.join(directory, "ilo_wp140.tsv"), encoding="utf-8", newline="") as handle:
                lines = handle.read().split("\n")
            self.assertEqual(lines[0], "isco\ttitle\tmean\tsd\tgradient")
            self.assertEqual(lines[1], "2512\tSoftware developers\t0.62\t0.05\tG4")
            with open(os.path.join(directory, "manifest.json"), encoding="utf-8") as handle:
                self.assertEqual(json.load(handle), manifest)
            self.assertEqual(manifest["licence"], "CC BY 4.0")
            self.assertEqual(manifest["occupations"], 2)
            self.assertEqual(len(manifest["files"]["ilo_wp140.tsv"]), 64)
            self.assertTrue(os.path.exists(os.path.join(directory, "source", "Final_Scores_ISCO08_Gmyrek_et_al_2025.xlsx")))


if __name__ == "__main__":
    unittest.main()
