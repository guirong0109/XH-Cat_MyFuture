import { describe, it, expect } from 'vitest'
import { radarChart } from '../../public/js/components/charts/radarChart.js'
import { lineChart } from '../../public/js/components/charts/lineChart.js'
import { divergingBars } from '../../public/js/components/charts/divergingBars.js'
import { profileRadar } from '../../public/js/components/charts/profileRadar.js'
import en from '../../shared/strings/en.js'

const t = (key, vars = {}) => String(en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
const ids = ['language', 'genmedia', 'vision', 'robotics', 'automation', 'service']
const axis = (id, value, extra = {}) => ({ axisId: id, label: id, value, state: value == null ? 'no_baseline' : 'ok', smallCounts: false, highlighted: false, ...extra })
const six = () => ids.map((id, i) => axis(id, 40 + i * 8))
const count = (s, re) => (s.match(re) || []).length

describe('radarChart', () => {
  it('six values: one data polygon with six points, rings 30/50/70/90', () => {
    const svg = radarChart({ axes: six(), comparison: [], t })
    const poly = svg.match(/<polygon class="rd-data"[^>]*points="([^"]+)"/)
    expect(poly[1].trim().split(' ')).toHaveLength(6)
    for (const r of ['30', '50', '70', '90']) expect(svg).toContain(`>${r} `)
    expect(svg).toContain('halved')
    expect(svg).toContain('4×')
  })
  it('every point is a keyboard button with aria-label', () => {
    const svg = radarChart({ axes: six(), comparison: [], t })
    expect(count(svg, /role="button" tabindex="0" data-act="axis" data-arg="/g)).toBe(6)
    expect(svg).toContain('data-arg="vision"')
    expect(count(svg, /<g [^>]*role="button"[^>]*aria-label="[^"]+"/g)).toBe(6)
  })
  it('nulls: polygon excludes them; grey labelled markers each have their own spot', () => {
    const axes = six(); axes[2] = axis('vision', null); axes[4] = axis('automation', null)
    const svg = radarChart({ axes, comparison: [], t })
    expect(svg.match(/<polygon class="rd-data"[^>]*points="([^"]+)"/)[1].trim().split(' ')).toHaveLength(4)
    expect(svg).toContain('rd-noidx')
    expect(svg).toContain('No papers in the starting year')
    const pos = [...svg.matchAll(/<circle class="rd-noidx" cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => m[1] + ',' + m[2])
    expect(new Set(pos).size).toBe(2)
    expect(svg).not.toMatch(/NaN|undefined|null/)
  })
  it('fewer than 3 values: bar fallback, no polygon', () => {
    const axes = six().map((a, i) => (i < 2 ? a : axis(a.axisId, null)))
    const svg = radarChart({ axes, comparison: [], t })
    expect(svg).not.toContain('<polygon')
    expect(svg).toContain('rd-bars')
    expect(svg).toContain('role="button"')
  })
  it('small counts are hollow; capped shows the cap label; comparison is dashed', () => {
    const axes = six(); axes[0] = axis('language', 100, { capped: true, smallCounts: true })
    const svg = radarChart({ axes, comparison: [50, 50, 50, 50, 50, null], t })
    expect(svg).toContain('rd-small')
    expect(svg).toContain('≥ 5.7×')
    expect(svg).toMatch(/<polygon class="rd-cmp"[^>]*stroke-dasharray/)
  })
  it('capped label shows the real ratio, same text in the aria-label', () => {
    const axes = six(); axes[0] = axis('language', 100, { capped: true, ratio: 6.234 })
    const svg = radarChart({ axes, comparison: [], t })
    expect(svg).toContain('≥ 5.7× (6.23×)')
    expect(svg).toMatch(/aria-label="[^"]*≥ 5\.7× \(6\.23×\)[^"]*"/)
  })
  it('bar fallback shows the capped label too', () => {
    const axes = six().map((a, i) => (i === 0 ? axis(a.axisId, 100, { capped: true, ratio: 6.234 }) : axis(a.axisId, null)))
    const svg = radarChart({ axes, comparison: [], t })
    expect(svg).not.toContain('<polygon')
    expect(svg).toContain('≥ 5.7× (6.23×)')
    expect(svg).toMatch(/aria-label="[^"]*≥ 5\.7× \(6\.23×\)[^"]*"/)
  })
  it('labels are escaped and colours come from CSS variables', () => {
    const axes = six(); axes[0].label = '<b>x</b>'
    const svg = radarChart({ axes, comparison: [], t })
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(svg).not.toContain('<b>')
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(svg).toContain('var(--accent)')
  })
})

describe('lineChart', () => {
  const series = [
    { id: 'a', label: 'Alpha <i>', points: [{ year: 2020, value: 10 }, { year: 2021, value: 20 }, { year: 2022, value: null }, { year: 2023, value: 40 }] },
    { id: 'b', label: 'Beta', points: [{ year: 2020, value: 5 }, { year: 2023, value: 6.123 }] },
  ]
  it('draws visible series, skips hidden, escapes labels, labels end values', () => {
    const svg = lineChart({ series, hidden: new Set(['b']), t })
    expect(count(svg, /<polyline/g)).toBeGreaterThanOrEqual(1)
    expect(svg).toContain('Alpha &lt;i&gt;')
    expect(svg).not.toContain('Beta')
    expect(svg).toContain('>40<')
    expect(svg).not.toMatch(/NaN|undefined|null/)
    const both = lineChart({ series, hidden: new Set(), t })
    expect(both).toContain('Beta')
    expect(both).toContain('>6<')
  })
  it('empty gives the no-data text', () => {
    expect(lineChart({ series: [], hidden: new Set(), t })).toContain('No data to show.')
  })
})

describe('divergingBars', () => {
  it('shows signed pp text, direction, and status text for null rows', () => {
    const svg = divergingBars({
      rows: [
        { id: 'r', label: 'Row <u>', pp: 5.67, direction: 'rising', status: 'x', text: '' },
        { id: 'd', label: 'Down', pp: -1.2, direction: 'declining', status: 'x', text: '' },
        { id: 'n', label: 'None', pp: null, direction: 'insufficient', status: 'Not enough data', text: '' },
      ],
      t,
    })
    expect(svg).toContain('+5.67 pp')
    expect(svg).toContain('−1.20 pp')
    expect(svg).toContain('Rising')
    expect(svg).toContain('Not enough data')
    expect(svg).toContain('Row &lt;u&gt;')
    expect(svg).not.toMatch(/NaN|undefined|null/)
  })
})

describe('profileRadar', () => {
  const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `Skill number ${i}`, value: 20000 * (i + 1), aria: `Skill ${i}: aria`, ...extra }))
  const logScale = { kind: 'log', min: 10000, max: 5000000 }
  const rings = [{ value: 10000, label: '10k' }, { value: 100000, label: '100k' }, { value: 1000000, label: '1M', dashed: true }]
  const base = (o = {}) => ({ items: mk(6), scale: logScale, rings, act: 'skCorner', label: 'Skills', colour: 'accent', t, ...o })

  it('6 items: one data polygon plus one per ring, 6 keyboard corners', () => {
    const svg = profileRadar(base())
    expect(count(svg, /<polygon/g)).toBe(1 + rings.length)
    expect(count(svg, /<g [^>]*role="button" tabindex="0" data-act="skCorner" data-arg="s\d"[^>]*aria-label="Skill \d: aria"/g)).toBe(6)
  })
  it('hollow item uses a surface fill', () => {
    const items = mk(6); items[2].hollow = true
    expect(profileRadar(base({ items }))).toContain('fill:var(--surface)')
    expect(profileRadar(base())).not.toMatch(/<circle[^>]*fill:var\(--surface\)/)
  })
  it('ring labels come from the caller', () => {
    const svg = profileRadar(base())
    for (const l of ['10k', '100k', '1M']) expect(svg).toContain(`>${l}<`)
  })
  it('2 items: bars, no polygon', () => {
    const svg = profileRadar(base({ items: mk(2) }))
    expect(svg).toContain('rd-bars')
    expect(svg).not.toContain('<polygon')
    expect(count(svg, /role="button"/g)).toBe(2)
  })
  it('no hex colours; est colour uses var(--est)', () => {
    expect(profileRadar(base({ colour: 'est' }))).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    expect(profileRadar(base({ colour: 'est' }))).toContain('var(--est)')
    expect(profileRadar(base())).not.toContain('var(--est)')
  })
  it('escapes labels and aria', () => {
    const items = mk(6); items[0].label = '<script>x</script>'; items[0].aria = 'a"<b>'
    const svg = profileRadar(base({ items }))
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('a"<b>')
    expect(svg).toContain('&lt;script&gt;')
  })
  it('wraps labels to at most 3 lines with the list number; 30 items show numbers only', () => {
    const items = mk(6); items[0].label = 'A very long skill name that keeps going on and on and on forever'
    const svg = profileRadar(base({ items }))
    expect(svg).toContain('>1 A very long<')
    const g0 = svg.match(/data-arg="s0"[\s\S]*?<\/g>/)[0]
    expect(count(g0, /<tspan/g)).toBeLessThanOrEqual(3)
    const many = profileRadar(base({ items: mk(30) }))
    expect(many).toContain('>30<')
    expect(many).not.toContain('Skill number')
  })
  it('numbersOnlyAbove can be lowered (AI card passes 10)', () => {
    const svg = profileRadar(base({ items: mk(12), numbersOnlyAbove: 10 }))
    expect(svg).not.toContain('Skill number')
    expect(profileRadar(base({ items: mk(12) }))).toContain('Skill')
  })
  it('previous polygon only when every item has a finite previous', () => {
    const one = profileRadar(base())
    expect(count(one, /<polygon/g)).toBe(4)
    expect(one).not.toContain('stroke-dasharray="5 4"')
    const some = mk(6); some[0].previous = 30000
    expect(count(profileRadar(base({ items: some })), /<polygon/g)).toBe(4)
    const all = mk(6, { previous: 30000 })
    const svg = profileRadar(base({ items: all }))
    expect(count(svg, /<polygon/g)).toBe(5)
    expect(svg).toMatch(/<polygon[^>]*class="rd-cmp"[^>]*stroke-dasharray/)
  })
  it('log value below min is drawn at 4% of the radius', () => {
    const items = mk(6, { value: 5 })
    const svg = profileRadar(base({ items }))
    const m = svg.match(/<polygon class="rd-data"[^>]*points="([^"]+)"/)[1].split(' ')
    const [x, y] = m[0].split(',').map(Number)
    expect(Math.hypot(x - 230, y - 175)).toBeCloseTo(118 * 0.04, 0)
  })
  it('linear scale places 50 halfway', () => {
    const svg = profileRadar(base({ scale: { kind: 'linear', min: 0, max: 100 }, items: mk(6, { value: 50 }), rings: [{ value: 50, label: '50' }] }))
    const [x, y] = svg.match(/<polygon class="rd-data"[^>]*points="([^"]+)"/)[1].split(' ')[0].split(',').map(Number)
    expect(Math.hypot(x - 230, y - 175)).toBeCloseTo(59, 0)
  })
})
