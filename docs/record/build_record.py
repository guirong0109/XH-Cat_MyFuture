"""Builds docs/build-record.html (the stage record) from docs/record/status.json.

    python docs/record/build_record.py

status.json holds the steps of this stage (grouped by the spec's build order), their status, the step log,
the rulings and what is waiting on the user. Statuses: done, doing, todo, stop (waiting on the user), skipped.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "build-record.html")

STYLE = {  # fill, stroke, label colour, label
    "done": ("rgba(6, 78, 59, 0.4)", "#34d399", "#34d399", "DONE"),
    "doing": ("rgba(8, 51, 68, 0.4)", "#22d3ee", "#22d3ee", "IN PROGRESS"),
    "todo": ("rgba(30, 41, 59, 0.5)", "#94a3b8", "#94a3b8", "TO DO"),
    "stop": ("rgba(136, 19, 55, 0.4)", "#fb7185", "#fb7185", "WAITING ON YOU"),
    "skipped": ("rgba(120, 53, 15, 0.3)", "#fbbf24", "#fbbf24", "SKIPPED"),
}
COLS = 4
BOX_W, BOX_H, GAP_X, ROW_H = 188, 52, 10, 70
LEFT, TOP = 175, 50

e = html.escape


def svg(groups):
    parts = []
    y = TOP
    rows = []
    for group in groups:
        n_rows = max(1, (len(group["tasks"]) + COLS - 1) // COLS)
        rows.append((group, y, n_rows))
        y += n_rows * ROW_H
    height = y + 20
    legend_y = height + 10
    total = legend_y + 40
    parts.append(f'<svg viewBox="0 0 1000 {total}">')
    parts.append('<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">'
                 '<polygon points="0 0, 10 3.5, 0 7" fill="#64748b" /></marker>'
                 '<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">'
                 '<path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="0.5"/></pattern></defs>')
    parts.append('<rect width="100%" height="100%" fill="url(#grid)" />')
    # stage boundary
    parts.append(f'<rect x="10" y="20" width="980" height="{height - 10}" rx="12" fill="rgba(251, 191, 36, 0.04)" '
                 'stroke="#fbbf24" stroke-width="1" stroke-dasharray="8,4"/>')
    parts.append('<text x="22" y="38" fill="#fbbf24" font-size="10" font-weight="600">STAGE · CV EXTRACTION AND STRUCTURED PROFILE MODULE (branch claude/cv-profile-module)</text>')
    # flow arrow down the left labels
    parts.append(f'<line x1="160" y1="{TOP + 10}" x2="160" y2="{height - 20}" stroke="#334155" stroke-width="1.5" marker-end="url(#arrowhead)"/>')
    for group, gy, n_rows in rows:
        parts.append(f'<text x="22" y="{gy + 20}" fill="white" font-size="11" font-weight="600">{e(group["id"])}</text>')
        parts.append(f'<text x="22" y="{gy + 34}" fill="#94a3b8" font-size="8">{e(group["name"])}</text>')
        for i, task in enumerate(group["tasks"]):
            r, c = divmod(i, COLS)
            x = LEFT + c * (BOX_W + GAP_X)
            ty = gy + r * ROW_H
            fill, stroke, label_colour, label = STYLE[task["status"]]
            dash = ' stroke-dasharray="4,4"' if task["status"] == "stop" else ""
            parts.append(f'<rect x="{x}" y="{ty}" width="{BOX_W}" height="{BOX_H}" rx="6" fill="#0f172a"/>')
            parts.append(f'<rect x="{x}" y="{ty}" width="{BOX_W}" height="{BOX_H}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="1.5"{dash}/>')
            parts.append(f'<text x="{x + 10}" y="{ty + 17}" fill="white" font-size="10" font-weight="600">{e(task["title"])}</text>')
            parts.append(f'<text x="{x + 10}" y="{ty + 31}" fill="#94a3b8" font-size="8">{e(task.get("sub", ""))}</text>')
            parts.append(f'<text x="{x + 10}" y="{ty + 45}" fill="{label_colour}" font-size="7" font-weight="600">{label}</text>')
    lx = 22
    parts.append(f'<text x="{lx}" y="{legend_y + 12}" fill="white" font-size="10" font-weight="600">Legend</text>')
    for k, key in enumerate(["done", "doing", "todo", "stop", "skipped"]):
        fill, stroke, _, label = STYLE[key]
        x = 90 + k * 150
        dash = ' stroke-dasharray="3,3"' if key == "stop" else ""
        parts.append(f'<rect x="{x}" y="{legend_y + 3}" width="16" height="10" rx="2" fill="{fill}" stroke="{stroke}" stroke-width="1"{dash}/>')
        parts.append(f'<text x="{x + 22}" y="{legend_y + 12}" fill="#94a3b8" font-size="8">{label.title()}</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def card(colour, title, items):
    lis = "".join(f"<li>• {e(item)}</li>" for item in items) or "<li>• —</li>"
    return (f'<div class="card"><div class="card-header"><div class="card-dot {colour}"></div><h3>{e(title)}</h3></div>'
            f"<ul>{lis}</ul></div>")


def main():
    with open(os.path.join(HERE, "status.json"), encoding="utf-8") as handle:
        status = json.load(handle)
    with open(os.path.join(HERE, "_head.html"), encoding="utf-8") as handle:
        head = handle.read().replace("[PROJECT NAME] Architecture Diagram", "CV Profile Build Record")
    with open(os.path.join(HERE, "_tail.html"), encoding="utf-8") as handle:
        tail = handle.read()
    done = sum(t["status"] == "done" for g in status["groups"] for t in g["tasks"])
    total = sum(len(g["tasks"]) for g in status["groups"])
    log_rows = "".join(f"<tr><td>{e(item['time'])}</td><td>{e(item['step'])}</td><td>{e(item['detail'])}</td></tr>" for item in status["log"])
    body = f"""<body>
  <div class="container" id="report-container">
    <div class="header">
      <div class="header-row">
        <div class="pulse-dot"></div>
        <h1>CV Extraction &amp; Profile Module · Build Record</h1>
        <div class="toolbar">
          <div class="toolbar-actions">
            <button onclick="copyAsImage(this)">📋 Copy</button>
            <button onclick="downloadPNG(this)">🖼️ PNG</button>
            <button onclick="downloadPDF(this)">📄 PDF</button>
          </div>
          <button class="toolbar-toggle" onclick="this.parentElement.classList.toggle('expanded')" title="Export options" aria-label="Export options">⋯</button>
        </div>
      </div>
      <p class="subtitle">{done} of {total} steps done · updated {e(status['updated'])} · plan docs/superpowers/plans/2026-10-29-cv-profile-module.md · built on architecture-cv-profile.html</p>
    </div>
    <div class="diagram-container">
{svg(status['groups'])}
    </div>
    <div class="cards">
      {card('emerald', 'Done so far', status['doneSummary'])}
      {card('rose', 'Waiting on you', status['waiting'])}
      {card('amber', 'Rulings (decisions I made)', status['rulings'])}
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><div class="card-dot cyan"></div><h3>Step log (every action in this stage, oldest first)</h3></div>
      <table style="width:100%;border-collapse:collapse;font-size:0.72rem;color:#94a3b8">
        <tr style="color:white;text-align:left"><th style="padding:4px 6px;width:120px">When</th><th style="padding:4px 6px;width:220px">Step</th><th style="padding:4px 6px">What happened</th></tr>
        {log_rows}
      </table>
    </div>
    <p class="footer">FutureReady MY · CV extraction and structured profile module · regenerate with python docs/record/build_record.py</p>
  </div>
"""
    body = body.replace("<tr><td>", '<tr style="border-top:1px solid #1e293b"><td style="padding:4px 6px;vertical-align:top">').replace("</td><td>", '</td><td style="padding:4px 6px;vertical-align:top">')
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(head + body + tail)
    print(f"wrote {os.path.normpath(OUT)} ({done}/{total} done)")


if __name__ == "__main__":
    main()
