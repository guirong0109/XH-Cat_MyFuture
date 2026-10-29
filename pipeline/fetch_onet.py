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
}


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
