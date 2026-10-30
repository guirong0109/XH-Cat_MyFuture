"""Download the 17 UN Sustainable Development Goals and their 169 targets into data/sdg/targets.json.

Source: UN Statistics Division SDG API, one request per goal (the all-goals call times out):
  https://unstats.un.org/SDGAPI/v1/sdg/Goal/{n}/Target/List?includechildren=true
The answer is a list holding the goal object, with its targets in a `targets` array.
(With includechildren=false the API returns the goal without any targets.)

    python pipeline/fetch_sdg_targets.py

Windows: Python HTTPS may need SSL_CERT_FILE="C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt".
"""
import datetime
import json
import os
import sys
import time
import urllib.request

BASE = "https://unstats.un.org/SDGAPI/v1/sdg"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sdg", "targets.json")


def goal_of(code):
    # The API leaves `goal` null on targets inside a goal, so use the part of the code before the first dot.
    return str(code).split(".", 1)[0]


def parse_goal_targets(payload):
    """Targets from an API answer: a list of goal objects with `targets`, or a flat list of targets."""
    out = []
    for item in payload:
        if isinstance(item.get("targets"), list):
            out.extend(parse_goal_targets(item["targets"]))
        elif "." in str(item.get("code", "")):
            code = str(item["code"])
            out.append({"code": code, "goal": goal_of(code), "title": " ".join(item["title"].split())})
    return out


def parse_goal(payload, n):
    for item in payload:
        if str(item.get("code")) == str(n):
            return {"code": str(n), "title": " ".join(item["title"].split())}
    raise ValueError("goal %s missing in answer" % n)


def get_json(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3)


def main():
    goals, targets = [], []
    for n in range(1, 18):
        payload = get_json("%s/Goal/%d/Target/List?includechildren=true" % (BASE, n))
        goals.append(parse_goal(payload, n))
        targets.extend(parse_goal_targets(payload))
        time.sleep(1)
    data = {
        "source": "UN Statistics Division SDG API",
        "url": BASE + "/Goal/{n}/Target/List?includechildren=true",
        "fetchedAt": datetime.date.today().isoformat(),
        "goals": goals,
        "targets": targets,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("%d goals, %d targets -> %s" % (len(goals), len(targets), os.path.normpath(OUT)))


if __name__ == "__main__":
    sys.exit(main())
