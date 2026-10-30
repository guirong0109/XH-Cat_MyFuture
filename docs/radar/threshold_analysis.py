"""Calibration of trend thresholds on real data (owner request, 30 Oct 2026).

Usage: python -I docs/radar/threshold_analysis.py <DOSM JMI xlsx> <openalex_ai_subfield.json (cache, created if missing)>
DOSM: reads cells by address (not position), merged year headers carried right, '-' = not available.
OpenAlex: primary-topic counts for every topic in subfield 1702 (Artificial Intelligence), 2015-2025.
"""
import json, math, os, re, statistics, sys, urllib.parse, urllib.request, zipfile, html

# ---------- DOSM workbook ----------
def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n

def read_sheet(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        s = z.read('xl/sharedStrings.xml').decode('utf-8')
        for si in re.findall(r'<si>(.*?)</si>', s, re.S):
            shared.append(html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S))))
    x = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
    grid = {}
    for rownum, body in re.findall(r'<row [^>]*r="(\d+)"[^>]*>(.*?)</row>', x, re.S):
        for attrs, inner in re.findall(r'<c ([^>]*?)(?:/>|>(.*?)</c>)', body, re.S):
            ref = re.search(r'r="([A-Z]+\d+)"', attrs).group(1)
            v = re.search(r'<v>(.*?)</v>', inner or '')
            if not v:
                t = re.search(r'<is>.*?<t[^>]*>(.*?)</t>', inner or '', re.S)
                if not t: continue
                val = html.unescape(t.group(1))
            else:
                val = v.group(1)
                if 't="s"' in attrs: val = shared[int(val)]
            grid[(int(rownum), col_index(ref))] = val.strip()
    merges = [tuple(m) for m in re.findall(r'<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"', x)]
    return grid, merges

def dosm_occupation_quarters(path):
    grid, merges = read_sheet(path)
    # expand merged cells: value of the top-left cell fills the range
    for a, b in merges:
        ra, ca = int(re.search(r'\d+', a).group()), col_index(a)
        rb, cb = int(re.search(r'\d+', b).group()), col_index(b)
        v = grid.get((ra, ca))
        if v is None: continue
        for r in range(ra, rb + 1):
            for c in range(ca, cb + 1):
                grid.setdefault((r, c), v)
    rows = sorted({r for r, _ in grid})
    title = next(r for r in rows if any(str(v).startswith('Table 2') for (rr, c), v in grid.items() if rr == r))
    # the header rows follow the title, possibly after blank rows: first the years row, then the quarters row
    q_row = next(r for r in rows if r > title and any(v in ('Q1', 'Q2', 'Q3', 'Q4') for (rr, c), v in grid.items() if rr == r))
    year_row = q_row - 1
    qcols = sorted(c for (r, c), v in grid.items() if r == q_row and v in ('Q1', 'Q2', 'Q3', 'Q4'))
    # year for each quarter column: merged value, else carry the last year seen to the left
    years, last = {}, None
    for c in range(min(qcols), max(qcols) + 1):
        v = grid.get((year_row, c))
        if v and re.fullmatch(r'\d{4}', v): last = int(v)
        if c in qcols: years[c] = last
    periods = [(years[c], grid[(q_row, c)]) for c in qcols]
    series = {}
    r = q_row + 1
    while (r, 2) in grid and not grid[(r, 2)].startswith('Source'):
        name = grid[(r, 2)]
        vals = []
        for c in qcols:
            v = grid.get((r, c))
            vals.append(None if v in (None, '', '-') else float(v))
        series[name] = vals
        r += 1
    return [f'{y} {q}' for y, q in periods], series

# ---------- OpenAlex ----------
def openalex_ai(cache):
    if os.path.exists(cache):
        return json.load(open(cache))
    out = {'fetched': [], 'counts': {}}
    for y in range(2015, 2026):
        url = 'https://api.openalex.org/works?' + urllib.parse.urlencode(
            {'filter': f'primary_topic.subfield.id:1702,publication_year:{y}', 'group_by': 'primary_topic.id', 'per_page': 200})
        d = json.load(urllib.request.urlopen(url, timeout=40))
        out['fetched'].append(url)
        for g in d['group_by']:
            tid = g['key'].split('/')[-1]
            out['counts'].setdefault(tid, {'name': g['key_display_name'], 'by_year': {}})['by_year'][str(y)] = g['count']
    json.dump(out, open(cache, 'w'), indent=1)
    return out

def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p / 100; f = math.floor(k)
    return xs[f] if f == len(xs) - 1 else xs[f] + (xs[f + 1] - xs[f]) * (k - f)

def main():
    periods, s = dosm_occupation_quarters(sys.argv[1])
    total = s.pop('Jumlah')
    s.pop('Unclassified', None)
    # quarters not published yet (empty total) are dropped
    keep = [i for i, v in enumerate(total) if v is not None]
    periods, total = [periods[i] for i in keep], [total[i] for i in keep]
    s = {g: [v[i] for i in keep] for g, v in s.items()}
    groups = list(s)
    print('DOSM quarters:', periods[0], '...', periods[-1], f'({len(periods)})')
    print('Total:', ' '.join(f'{p}:{int(v) if v else "-"}' for p, v in zip(periods, total)))

    # structural breaks (quarter-on-quarter)
    print('\n## Break heuristic: |total q/q| >= 50% AND >= 75% of eligible groups move same way by >= 40%')
    breaks = []
    for i in range(1, len(periods)):
        a, b = total[i - 1], total[i]
        tch = (b - a) / a * 100
        moves = [(s[g][i] - s[g][i - 1]) / s[g][i - 1] * 100 for g in groups if s[g][i - 1] and s[g][i] is not None and s[g][i - 1] > 0]
        same = [m for m in moves if math.copysign(1, m) == math.copysign(1, tch) and abs(m) >= 40]
        flag = abs(tch) >= 50 and len(moves) > 0 and len(same) / len(moves) >= 0.75
        if abs(tch) >= 30 or flag:
            print(f'  {periods[i]}: total {tch:+.1f}%  groups same-way>=40%: {len(same)}/{len(moves)}  -> {"POSSIBLE BREAK" if flag else "no"}')
        if flag: breaks.append(i)

    # shares and YoY percentage-point changes
    share = {g: [(v / t * 100) if (v is not None and t) else None for v, t in zip(s[g], total)] for g in groups}
    print('\n## Share of total (%) at selected quarters')
    sel = [p for p in periods if p.endswith('Q2')] + [periods[-1]]
    print('| Group | ' + ' | '.join(sel) + ' |')
    for g in groups:
        print(f'| {g[:38]} | ' + ' | '.join(f'{share[g][periods.index(p)]:.2f}' if share[g][periods.index(p)] is not None else '-' for p in sel) + ' |')

    print('\n## YoY share change (pp), each quarter vs same quarter a year earlier; * = window contains a possible break')
    yoy = {}
    for i in range(4, len(periods)):
        crosses = any(i - 4 < k <= i for k in breaks)
        for g in groups:
            a, b = share[g][i - 4], share[g][i]
            if a is None or b is None: continue
            yoy.setdefault(g, {})[periods[i]] = (b - a, crosses)
    last8 = periods[-8:]
    print('| Group | ' + ' | '.join(last8) + ' |')
    for g in groups:
        print(f'| {g[:38]} | ' + ' | '.join((f'{yoy[g][p][0]:+.2f}' + ('*' if yoy[g][p][1] else '')) if p in yoy.get(g, {}) else '-' for p in last8) + ' |')

    clean = [abs(v) for g in yoy for p, (v, c) in yoy[g].items() if not c]
    rel = []
    for i in range(4, len(periods)):
        if any(i - 4 < k <= i for k in breaks): continue
        for g in groups:
            a, b = share[g][i - 4], share[g][i]
            if a and b is not None and a > 0: rel.append(abs((b - a) / a * 100))
    print(f'\nClean YoY |pp| changes: n={len(clean)} P25={pct(clean,25):.2f} P50={pct(clean,50):.2f} P75={pct(clean,75):.2f} P90={pct(clean,90):.2f}')
    print(f'Clean YoY |relative share change| %: P25={pct(rel,25):.1f} P50={pct(rel,50):.1f} P75={pct(rel,75):.1f} P90={pct(rel,90):.1f}')

    # DOSM volatility: SD of the last 4 YoY pp changes (pp), clean windows only
    vols = []
    for g in yoy:
        ps = [p for p in periods if p in yoy[g]]
        for j in range(3, len(ps)):
            w = [yoy[g][p] for p in ps[j - 3:j + 1]]
            if any(c for _, c in w): continue
            vols.append(statistics.stdev([v for v, _ in w]))
    print(f'DOSM volatility (SD of 4 consecutive YoY pp changes, pp): n={len(vols)} P50={pct(vols,50):.2f} P75={pct(vols,75):.2f} P90={pct(vols,90):.2f}')

    # ---------- OpenAlex ----------
    oa = openalex_ai(sys.argv[2])
    g3, vol, small = [], [], []
    for tid, d in oa['counts'].items():
        c = {int(y): v for y, v in d['by_year'].items()}
        for Y in range(2018, 2026):
            B, R = c.get(Y - 3, 0), c.get(Y, 0)
            if B >= 100 and R > 0: g3.append(math.log2(R / B))
            elif B > 0: small.append((tid, Y, B, R))
        for Y in range(2020, 2026):
            ys = [c.get(y, 0) for y in range(Y - 5, Y + 1)]
            if min(ys) >= 100:
                steps = [math.log(ys[k + 1] / ys[k]) for k in range(5)]
                vol.append(statistics.stdev(steps) * 100)
    print(f'\nOpenAlex AI-subfield topics: {len(oa["counts"])}; 3-year windows with baseline>=100: {len(g3)}')
    print('3-year growth (as %): ' + ' '.join(f'P{p}={(2**pct(g3,p)-1)*100:+.0f}%' for p in (10, 25, 50, 75, 90)))
    print('OpenAlex volatility (SD of 5 annual log changes, x100 = approx %): ' + ' '.join(f'P{p}={pct(vol,p):.1f}' for p in (25, 50, 75, 90)))
    print(f'windows with baseline < 100: {len(small)}')
    cs = {2022: 551250, 2025: 906207}
    print(f'CS field growth 2022->2025: {(cs[2025]/cs[2022]-1)*100:+.0f}%')
    json.dump({'periods': periods, 'total': total, 'groups': s, 'breaks': [periods[i] for i in breaks]},
              open(os.path.join(os.path.dirname(sys.argv[2]), 'dosm_parsed.json'), 'w'), indent=1)

main()
