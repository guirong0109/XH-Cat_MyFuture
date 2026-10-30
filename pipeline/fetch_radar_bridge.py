"""Build the Radar occupation bridge (data/radar/occupation-bridge.json) from the kept original files.

Chain for an O*NET occupation (spec 4.3), one step per official table, every step with its source and SHA-256:
  O*NET-SOC 2019 -> SOC 2018      O*NET Resource Center crosswalk (downloaded here, CC BY 4.0)
  SOC 2018 -> SOC 2010            BLS 2010 to 2018 SOC crosswalk   (BLS blocks automated downloads)
  SOC 2010 -> ISCO-08             BLS ISCO-08 to SOC 2010 crosswalk (BLS blocks automated downloads)
  ISCO-08 -> MASCO 2020 major     needs an official Malaysian source: always "pending" until the owner provides one
The two BLS files are never fetched here. The owner downloads them in a browser, saves them in data/radar/source/ as
.csv or .xlsx (any of the file names below) and runs this script again. A step whose file is absent is "pending".
eMASCO roles need no bridge: the major group is the first digit of the code.

    python pipeline/fetch_radar_bridge.py            # downloads the O*NET crosswalk if it is not kept yet, builds the bridge

Windows: Python HTTPS may need SSL_CERT_FILE="C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt".
"""
import csv
import datetime
import hashlib
import io
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_isced import clean, read_xlsx_rows  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "radar")
SOURCE_DIR = os.path.join(ROOT, "source")
OUT_FILE = os.path.join(ROOT, "occupation-bridge.json")
ONET_URL = "https://www.onetcenter.org/taxonomy/2019/soc/2019_to_SOC_Crosswalk.csv?fmt=csv"
ONET_FILE = "2019_to_SOC_Crosswalk.csv"

# (step id, from system, to system, accepted file names, source name, url, key columns as header patterns)
STEPS = [
    ("onet_to_soc2018", ("O*NET-SOC", "2019"), ("SOC", "2018"), [ONET_FILE],
     "O*NET Resource Center, O*NET-SOC 2019 to 2018 SOC crosswalk", ONET_URL,
     (r"o\*net-soc 2019 code", r"2018 soc code")),
    ("soc2018_to_soc2010", ("SOC", "2018"), ("SOC", "2010"),
     ["soc_2010_to_2018_crosswalk.csv", "soc_2010_to_2018_crosswalk.xlsx"],
     "US Bureau of Labor Statistics, 2010 to 2018 SOC crosswalk", "https://www.bls.gov/soc/2018/crosswalks_used_by_agencies.htm",
     (r"2018 soc code", r"2010 soc code")),
    ("soc2010_to_isco08", ("SOC", "2010"), ("ISCO-08", "2008"),
     ["isco_soc_crosswalk.csv", "isco_soc_crosswalk.xlsx"],  # matched case-insensitively: ISCO_SOC_Crosswalk.xlsx works too
     "US Bureau of Labor Statistics, ISCO-08 to 2010 SOC crosswalk", "https://www.bls.gov/soc/isco_soc_crosswalk.xls",
     (r"2010 soc code", r"isco-?08 code")),
    ("isco08_to_masco2020_major", ("ISCO-08", "2008"), ("MASCO", "2020"), [],
     "Official Malaysian source for ISCO-08 major group = MASCO 2020 major group", None, None),
]
MASCO_UNIT_STEP = "masco2020_unit_to_isco08"
MASCO_UNIT_PENDING = "waits for the ISCO-08 code list in the BLS ISCO file"
MASCO_UNIT_SOURCE = {
    "name": "MASCO 2020 publication (MOHR): developed in accordance with ISCO; owner decision M15, 30 Oct 2026",
    "url": "https://jtksm.gov.my/sites/default/files/2022-12/MASCO_2020_BI_Edaran.pdf",
    "file": None,
    "sha256": None,
}
EMASCO_DETAILS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "emasco", "role_details.json")
MASCO_PENDING = "No official Malaysian source recorded yet that ISCO-08 major groups equal MASCO 2020 major groups; the owner must provide one."


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def table_rows(name, data):
    if name.lower().endswith(".xlsx"):
        rows = []
        for row in read_xlsx_rows(data):
            rows.append([clean(row[column]) for column in sorted(row, key=lambda c: (len(c), c))])
        return rows
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
    return [[clean(cell) for cell in row] for row in csv.reader(io.StringIO(text))]


def read_links(name, data, patterns):
    """Rows of a crosswalk as {from code: [to codes]} (many-to-many kept, order kept, duplicates dropped)."""
    rows = table_rows(name, data)
    wanted = [re.compile(p, re.I) for p in patterns]
    for index, row in enumerate(rows):
        columns = [next((i for i, cell in enumerate(row) if pattern.fullmatch(cell)), None) for pattern in wanted]
        if None in columns:
            continue
        links = {}
        for line in rows[index + 1:]:
            if max(columns) >= len(line):
                continue
            left, right = line[columns[0]], line[columns[1]]
            if left and right and right not in links.setdefault(left, []):
                links[left].append(right)
        return links
    raise ValueError(f"{name}: no header row with columns matching {', '.join(patterns)}")


def find_file(source_dir, names):
    """First accepted name present in source_dir, compared case-insensitively; returns the name as saved on disk."""
    try:
        on_disk = os.listdir(source_dir)
    except OSError:
        return None
    for name in names:
        match = next((f for f in on_disk if f.lower() == name.lower()), None)
        if match and os.path.isfile(os.path.join(source_dir, match)):
            return match
    return None


def load_emasco_codes(path=EMASCO_DETAILS):
    try:
        with open(path, encoding="utf-8") as handle:
            return [role["code"] for role in json.load(handle).get("roles", [])]
    except (OSError, ValueError):
        return []


def masco_unit_step(isco_step, emasco_codes):
    """MASCO 4-digit unit group -> the ISCO-08 unit group with the same code, only when that code is in the ISCO step."""
    item = {
        "id": MASCO_UNIT_STEP,
        "from": {"system": "MASCO", "version": "2020"},
        "to": {"system": "ISCO-08", "version": "2008"},
        "method": "same_code",
        "status": "pending",
        "source": dict(MASCO_UNIT_SOURCE),
        "label": "code match, not an official table",
        "pendingReason": MASCO_UNIT_PENDING,
        "links": {},
    }
    if isco_step["status"] == "built":
        isco_codes = {code for codes in isco_step["links"].values() for code in codes}
        units = sorted({code[:4] for code in emasco_codes if re.match(r"^\d{4}", code or "")})
        item["links"] = {unit: [unit] for unit in units if unit in isco_codes}
        item["status"] = "built"
        item["pendingReason"] = None
    return item


def build_bridge(source_dir, now=None, emasco_codes=None):
    if emasco_codes is None:
        emasco_codes = load_emasco_codes()
    steps = []
    for step_id, source_from, source_to, names, source_name, url, patterns in STEPS:
        item = {
            "id": step_id,
            "from": {"system": source_from[0], "version": source_from[1]},
            "to": {"system": source_to[0], "version": source_to[1]},
            "method": "crosswalk",
            "status": "pending",
            "source": None,
            "pendingReason": None,
            "links": {},
        }
        present = find_file(source_dir, names)
        if present:
            with open(os.path.join(source_dir, present), "rb") as handle:
                data = handle.read()
            item["links"] = read_links(present, data, patterns)
            item["status"] = "built"
            item["source"] = {"name": source_name, "file": present, "url": url, "sha256": sha256(data)}
        elif step_id == "isco08_to_masco2020_major":
            item["method"] = "major_group_equivalence"
            item["pendingReason"] = MASCO_PENDING
        else:
            item["pendingReason"] = f"{' or '.join(names)} is not in data/radar/source/. Download it in a browser from {url} and save it there."
        steps.append(item)
    steps.append(masco_unit_step(next(x for x in steps if x["id"] == "soc2010_to_isco08"), emasco_codes))
    return {
        "schemaVersion": "radar-occupation-bridge/v1",
        "builtAt": now or datetime.date.today().isoformat(),
        "emasco": {"method": "code_prefix", "rule": "major group = first digit of the MASCO 2020 code", "source": "eMASCO"},
        "steps": steps,
    }


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "FutureReady-MY data pipeline"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def main(argv):
    os.makedirs(SOURCE_DIR, exist_ok=True)
    onet_path = os.path.join(SOURCE_DIR, ONET_FILE)
    if not os.path.isfile(onet_path):
        with open(onet_path, "wb") as handle:
            handle.write(fetch(ONET_URL))
    bridge = build_bridge(SOURCE_DIR)
    with open(OUT_FILE, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(bridge, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    for step in bridge["steps"]:
        print(f"{step['id']}: {step['status']}" + (f" ({len(step['links'])} codes)" if step["status"] == "built" else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
