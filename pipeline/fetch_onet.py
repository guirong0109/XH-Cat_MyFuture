"""Download one O*NET database release and keep a small, dated snapshot in data/onet/.

O*NET (CC BY 4.0) is the occupation and skill reference of the CV/profile module. This snapshot is the "cached"
step of the live-first lookup: the screen shows its version and download date.

    python pipeline/fetch_onet.py 31.0              # downloads db_31_0_text.zip from onetcenter.org
    python pipeline/fetch_onet.py 31.0 path/to.zip  # uses a zip downloaded by hand

Windows: Python HTTPS may need SSL_CERT_FILE="C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt".
"""
import csv
import datetime
import hashlib
import io
import json
import os
import sys
import urllib.request
import zipfile

URL = "https://www.onetcenter.org/dl_files/database/db_{version}_text.zip"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "onet")
CODE = "O*NET-SOC Code"

# output file -> header and its sources. A source is (file, [source column or None per output column]).
# "all": every listed file that exists is read (31.0 splits skills in two); otherwise the first one found wins.
# O*NET 31.0 renamed several files, so both layouts are listed.
FILES = {
    "occupations.tsv": {"header": ["code", "title", "description"], "sources": [
        ("Occupation Data.txt", [CODE, "Title", "Description"]),
    ]},
    "job_titles.tsv": {"header": ["code", "title"], "all": True, "sources": [
        ("Job Titles.txt", [CODE, "Job Title"]),
        ("Alternate Titles.txt", [CODE, "Alternate Title"]),
        ("Sample of Reported Titles.txt", [CODE, "Reported Job Title"]),
    ]},
    "skills.tsv": {"header": ["element_id", "element", "code", "importance"], "all": True,
                   "keep": lambda row: row.get("Scale ID") == "IM", "sources": [
        ("Essential Skills.txt", ["Element ID", "Element Name", CODE, "Data Value"]),
        ("Transferable Skills.txt", ["Element ID", "Element Name", CODE, "Data Value"]),
        ("Skills.txt", ["Element ID", "Element Name", CODE, "Data Value"]),
    ]},
    "software.tsv": {"header": ["example", "element_id", "element", "code"], "sources": [
        ("Software Skills.txt", ["Workplace Example", "Element ID", "Element Name", CODE]),
        ("Technology Skills.txt", ["Example", None, "Commodity Title", CODE]),
    ]},
    # Interest areas (31.0 and later): the list for "Career interests and fields", with each job's interest value.
    "interest_areas.tsv": {"header": ["element_id", "element", "code", "value"], "optional": True,
                           "keep": lambda row: row.get("Scale ID") == "OI", "sources": [
        ("Specific Interest Areas.txt", ["Element ID", "Element Name", CODE, "Data Value"]),
    ]},
    # More lists for the skill search (owner, 30 Oct): work styles (impact scale WI, -3..3) and knowledge (importance).
    "work_styles.tsv": {"header": ["element_id", "element", "code", "value"], "optional": True,
                        "keep": lambda row: row.get("Scale ID") == "WI", "sources": [
        ("Work Styles.txt", ["Element ID", "Element Name", CODE, "Data Value"]),
    ]},
    "knowledge.tsv": {"header": ["element_id", "element", "code", "importance"], "optional": True,
                      "keep": lambda row: row.get("Scale ID") == "IM", "sources": [
        ("Knowledge.txt", ["Element ID", "Element Name", CODE, "Data Value"]),
    ]},
    # Task statements: the job's own task list, joined to Anthropic task rows through the task id.
    "tasks.tsv": {"header": ["task_id", "code", "task"], "optional": True, "sources": [
        ("Task Statements.txt", ["Task ID", CODE, "Task"]),
    ]},
}

# Requirements: importance (IM) and level (LV) of each skill or knowledge element per job, joined into one row.
# kind "el" = Essential/Transferable Skills (older Skills.txt), "kn" = Knowledge.
REQUIREMENTS = ("requirements.tsv", ["kind", "element_id", "element", "code", "importance", "level", "suppress", "not_relevant"], [
    ("el", ["Essential Skills.txt", "Transferable Skills.txt", "Skills.txt"]),
    ("kn", ["Knowledge.txt"]),
])

# Work activities (detailed work activities, DWA) per job: "Tasks to DWAs" gives job and activity id, "GWAs to IWAs to
# DWAs" gives the activity name. Written once per job and activity.
ACTIVITIES = ("work_activities.tsv", ["element_id", "element", "code"], "Tasks to DWAs.txt", "GWAs to IWAs to DWAs.txt")


def work_activities(archive):
    out_name, header, tasks, names = ACTIVITIES
    if not find(archive, tasks) or not find(archive, names):
        return None
    name_of = {clean(row["DWA Element ID"]): clean(row["DWA Element Name"]) for row in read_table(archive, names)}
    rows, seen = [], set()
    for row in read_table(archive, tasks):
        key = (clean(row["DWA Element ID"]), clean(row.get(CODE)))
        if key in seen or key[0] not in name_of:
            continue
        seen.add(key)
        rows.append((key[0], name_of[key[0]], key[1]))
    return out_name, (header, rows)


# Usual education level per job: element 2.D.1 "Required Level of Education", scale RL (share of workers per category,
# US survey data). The label of each category comes from "Education Categories.txt".
EDUCATION = ("education.tsv", ["code", "category", "label", "percent", "suppress"], "Education.txt", "Education Categories.txt")


def education(archive):
    out_name, header, data, categories = EDUCATION
    if not find(archive, data) or not find(archive, categories):
        return None
    label_of = {clean(row.get("Category")): clean(row.get("Category Description")) for row in read_table(archive, categories)
                if row.get("Element ID") == "2.D.1" and row.get("Scale ID") == "RL"}
    rows = []
    for row in read_table(archive, data):
        if row.get("Element ID") != "2.D.1" or row.get("Scale ID") != "RL":
            continue
        category = clean(row.get("Category"))
        rows.append((clean(row.get(CODE)), category, label_of.get(category, ""), clean(row.get("Data Value")), clean(row.get("Recommend Suppress"))))
    return out_name, (header, rows)


def requirements(archive):
    out_name, header, kinds = REQUIREMENTS
    found = [(kind, name) for kind, names in kinds for name in names if find(archive, name)]
    if not found:
        return None
    rows = {}
    for kind, name in found:
        for row in read_table(archive, name):
            scale = row.get("Scale ID")
            if scale not in ("IM", "LV"):
                continue
            key = (kind, clean(row.get("Element ID")), clean(row.get("Element Name")), clean(row.get(CODE)))
            entry = rows.setdefault(key, {"IM": "", "LV": "", "flags": [], "not_relevant": ""})
            entry[scale] = clean(row.get("Data Value"))
            entry["flags"].append(clean(row.get("Recommend Suppress")))
            if scale == "LV":
                entry["not_relevant"] = clean(row.get("Not Relevant"))
    out = []
    for key, entry in rows.items():
        suppress = "Y" if "Y" in entry["flags"] else ("N" if "N" in entry["flags"] else "")
        out.append(key + (entry["IM"], entry["LV"], suppress, entry["not_relevant"]))
    return out_name, (header, out)


def find(archive, name):
    return next((entry for entry in archive.namelist() if entry.endswith("/" + name) or entry == name), None)


def read_table(archive, name):
    with archive.open(find(archive, name)) as handle:
        return list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8"), delimiter="\t"))


def clean(cell):
    return (cell or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def write_snapshot(zip_bytes, out_dir, version, source_url, now=None):
    archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    tables = {}
    for out_name, spec in FILES.items():
        present = [(name, columns) for name, columns in spec["sources"] if find(archive, name)]
        if not present and spec.get("optional"):
            continue
        if not present:
            raise ValueError(f"none of {[name for name, _ in spec['sources']]} is in the O*NET zip")
        keep = spec.get("keep")
        rows, seen = [], set()
        for name, columns in present if spec.get("all") else present[:1]:
            for row in read_table(archive, name):
                if keep and not keep(row):
                    continue
                out = tuple(clean(row.get(column)) if column else "" for column in columns)
                if out not in seen:
                    seen.add(out)
                    rows.append(out)
        tables[out_name] = (spec["header"], rows)
    for extra in (work_activities(archive), requirements(archive), education(archive)):
        if extra:
            tables[extra[0]] = extra[1]
    os.makedirs(out_dir, exist_ok=True)
    hashes = {}
    for out_name, (header, rows) in tables.items():
        text = "\t".join(header) + "\n" + "".join("\t".join(row) + "\n" for row in rows)
        with open(os.path.join(out_dir, out_name), "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        hashes[out_name] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    manifest = {
        "source": "O*NET Database",
        "version": version,
        "sourceUrl": source_url,
        "licence": "CC BY 4.0",
        "attribution": f"O*NET {version} Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license.",
        "downloadedAt": now or datetime.date.today().isoformat(),
        "files": hashes,
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    return manifest


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    version = argv[1]
    url = URL.format(version=version.replace(".", "_"))
    if len(argv) > 2:
        with open(argv[2], "rb") as handle:
            data = handle.read()
    else:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
    manifest = write_snapshot(data, OUT_DIR, version, url)
    print(f"O*NET {manifest['version']} snapshot written to {os.path.normpath(OUT_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
