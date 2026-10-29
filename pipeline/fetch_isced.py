"""Download the field-of-study list (UNESCO ISCED-F 2013) and its bridge to O*NET occupations into data/isced/.

The bridge has two official tables and nothing of our own:
  ISCED-F 2013 field -> CIP programme   Statistics Canada concordance, ISCED-F 2013 to CIP Canada 2016
  CIP programme -> O*NET occupation     O*NET Resource Center crosswalk, 2020 CIP to O*NET-SOC 2019
The user picks an ISCED-F field; the bridge is only stored for the matching module.

    python pipeline/fetch_isced.py                       # downloads both tables
    python pipeline/fetch_isced.py concordance.csv cip.xlsx   # uses files downloaded by hand

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
import xml.etree.ElementTree as ET
import zipfile

CONCORDANCE_URL = "https://www.statcan.gc.ca/sites/default/files/documents/isced-f-2013-cip2016-eng.csv"
CROSSWALK_URL = "https://www.onetcenter.org/crosswalks/cip/Education_CIP_to_ONET_SOC.xlsx"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "isced")
SHEET = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# The 2-digit broad fields of ISCED-F 2013 (UNESCO UIS, 2014). The concordance lists only 4-digit fields.
BROAD = {
    "00": "Generic programmes and qualifications",
    "01": "Education",
    "02": "Arts and humanities",
    "03": "Social sciences, journalism and information",
    "04": "Business, administration and law",
    "05": "Natural sciences, mathematics and statistics",
    "06": "Information and Communication Technologies (ICTs)",
    "07": "Engineering, manufacturing and construction",
    "08": "Agriculture, forestry, fisheries and veterinary",
    "09": "Health and welfare",
    "10": "Services",
    "99": "Field unknown",
}


def clean(cell):
    return (cell or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def read_concordance(data):
    # Statistics Canada publishes it in Windows-1252, not UTF-8.
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        isced, cip = clean(row["ISCED-F 2013 Code"]), clean(row["CIP Canada 2016 Code"])
        # "*" marks a partial link: the class covers only part of the other one.
        partial = "Y" if isced.endswith("*") or cip.endswith("*") else "N"
        rows.append((isced.rstrip("*"), clean(row["ISCED-F 2013 Title"]), cip.rstrip("*"),
                     clean(row["CIP Canada 2016 Title"]), partial, clean(row.get("Explanatory Notes"))))
    return rows


def read_xlsx_rows(data):
    archive = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall(SHEET + "si"):
            shared.append("".join(node.text or "" for node in item.iter(SHEET + "t")))
    rows = []
    for row in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).iter(SHEET + "row"):
        out = {}
        for cell in row.findall(SHEET + "c"):
            column = re.match(r"[A-Z]+", cell.get("r")).group()
            value, inline = cell.find(SHEET + "v"), cell.find(SHEET + "is")
            if cell.get("t") == "s" and value is not None:
                out[column] = shared[int(value.text)]
            elif inline is not None:
                out[column] = "".join(node.text or "" for node in inline.iter(SHEET + "t"))
            else:
                out[column] = value.text if value is not None else ""
        rows.append(out)
    return rows


def read_crosswalk(data):
    rows = read_xlsx_rows(data)
    start = next((i for i, row in enumerate(rows) if row.get("A") == "2020 CIP Code"), None)
    if start is None:
        raise ValueError("the O*NET crosswalk has no '2020 CIP Code' header")
    return [tuple(clean(row.get(column)) for column in "ABCD") for row in rows[start + 1:] if row.get("A")]


def write_snapshot(concordance_bytes, crosswalk_bytes, out_dir, now=None):
    links = read_concordance(concordance_bytes)
    crosswalk = read_crosswalk(crosswalk_bytes)
    fields = {}
    for code, title, *_ in links:
        fields.setdefault(code, title)
    tables = {
        "fields.tsv": (["code", "title", "broad_code", "broad_title"],
                       [(code, fields[code], code[:2], BROAD.get(code[:2], "")) for code in sorted(fields)]),
        "isced_cip.tsv": (["isced_code", "isced_title", "cip_code", "cip_title", "partial", "note"], links),
        "cip_onet.tsv": (["cip_code", "cip_title", "code", "title"], crosswalk),
    }
    os.makedirs(out_dir, exist_ok=True)
    hashes = {}
    for name, (header, rows) in tables.items():
        text = "\t".join(header) + "\n" + "".join("\t".join(row) + "\n" for row in rows)
        with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        hashes[name] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    onet_cips = {row[0] for row in crosswalk}
    linked = {code for code, _, cip, *_ in links if cip in onet_cips}
    manifest = {
        "source": "ISCED-F 2013 fields of education and training, with a CIP bridge to O*NET",
        "version": "ISCED-F 2013",
        "sources": [
            {"what": "ISCED-F 2013 to CIP Canada 2016 concordance", "by": "Statistics Canada", "url": CONCORDANCE_URL,
             "licence": "Statistics Canada Open Licence"},
            {"what": "2020 CIP to O*NET-SOC 2019 crosswalk", "by": "O*NET Resource Center (USDOL/ETA)", "url": CROSSWALK_URL,
             "licence": "CC BY 4.0"},
        ],
        "downloadedAt": now or datetime.date.today().isoformat(),
        "files": hashes,
        "bridge": {"fields": len(fields), "fieldsLinkedToOnet": len(linked)},
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    return manifest


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "FutureReady-MY data pipeline"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def main(argv):
    if len(argv) > 2:
        with open(argv[1], "rb") as one, open(argv[2], "rb") as two:
            concordance, crosswalk = one.read(), two.read()
    else:
        concordance, crosswalk = fetch(CONCORDANCE_URL), fetch(CROSSWALK_URL)
    manifest = write_snapshot(concordance, crosswalk, OUT_DIR)
    bridge = manifest["bridge"]
    print(f"{bridge['fields']} ISCED-F fields, {bridge['fieldsLinkedToOnet']} linked to O*NET, written to {os.path.normpath(OUT_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
