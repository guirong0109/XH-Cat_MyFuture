"""Crawl eMASCO role pages for a refresh (display data only).

Checks robots.txt first, then asks for one role page per second and writes
data/emasco/crawl-<YYYY-MM-DD>.json. It never touches role_details.json.

    python pipeline/fetch_emasco.py [--codes 2521-03,2521-04] [--limit N] [--out-dir DIR]
"""
import datetime
import http.cookiejar
import json
import os
import sys
import time
import urllib.request
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from import_emasco_details import SKILL_TYPES, SOURCE  # noqa: E402

BASE = "https://emasco.mohr.gov.my"
USER_AGENT = "FutureReady-MY data pipeline"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "emasco")
SCHEMA = "emasco-role-details/v1"
VOID = {"img", "br", "hr", "input", "meta", "link", "source", "area", "base", "col", "wbr"}
SKIP = {"script", "style", "svg"}


class _Chunks(HTMLParser):
    """Collect text pieces with the class of their element and the href of the nearest link."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.buf = []
        self.chunks = []
        self.skip = 0

    def _flush(self):
        text = " ".join("".join(self.buf).split())
        self.buf = []
        if text and not self.skip:
            cls = self.stack[-1][1] if self.stack else ""
            href = next((h for _, _, h in reversed(self.stack) if h), "")
            self.chunks.append((text, cls, href))

    def handle_starttag(self, tag, attrs):
        self._flush()
        if tag in VOID:
            return
        attrs = dict(attrs)
        self.stack.append((tag, attrs.get("class") or "", attrs.get("href") if tag == "a" else ""))
        if tag in SKIP:
            self.skip += 1

    def handle_endtag(self, tag):
        self._flush()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, _, _ in self.stack[i:]:
                    if t in SKIP:
                        self.skip -= 1
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.buf.append(data)

    def close(self):
        super().close()
        self._flush()


def _chunks(html):
    parser = _Chunks()
    parser.feed(html)
    parser.close()
    return parser.chunks


def _group_after(chunks, label):
    """The code and title shown under a group heading, or None."""
    for i, (text, _, _) in enumerate(chunks):
        if text == label and i + 2 < len(chunks):
            code, title = chunks[i + 1][0], chunks[i + 2][0]
            if code.isdigit():
                return code, title
            return None
    return None


def parse_role(html, code, url):
    chunks = _chunks(html)
    title = next((t for t, c, _ in chunks if "text-3xl" in c), None)
    description = next((t for t, c, _ in chunks if "mb-10" in c), None)
    tags = [t for t, c, h in chunks if h.startswith("/directory/category/") and "uppercase" in c]
    tasks, skills = [], []
    qualification = None
    section = None
    skill_type = None
    for i, (text, cls, _) in enumerate(chunks):
        if "uppercase" in cls and "font-bold" in cls and "text-lg" in cls:
            section = text.strip().lower()
            continue
        if section == "tasks" and "first-letter:uppercase" in cls:
            tasks.append(text)
        elif section == "skills":
            if "font-bold" in cls and "min-w-[100px]" in cls:
                skill_type = text.strip().lower()
            elif skill_type and "rounded-full" in cls:
                if skill_type not in SKILL_TYPES:
                    raise ValueError(f"role {code}: bad skill type {skill_type!r}")
                skills.append({"text": text, "type": skill_type})
        elif section == "additional info" and text.upper() == "QUALIFICATION" and i + 1 < len(chunks):
            qualification = chunks[i + 1][0]
    major = _group_after(chunks, "Major Group")
    sub = _group_after(chunks, "Sub-Major Group")
    if title is None:
        state = "unparsed"
    elif tasks and skills:
        state = "full"
    elif tasks:
        state = "tasks_only"
    else:
        state = "unparsed"
    return {
        "code": code,
        "title": title,
        "description": description,
        "url": url,
        "group": major[1].lower() if major else None,
        "subMajorGroup": {"code": sub[0], "title": sub[1]} if sub else None,
        "tags": tags,
        "qualification": qualification,
        "tasks": tasks,
        "skills": skills,
        "pageState": state,
    }


def allowed(robots_txt, path):
    """True when robots.txt lets a generic crawler fetch path (longest matching rule wins)."""
    rules = []
    applies = False
    in_agents = False
    for raw in robots_txt.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            if not line:
                in_agents = False
            continue
        field, value = (p.strip() for p in line.split(":", 1))
        field = field.lower()
        if field == "user-agent":
            if not in_agents:
                applies = False
            in_agents = True
            if value == "*":
                applies = True
        else:
            in_agents = False
            if applies and field in ("allow", "disallow") and value:
                rules.append((field, value))
    best = None
    for field, value in rules:
        if path.startswith(value) and (best is None or len(value) > len(best[1])
                                       or (len(value) == len(best[1]) and field == "allow")):
            best = (field, value)
    return best is None or best[0] == "allow"


def make_fetch():
    """A fetch function that keeps cookies and sets the English view first (?lang=en)."""
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", USER_AGENT)]
    state = {"english": False}

    def fetch(url):
        if "/masco/" in url and not state["english"]:
            opener.open(url + "?lang=en", timeout=30).read()
            state["english"] = True
        return opener.open(url, timeout=30).read().decode("utf-8")

    return fetch


def _arg(argv, name):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


def _role_codes(codes_arg):
    if codes_arg:
        return [c.strip() for c in codes_arg.split(",") if c.strip()]
    with open(os.path.join(DATA_DIR, "role_details.json"), encoding="utf-8") as handle:
        return [r["code"] for r in json.load(handle)["roles"]]


def main(argv, fetch=None, today=None, sleep=time.sleep):
    fetch = fetch or make_fetch()
    today = today or datetime.date.today().isoformat()
    out_dir = _arg(argv, "--out-dir") or DATA_DIR
    codes = _role_codes(_arg(argv, "--codes"))
    limit = _arg(argv, "--limit")
    if limit:
        codes = codes[: int(limit)]
    if not allowed(fetch(BASE + "/robots.txt"), "/masco/"):
        print("robots.txt does not allow /masco/; nothing fetched")
        return 2
    roles = []
    for code in codes:
        sleep(1)  # one request per second, including right after robots.txt
        url = f"{BASE}/masco/{code}"
        try:
            roles.append(parse_role(fetch(url), code, url))
        except Exception as error:  # keep going; the stub shows which page failed
            print(f"{code}: {error}")
            roles.append({"code": code, "title": None, "url": url, "pageState": "unparsed"})
    data = {"schemaVersion": SCHEMA, "source": SOURCE, "fetchedAt": today, "roles": roles}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"crawl-{today}.json"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(roles)} roles")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
