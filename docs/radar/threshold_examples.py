"""Worked examples + classification rates for the candidate thresholds (owner review, 30 Oct 2026).
Usage: python -I docs/radar/threshold_examples.py <openalex_ai_subfield.json> <dosm_parsed.json> <index-analysis-openalex.json>
"""
import json, math, statistics, sys

oa_ai = json.load(open(sys.argv[1]))
dosm = json.load(open(sys.argv[2]))
six = json.load(open(sys.argv[3]))

# ---- candidate OpenAlex rule (log ratio, symmetric) ----
UP, DOWN = math.log2(1.25), -math.log2(1.25)          # +25% / -20%
VLOW, VHIGH = 8.0, 16.0                                 # SD of annual log changes x100

def oa_classify(c, Y):
    B, R = c.get(Y - 3, 0), c.get(Y, 0)
    if B == 0 or R == 0: return 'special', None, None
    net = math.log2(R / B)
    steps = [math.log(c[y + 1] / c[y]) for y in range(Y - 3, Y)]
    hist = [c.get(y, 0) for y in range(Y - 5, Y + 1)]
    vol = statistics.stdev([math.log(hist[k + 1] / hist[k]) for k in range(5)]) * 100 if min(hist) > 0 else None
    agree = sum(1 for s in steps if (s > 0) == (net > 0))
    if net >= UP: d = 'rising' if agree >= 2 else 'mixed'
    elif net <= DOWN: d = 'declining' if agree >= 2 else 'mixed'
    else: d = 'stable' if (vol is not None and vol < VHIGH) else 'mixed'
    return d, net, vol

counts = {'rising': 0, 'declining': 0, 'stable': 0, 'mixed': 0, 'special': 0}
for tid, d in oa_ai['counts'].items():
    c = {int(y): v for y, v in d['by_year'].items()}
    for Y in range(2020, 2026):
        if min(c.get(y, 0) for y in range(Y - 5, Y + 1)) < 100: continue
        counts[oa_classify(c, Y)[0]] += 1
print('OpenAlex candidate rule on AI-subfield topics (windows 2020-2025, all years >= 100):', counts)

print('\nSix axes, Y=2025:')
for tid, d in six['topics'].items():
    c = {int(y): v for y, v in d['counts'].items()}
    cls, net, vol = oa_classify(c, 2025)
    steps = [round(math.log(c[y + 1] / c[y]) * 100, 1) for y in range(2022, 2025)]
    print(f'  {tid}: ratio {2**net:.2f} net log2 {net:+.3f} steps(log x100) {steps} vol {vol:.1f} -> {cls}')

# ---- candidate DOSM rule (share YoY pp) ----
P = dosm['periods']; T = dosm['total']; G = dosm['groups']; B = set(dosm['breaks'])
idx = {p: i for i, p in enumerate(P)}
brk = [idx[b] for b in B]
share = {g: [(v / t * 100) if (v is not None and t) else None for v, t in zip(vals, T)] for g, vals in G.items()}
PP, REL = 1.0, 10.0
VL, VH = 0.75, 1.75
def yoy(g, i):
    a, b = share[g][i - 4], share[g][i]
    if a is None or b is None: return None
    if any(i - 4 < k <= i for k in brk): return 'break'
    return b - a
rates = {'rising': 0, 'declining': 0, 'stable': 0, 'mixed': 0, 'insufficient': 0}
for i in range(6, len(P)):
    for g in G:
        st = [yoy(g, j) for j in (i - 2, i - 1, i)]
        net = st[-1]
        if net in (None, 'break'): rates['insufficient'] += 1; continue
        clean = [s for s in st if isinstance(s, float)]
        a, b = share[g][i - 4], share[g][i]
        rel = (b - a) / a * 100 if a else None
        agree = sum(1 for s in clean if (s > 0) == (net > 0))
        material = abs(net) >= PP and rel is not None and abs(rel) >= REL
        if material: rates['rising' if net > 0 else 'declining'] += 1 if agree >= min(2, len(clean)) else 0; rates['mixed'] += 0 if agree >= min(2, len(clean)) else 1
        else:
            vol = statistics.stdev(clean) if len(clean) >= 3 else None
            rates['stable' if (vol is None or vol < VH) else 'mixed'] += 1
print('\nDOSM candidate rule (|pp| >= 1.0 and |relative| >= 10%) on quarters 2021 Q1 .. 2026 Q2:', rates)
print('\nDOSM 2025 Q2 (last quarter before the 2025 Q3 possible break), per group:')
i = idx['2025 Q2']
for g in G:
    st = [yoy(g, j) for j in (i - 2, i - 1, i)]
    a, b = share[g][i - 4], share[g][i]
    print(f'  {g[:30]:30} share {a if a is None else round(a,2)} -> {b if b is None else round(b,2)}  YoY pp steps {[s if not isinstance(s,float) else round(s,2) for s in st]}')
