"""Radar index analysis on real OpenAlex primary-topic counts (2015-2025). Prints JSON + tables."""
import json, math, sys, urllib.request, urllib.parse, datetime

BASE = 'https://api.openalex.org'
TOPICS = [('T10028', 'Language Models & Text AI'), ('T10775', 'Generative Media AI'), ('T12549', 'Computer Vision'),
          ('T10653', 'Robotics'), ('T13287', 'Process Automation'), ('T12128', 'Service AI')]
YEARS = list(range(2015, 2026))

def get(path, **params):
    url = BASE + path + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=40) as r:
        return json.load(r), url

def series(filt):
    d, url = get('/works', filter=filt + ',publication_year:2015-2025', group_by='publication_year')
    s = {int(g['key']): g['count'] for g in d['group_by']}
    return {y: s.get(y, 0) for y in YEARS}, url

raw = {'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'topics': {}, 'reference': {}}
for tid, _ in TOPICS:
    meta, _u = get('/topics/' + tid)
    s, url = series(f'primary_topic.id:{tid}')
    raw['topics'][tid] = {'title': meta['display_name'], 'updated': meta.get('updated_date'), 'counts': s, 'query': url,
                          'subfield': meta['subfield']['display_name'], 'field': meta['field']['display_name']}
# Reference populations: all works; all works whose primary topic is in field Computer Science (fields/17)
raw['reference']['all'], raw['reference']['all_query'] = series('type:article|preprint|review|book-chapter|dissertation|article')
raw['reference']['cs'], raw['reference']['cs_query'] = series('primary_topic.field.id:17')
json.dump(raw, open(sys.argv[1], 'w'), indent=1)

clamp = lambda v: max(0.0, min(100.0, v))
lin = lambda R, B: clamp(50 + ((R - B) / B * 100) / 2)
logi = lambda R, B, k=25: clamp(50 + k * math.log2(R / B))

print('\n## Section 2: Y=2025 vs B=2022 (comparison outline: 2024 vs 2021)')
print('| Topic | Name | B 2022 | R 2025 | Change % | Linear | Log k=25 | Saturated | outline lin | outline log |')
for tid, name in TOPICS:
    c = raw['topics'][tid]['counts']
    B, R = c[2022], c[2025]
    l, g = lin(R, B), logi(R, B)
    sat = ', '.join(x for x, v in (('linear', l), ('log', g)) if v in (0.0, 100.0)) or 'no'
    print(f'| {tid} | {name} | {B:,} | {R:,} | {(R-B)/B*100:+.1f}% | {l:.1f} | {g:.1f} | {sat} | {lin(c[2024], c[2021]):.1f} | {logi(c[2024], c[2021]):.1f} |')

print('\n## Section 3: all windows Y=2018..2025')
stats = {'linear': [], 'log20': [], 'log25': [], 'log30': []}
fns = {'linear': lin, 'log20': lambda R, B: logi(R, B, 20), 'log25': logi, 'log30': lambda R, B: logi(R, B, 30)}
rows = []
for Y in range(2018, 2026):
    vals = {m: [] for m in fns}
    for tid, name in TOPICS:
        c = raw['topics'][tid]['counts']
        B, R = c[Y - 3], c[Y]
        for m, f in fns.items():
            vals[m].append(f(R, B))
        rows.append((Y, tid, B, R))
    line = [str(Y)]
    for m in fns:
        v = vals[m]
        sat = sum(1 for x in v if x in (0.0, 100.0))
        uniq = sorted(v)
        gap = min(b - a for a, b in zip(uniq, uniq[1:]))
        stats[m].append((sat, gap, v))
        line.append(f'{m}: sat {sat}/6 mingap {gap:.1f} [{", ".join(f"{x:.0f}" for x in v)}]')
    print(' | '.join(line))
for m, st in stats.items():
    tot = sum(s for s, _, _ in st)
    tied = sum(1 for s, _, v in st if len(set(round(x, 6) for x in v)) < 6)
    print(f'{m}: saturated {tot}/48, windows with ties {tied}/8, median min-gap {sorted(g for _, g, _ in st)[4]:.1f}')

print('\n## Ratio R/B per topic per window')
for tid, name in TOPICS:
    c = raw['topics'][tid]['counts']
    print(tid, ' '.join(f'{Y}:{c[Y]/c[Y-3]:.2f}' for Y in range(2018, 2026)))

print('\n## Share of Computer Science primary-topic works (per mille), and share-based log index 2022->2025')
cs = raw['reference']['cs']; al = raw['reference']['all']
print('CS works:', ' '.join(f'{y}:{cs[y]:,}' for y in YEARS))
print('All works:', ' '.join(f'{y}:{al[y]:,}' for y in YEARS))
for tid, name in TOPICS:
    c = raw['topics'][tid]['counts']
    sh = {y: c[y] / cs[y] * 1000 for y in YEARS}
    print(tid, ' '.join(f'{y}:{sh[y]:.2f}' for y in (2021, 2022, 2024, 2025)), f'| share log index {logi(sh[2025], sh[2022]):.1f} vs count log index {logi(c[2025], c[2022]):.1f}')
