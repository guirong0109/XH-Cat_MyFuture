"""Build data/ai/ilo_wp140.tsv: GenAI exposure per ISCO-08 occupation from ILO Working Paper 140.

Source: Gmyrek, Berg, Kamiński, Konopczyński, Ładna, Nafradi, Rosłaniec, Troszyński (20 May 2025), "Generative AI and
Jobs: A 2025 update", ILO Working Paper 140, DOI https://doi.org/10.54394/HETP0387, licence CC BY 4.0. The ILO publishes
no spreadsheet; the lead author's repository holds the scores (3,265 task rows, 427 occupations, README: CC BY 4.0).
Per occupation one value of mean_score_2025 and SD_2025 is used (the first row of each ISCO_08; the sheet repeats it).

    python pipeline/fetch_ilo.py

Windows: Python HTTPS may need SSL_CERT_FILE="C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt".
"""
import datetime
import hashlib
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_isced import clean, read_xlsx_rows  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ai")
SOURCE_NAME = "Final_Scores_ISCO08_Gmyrek_et_al_2025.xlsx"
REPO_URL = "https://github.com/pgmyrek/2025_GenAI_scores_ISCO08"
SOURCE_URL = "https://raw.githubusercontent.com/pgmyrek/2025_GenAI_scores_ISCO08/main/" + SOURCE_NAME
PAPER_URL = "https://doi.org/10.54394/HETP0387"
KEEP_LIMIT = 2 * 1024 * 1024
COLUMNS = ("ISCO_08", "Title", "mean_score_2025", "SD_2025")


def gradient(mean, sd):
    """WP140 Table 5. Checked in this order: G1 and G2 are tested before minimal, so a low mean with a wide spread
    (mean + sd >= 0.5) is G1/G2 and only a low mean with mean + sd between 0.4 and 0.5 is minimal."""
    mean, sd = round(mean, 6), round(sd, 6)
    if mean >= 0.6 and mean - sd >= 0.5:
        return "G4"
    # Table 5 writes G3 as 0.5 <= mean < 0.6; a mean of 0.6 or more that fails the G4 test (mean - sd < 0.5) would
    # otherwise fall through every rule, so it is G3 too (owner brief: 0.6 / 0.15 -> G3). No row of the data is affected.
    if mean >= 0.5 and mean + sd >= 0.5:
        return "G3"
    if 0.4 <= mean < 0.5 and mean + sd >= 0.5:
        return "G2"
    if mean < 0.4 and mean + sd >= 0.5:
        return "G1"
    if mean < 0.5 and mean + sd > 0.4:
        return "minimal"
    return "not_exposed"


def read_occupations(xlsx_bytes):
    rows = read_xlsx_rows(xlsx_bytes)
    if not rows:
        raise ValueError("the ILO workbook is empty")
    letters = {clean(value): letter for letter, value in rows[0].items()}
    missing = [name for name in COLUMNS if name not in letters]
    if missing:
        raise ValueError("the ILO workbook has no column " + ", ".join(missing))
    isco, title, mean, sd = (letters[name] for name in COLUMNS)
    seen, out = set(), []
    for row in rows[1:]:
        code = clean(row.get(isco))
        if not code or code in seen:
            continue
        seen.add(code)
        m, s = float(row[mean]), float(row[sd])
        out.append({"isco": code, "title": clean(row.get(title)), "mean": m, "sd": s, "gradient": gradient(m, s)})
    return out


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def build_snapshot(xlsx_bytes, out_dir, now=None):
    occupations = read_occupations(xlsx_bytes)
    tsv = "isco\ttitle\tmean\tsd\tgradient\n" + "".join(
        f"{o['isco']}\t{o['title']}\t{o['mean']}\t{o['sd']}\t{o['gradient']}\n" for o in occupations)
    tsv_bytes = tsv.encode("utf-8")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "ilo_wp140.tsv"), "wb") as handle:
        handle.write(tsv_bytes)
    kept = len(xlsx_bytes) < KEEP_LIMIT
    if kept:
        os.makedirs(os.path.join(out_dir, "source"), exist_ok=True)
        with open(os.path.join(out_dir, "source", SOURCE_NAME), "wb") as handle:
            handle.write(xlsx_bytes)
    counts = {}
    for o in occupations:
        counts[o["gradient"]] = counts.get(o["gradient"], 0) + 1
    manifest = {
        "source": "ILO Working Paper 140, Generative AI and Jobs: A 2025 update (Gmyrek et al.)",
        "paperUrl": PAPER_URL,
        "repositoryUrl": REPO_URL,
        "sourceUrl": SOURCE_URL,
        "licence": "CC BY 4.0",
        "downloadedAt": now or datetime.date.today().isoformat(),
        "columnsUsed": list(COLUMNS),
        "occupations": len(occupations),
        "gradientCounts": counts,
        "originalKept": kept,
        "originalSha256": sha256(xlsx_bytes),
        "files": {"ilo_wp140.tsv": sha256(tsv_bytes)},
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return manifest


def main():
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as response:
        data = response.read()
    manifest = build_snapshot(data, OUT_DIR)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
