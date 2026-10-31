"""Copy the team's eMASCO crawl into data/emasco/role_details.json (display only).

The old crawl file is read as data only; no code from the old project is used.

    python pipeline/import_emasco_details.py <path to the old crawl occupations.json>
"""
import datetime
import hashlib
import json
import os
import sys

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "emasco")
FETCHED_AT = "2026-10-23"
SOURCE = "eMASCO (MASCO 2020), English pages, https://emasco.mohr.gov.my"
KEYS = ("code", "title", "description", "url", "group", "tags", "qualification")
SKILL_TYPES = ("basic", "specific")


def clean_role(raw, state):
    role = {key: raw.get(key) for key in KEYS}
    role["tags"] = list(raw.get("tags") or [])
    role["tasks"] = list(raw.get("tasks") or [])
    skills = []
    for skill in raw.get("skills") or []:
        if skill.get("type") not in SKILL_TYPES:
            raise ValueError(f"role {raw.get('code')}: bad skill type {skill.get('type')!r}")
        skills.append({"text": skill["text"], "type": skill["type"]})
    role["skills"] = skills
    role["pageState"] = state
    return role


def build_details(old):
    roles = {}
    for raw in old.get("roles") or []:
        roles[raw["code"]] = clean_role(raw, "full")
    for raw in old.get("tasksOnly") or []:
        if raw["code"] not in roles:
            roles[raw["code"]] = clean_role(raw, "tasks_only")
    for text in old.get("unparsed") or []:
        code = text.split(":", 1)[0].strip()
        if code not in roles:
            roles[code] = {"code": code, "title": None, "pageState": "unparsed"}
        elif not roles[code]["tasks"] and not roles[code]["skills"]:
            roles[code]["pageState"] = "unparsed"
    return {
        "schemaVersion": "emasco-role-details/v1",
        "source": SOURCE,
        "fetchedAt": FETCHED_AT,
        "roles": [roles[code] for code in sorted(roles)],
    }


def main(argv):
    if len(argv) < 2:
        print("usage: import_emasco_details.py <old occupations.json>")
        return 1
    with open(argv[1], encoding="utf-8") as handle:
        old = json.load(handle)
    details = build_details(old)
    text = json.dumps(details, ensure_ascii=False, indent=1) + "\n"
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "role_details.json"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    manifest = {
        "files": {"role_details.json": hashlib.sha256(text.encode("utf-8")).hexdigest()},
        "copiedFrom": "team eMASCO crawl",
        "fetchedAt": FETCHED_AT,
        "builtAt": datetime.date.today().isoformat(),
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(details['roles'])} roles")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
