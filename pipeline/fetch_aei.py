"""Build data/ai/aei_tasks.tsv: Anthropic Economic Index usage per O*NET task (global level, claude.ai).

Source: Hugging Face dataset Anthropic/EconomicIndex, release_2026_06_26 (data from April-May 2026), file
data/aei_claude_ai_2026-06-26.csv (219 MB). Licence: data CC-BY (dataset README), code MIT.
Long format: one row per (geography, category, hierarchy level, metric, node). Task rows are category_name "onet",
hierarchy_level 0; geography is geo_level "global" (geo_id GLOBAL).

    python pipeline/fetch_aei.py            # downloads to a temp dir outside the repo, deletes it afterwards
    python pipeline/fetch_aei.py FILE.csv   # use an already downloaded copy (not deleted)

Windows: Python HTTPS may need SSL_CERT_FILE="C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt".
"""
import csv
import datetime
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT_DIR = os.path.join(ROOT, "data", "ai")
TASKS_PATH = os.path.join(ROOT, "data", "onet", "tasks.tsv")
RELEASE = "release_2026_06_26"
FILE_NAME = "aei_claude_ai_2026-06-26.csv"
SOURCE_URL = f"https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main/{RELEASE}/data/{FILE_NAME}"
# The documentation lists usage_pct, but at task level (onet, level 0) the file carries the usage share as "pct"
# (usage_pct exists only for category "overall"); its column here is still named usage_pct.
METRICS = ("pct", "collaboration_bucket_automation_pct", "collaboration_bucket_augmentation_pct")
GEO_LEVEL = "global"


def extract(rows, tasks, stats=None, period=None):
    """Task rows (onet, level 0, global) pivoted to (task_id, usage, automation, augmentation).
    `tasks` maps a Task ID and the exact statement text to the task_id. Unmatched keys are counted, never guessed.
    `period` (a date_start) keeps one monthly slice; the file holds two months."""
    stats = stats if stats is not None else {}
    found, order, unmatched = {}, [], {}
    for r in rows:
        if r.get("category_name") != "onet" or r.get("hierarchy_level") != "0" or r.get("geo_level") != GEO_LEVEL:
            continue
        if period and r.get("date_start") != period:
            continue
        metric = r.get("metric_id")
        if metric not in METRICS:
            continue
        key = r.get("node_external_id")
        task_id = tasks.get(key)
        if task_id is None:
            unmatched[key] = True
            continue
        if task_id not in found:
            found[task_id] = [None, None, None]
            order.append(task_id)
        found[task_id][METRICS.index(metric)] = float(r["value"])
    stats["matched"] = len(order)
    stats["unmatched"] = len(unmatched)
    stats["unmatchedExamples"] = list(unmatched)[:5]
    return [(t, *found[t]) for t in order]


def load_tasks(path=TASKS_PATH):
    tasks = {}
    with open(path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            tasks[row["task_id"]] = row["task_id"]
            tasks.setdefault(row["task"], row["task_id"])
    return tasks


def download(url, dest, attempts=200):
    """Stream to dest, resuming with HTTP range requests when the connection drops."""
    for _ in range(attempts):
        have = os.path.getsize(dest) if os.path.exists(dest) else 0
        request = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                total = have + int(response.headers.get("Content-Length", 0))
                if have and response.status != 206:
                    have = 0
                with open(dest, "ab" if have else "wb") as out:
                    shutil.copyfileobj(response, out, 1 << 20)
            if os.path.getsize(dest) >= total:
                return
        except Exception as error:  # dropped connection: wait and resume
            print("download retry:", error, file=sys.stderr)
            time.sleep(3)
    raise RuntimeError("download did not finish")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fmt(value):
    return "" if value is None else repr(value)


def main(argv):
    tasks = load_tasks()
    temp = None
    if argv:
        source = argv[0]
    else:
        temp = tempfile.mkdtemp(prefix="aei_")
        source = os.path.join(temp, FILE_NAME)
        download(SOURCE_URL, source)
    try:
        original_sha = sha256_file(source)
        stats = {}
        with open(source, encoding="utf-8", newline="") as handle:
            period = max(r["date_start"] for r in csv.DictReader(handle) if r["category_name"] == "onet")
        with open(source, encoding="utf-8", newline="") as handle:
            rows = extract(csv.DictReader(handle), tasks, stats, period)
        text = "task_id\tusage_pct\tautomation_pct\taugmentation_pct\n" + "".join(
            f"{t}\t{fmt(u)}\t{fmt(a)}\t{fmt(g)}\n" for t, u, a, g in rows)
        data = text.encode("utf-8")
        os.makedirs(OUT_DIR, exist_ok=True)
        with open(os.path.join(OUT_DIR, "aei_tasks.tsv"), "wb") as handle:
            handle.write(data)
        manifest_path = os.path.join(OUT_DIR, "manifest.json")
        with open(manifest_path, encoding="utf-8") as handle:
            manifest = json.load(handle)
        manifest["aei"] = {
            "source": "Anthropic Economic Index, Hugging Face dataset Anthropic/EconomicIndex",
            "release": RELEASE,
            "dataPeriod": "April-May 2026",
            "sourceUrl": SOURCE_URL,
            "licence": "CC BY (data); code MIT, per the dataset README",
            "downloadedAt": datetime.date.today().isoformat(),
            "geoLevel": GEO_LEVEL,
            "filter": "category_name=onet, hierarchy_level=0",
            "period": period,
            "metrics": list(METRICS),
            "metricNote": "task-level usage share is metric_id pct in the file (usage_pct exists only for category overall); stored as usage_pct",
            "keyForm": "node_external_id matched to data/onet/tasks.tsv by Task ID or exact statement text",
            "matched": stats["matched"],
            "unmatched": stats["unmatched"],
            "unmatchedExamples": stats["unmatchedExamples"],
            "originalKept": False,
            "originalSha256": original_sha,
            "files": {"aei_tasks.tsv": hashlib.sha256(data).hexdigest()},
        }
        with open(manifest_path, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(manifest, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        print(f"matched {stats['matched']}, unmatched {stats['unmatched']}, e.g. {stats['unmatchedExamples']}")
    finally:
        if temp:
            shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1:])
