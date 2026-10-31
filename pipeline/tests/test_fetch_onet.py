import hashlib
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
        archive.writestr("db_31_0_text/Specific Interest Areas.txt", table(
            ("O*NET-SOC Code", "Title", "Element ID", "Element Name", "Scale ID", "Scale Name", "Data Value", "Date", "Domain Source"),
            ("15-2051.00", "Data Scientists", "1.B.3.q", "Information Technology", "DS", "Summary Display Rank", "1.00", "05/2026", "AI/Expert"),
            ("15-2051.00", "Data Scientists", "1.B.3.q", "Information Technology", "OI", "Occupational Interests", "6.10", "05/2026", "AI/Expert")))
        archive.writestr("db_31_0_text/Work Styles.txt", table(
            ("O*NET-SOC Code", "Element ID", "Element Name", "Scale ID", "Data Value", "Date", "Domain Source"),
            ("15-2051.00", "1.D.1.a", "Leadership Orientation", "DR", "4.00", "05/2026", "AI/Expert"),
            ("15-2051.00", "1.D.1.a", "Leadership Orientation", "WI", "1.25", "05/2026", "AI/Expert")))
        archive.writestr("db_31_0_text/Knowledge.txt", table(
            ("O*NET-SOC Code", "Element ID", "Element Name", "Scale ID", "Data Value", "N"),
            ("15-2051.00", "2.C.4.a", "Mathematics", "IM", "4.50", "8"),
            ("15-2051.00", "2.C.4.a", "Mathematics", "LV", "5.10", "8")))
        archive.writestr("db_31_0_text/Task Statements.txt", table(
            ("O*NET-SOC Code", "Task ID", "Task", "Task Type", "Incumbents Responding", "Date", "Domain Source"),
            ("15-2051.00", "8823", "Analyze data and report.", "Core", "20", "08/2014", "Incumbent"),
            ("15-2051.00", "8824", "Build models.", "Supplemental", "", "08/2014", "Analyst")))
        archive.writestr("db_31_0_text/GWAs to IWAs to DWAs.txt", table(
            ("GWA Element ID", "IWA Element ID", "DWA Element ID", "DWA Element Name"),
            ("4.A.2.a.4", "4.A.2.a.4.i", "4.A.2.a.4.i.3", "Analyze data to identify trends.")))
        archive.writestr("db_31_0_text/Tasks to DWAs.txt", table(
            ("O*NET-SOC Code", "Task ID", "DWA Element ID", "Date", "Domain Source"),
            ("15-2051.00", "1", "4.A.2.a.4.i.3", "07/2014", "Analyst"),
            ("15-2051.00", "2", "4.A.2.a.4.i.3", "07/2014", "Analyst")))
        archive.writestr("db_31_0_text/Education.txt", table(
            ("O*NET-SOC Code", "Element ID", "Element Name", "Scale ID", "Category", "Data Value", "N", "Standard Error", "Lower CI Bound", "Upper CI Bound", "Recommend Suppress", "Date", "Domain Source"),
            ("15-2051.00", "2.D.1", "Required Level of Education", "RL", "1", "0.00", "20", "0", "0", "0", "N", "05/2026", "Incumbent"),
            ("15-2051.00", "2.D.1", "Required Level of Education", "RL", "6", "84.80", "20", "5", "60", "95", "Y", "05/2026", "Incumbent"),
            ("15-2051.00", "2.D.1", "Required Level of Education", "RL", "12", "15.20", "20", "5", "2", "30", "N", "05/2026", "Incumbent"),
            ("15-2051.00", "2.D.1", "Required Level of Education", "PT", "1", "9.99", "20", "0", "0", "0", "N", "05/2026", "Incumbent"),
            ("11-1011.00", "2.D.1", "Required Level of Education", "RL", "6", "50.00", "20", "5", "30", "70", "N", "05/2026", "Incumbent")))
        archive.writestr("db_31_0_text/Education Categories.txt", table(
            ("Element ID", "Element Name", "Scale ID", "Scale Name", "Category", "Category Description"),
            ("2.D.1", "Required Level of Education", "RL", "Required Level of Education", "1", "Less than a High School Diploma"),
            ("2.D.1", "Required Level of Education", "RL", "Required Level of Education", "6", "Bachelor's Degree"),
            ("2.D.1", "Required Level of Education", "RL", "Required Level of Education", "12", "Post-Doctoral Training"),
            ("2.D.1", "Required Level of Education", "PT", "Post-Secondary Certificate", "1", "Wrong scale")))
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


REQ_HEADER = ("O*NET-SOC Code", "Element ID", "Element Name", "Scale ID", "Data Value", "Recommend Suppress", "Not Relevant")


def zip_requirements(skills, knowledge):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("db_31_0_text/Occupation Data.txt", table(("O*NET-SOC Code", "Title", "Description"), ("15-2051.00", "D", "d")))
        archive.writestr("db_31_0_text/Job Titles.txt", table(("O*NET-SOC Code", "Job Title"), ("15-2051.00", "T")))
        archive.writestr("db_31_0_text/Essential Skills.txt", table(REQ_HEADER, *skills))
        archive.writestr("db_31_0_text/Knowledge.txt", table(REQ_HEADER, *knowledge))
        archive.writestr("db_31_0_text/Software Skills.txt", table(("O*NET-SOC Code", "Workplace Example", "Element ID", "Element Name"), ("15-2051.00", "Python", "2.E.5.c", "Dev")))
    return buffer.getvalue()


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
        # Interest areas (career interests and fields): the occupational-interest scale only.
        self.assertEqual(lines(self.dir, "interest_areas.tsv"), ["element_id\telement\tcode\tvalue", "1.B.3.q\tInformation Technology\t15-2051.00\t6.10"])
        # More skill lists for the skill search: work styles (impact scale), knowledge (importance), work activities.
        self.assertEqual(lines(self.dir, "work_styles.tsv"), ["element_id\telement\tcode\tvalue", "1.D.1.a\tLeadership Orientation\t15-2051.00\t1.25"])
        self.assertEqual(lines(self.dir, "knowledge.tsv"), ["element_id\telement\tcode\timportance", "2.C.4.a\tMathematics\t15-2051.00\t4.50"])
        # A work activity is listed once per job, with its name from the activity list.
        self.assertEqual(lines(self.dir, "work_activities.tsv"), ["element_id\telement\tcode", "4.A.2.a.4.i.3\tAnalyze data to identify trends.\t15-2051.00"])

    def test_requirements_join_im_and_lv(self):
        out = tempfile.mkdtemp()
        data = zip_requirements(
            [("15-2051.00", "2.A.1.a", "Reading", "IM", "3.88", "N", ""), ("15-2051.00", "2.A.1.a", "Reading", "LV", "4.12", "N", "N")], [])
        write_snapshot(data, out, version="31.0", source_url="u", now="2026-10-30")
        self.assertEqual(lines(out, "requirements.tsv"), [
            "kind\telement_id\telement\tcode\timportance\tlevel\tsuppress\tnot_relevant",
            "el\t2.A.1.a\tReading\t15-2051.00\t3.88\t4.12\tN\tN"])

    def test_requirements_across_skill_files_and_knowledge(self):
        # Fixture: IM only for Social Perceptiveness (level stays empty), IM + LV for the others.
        self.assertEqual(lines(self.dir, "requirements.tsv"), [
            "kind\telement_id\telement\tcode\timportance\tlevel\tsuppress\tnot_relevant",
            "el\t2.A.1.a\tReading Comprehension\t15-2051.00\t4.00\t4.50\t\t",
            "el\t2.B.1.a\tSocial Perceptiveness\t15-2051.00\t3.10\t\t\t",
            "kn\t2.C.4.a\tMathematics\t15-2051.00\t4.50\t5.10\t\t",
        ])

    def test_requirements_suppress_and_not_relevant(self):
        out = tempfile.mkdtemp()
        data = zip_requirements(
            [("15-2051.00", "2.A.1.a", "Reading", "IM", "3.00", "N", ""), ("15-2051.00", "2.A.1.a", "Reading", "LV", "0.50", "Y", "Y"),
             ("15-2051.00", "2.A.1.b", "Writing", "IM", "2.00", "Y", ""), ("15-2051.00", "2.A.1.b", "Writing", "LV", "2.50", "N", "N")],
            [("15-2051.00", "2.C.1.a", "Admin", "LV", "1.00", "N", "N")])
        write_snapshot(data, out, version="31.0", source_url="u", now="2026-10-30")
        self.assertEqual(lines(out, "requirements.tsv")[1:], [
            "el\t2.A.1.a\tReading\t15-2051.00\t3.00\t0.50\tY\tY",
            "el\t2.A.1.b\tWriting\t15-2051.00\t2.00\t2.50\tY\tN",
            "kn\t2.C.1.a\tAdmin\t15-2051.00\t\t1.00\tN\tN",
        ])

    def test_education_rows(self):
        self.assertEqual(lines(self.dir, "education.tsv"), [
            "code\tcategory\tlabel\tpercent\tsuppress",
            "15-2051.00\t1\tLess than a High School Diploma\t0.00\tN",
            "15-2051.00\t6\tBachelor's Degree\t84.80\tY",
            "15-2051.00\t12\tPost-Doctoral Training\t15.20\tN",
            "11-1011.00\t6\tBachelor's Degree\t50.00\tN",
        ])
        with open(os.path.join(self.dir, "manifest.json"), encoding="utf-8") as handle:
            manifest = json.load(handle)
        with open(os.path.join(self.dir, "education.tsv"), "rb") as handle:
            self.assertEqual(manifest["files"]["education.tsv"], hashlib.sha256(handle.read()).hexdigest())

    def test_tasks_table(self):
        self.assertEqual(lines(self.dir, "tasks.tsv"), ["task_id\tcode\ttask", "8823\t15-2051.00\tAnalyze data and report.", "8824\t15-2051.00\tBuild models."])

    def test_existing_files_unchanged(self):
        expected = {
            "occupations.tsv": "code\ttitle\tdescription\n15-2051.00\tData Scientists\tDevelop methods.\n",
            "skills.tsv": "element_id\telement\tcode\timportance\n2.A.1.a\tReading Comprehension\t15-2051.00\t4.00\n2.B.1.a\tSocial Perceptiveness\t15-2051.00\t3.10\n",
            "knowledge.tsv": "element_id\telement\tcode\timportance\n2.C.4.a\tMathematics\t15-2051.00\t4.50\n",
        }
        for name, text in expected.items():
            with open(os.path.join(self.dir, name), "rb") as handle:
                self.assertEqual(handle.read(), text.encode("utf-8"))

    def test_older_layout_still_works(self):
        out = tempfile.mkdtemp()
        write_snapshot(zip_30(), out, version="30.0", source_url="u", now="2026-10-29")
        self.assertEqual(lines(out, "job_titles.tsv"), ["code\ttitle", "15-2051.00\tData Miner"])
        self.assertEqual(lines(out, "software.tsv"), ["example\telement_id\telement\tcode", "SQL\t\tDatabase software\t15-2051.00"])
        # Releases before 31.0 have no interest areas: the file is simply not written.
        self.assertFalse(os.path.exists(os.path.join(out, "interest_areas.tsv")))
        self.assertFalse(os.path.exists(os.path.join(out, "work_activities.tsv")))
        self.assertFalse(os.path.exists(os.path.join(out, "tasks.tsv")))

    def test_manifest_has_version_and_hashes(self):
        with open(os.path.join(self.dir, "manifest.json"), encoding="utf-8") as handle:
            manifest = json.load(handle)
        self.assertEqual(manifest["version"], "31.0")
        self.assertEqual(manifest["licence"], "CC BY 4.0")
        self.assertEqual(manifest["downloadedAt"], "2026-10-29")
        self.assertIn("CC BY 4.0", manifest["attribution"])
        self.assertEqual(sorted(manifest["files"]), ["education.tsv", "interest_areas.tsv", "job_titles.tsv", "knowledge.tsv", "occupations.tsv", "requirements.tsv", "skills.tsv", "software.tsv", "tasks.tsv", "work_activities.tsv", "work_styles.tsv"])
        self.assertTrue(all(len(value) == 64 for value in manifest["files"].values()))

    def test_missing_file_in_zip_raises(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("x/Occupation Data.txt", "O*NET-SOC Code\tTitle\tDescription\n")
        with self.assertRaises(ValueError):
            write_snapshot(buffer.getvalue(), tempfile.mkdtemp(), version="31.0", source_url="u", now="2026-10-29")


if __name__ == "__main__":
    unittest.main()
