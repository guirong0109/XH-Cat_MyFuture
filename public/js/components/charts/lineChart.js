// Multi-series line chart as an SVG string. Each visible series is drawn with its own dash pattern and a direct
// text label at its last value, so colour is never the only cue. Colours are the app's CSS variables.
import { esc } from '../../ui.js'
import { fmt, finite } from './format.js'

const COLORS = ['var(--accent)', 'var(--src)', 'var(--est)', 'var(--ok)', 'var(--bad)', 'var(--ink)']
const DASHES = ['', '6 3', '2 3', '8 3 2 3', '', '6 3']
const W = 460
const H = 260
const L = 44
const RGT = 150
const T = 14
const B = 28

export function lineChart({ series = [], hidden = new Set(), t }) {
  const shown = series.filter((s) => !hidden.has(s.id))
  const all = shown.flatMap((s) => (s.points || []).filter((p) => finite(p.value) !== null && finite(p.year) !== null))
  if (!all.length) return `<p class="muted">${esc(t('rdNoData'))}</p>`

  const years = all.map((p) => p.year)
  const y0 = Math.min(...years)
  const y1 = Math.max(...years)
  const vmax = Math.max(...all.map((p) => p.value), 1)
  const x = (yr) => L + (y1 === y0 ? (W - L - RGT) / 2 : ((yr - y0) / (y1 - y0)) * (W - L - RGT))
  const y = (v) => H - B - (v / vmax) * (H - B - T)
  const r1 = (n) => Math.round(n * 10) / 10

  let g = ''
  g += `<line x1="${L}" y1="${H - B}" x2="${W - RGT}" y2="${H - B}" style="stroke:var(--line)"/>`
  g += `<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" style="stroke:var(--line)"/>`
  g += `<text x="${L - 6}" y="${r1(y(vmax) + 4)}" text-anchor="end" style="fill:var(--muted);font-size:10px">${esc(fmt(vmax))}</text>`
  g += `<text x="${L - 6}" y="${H - B + 4}" text-anchor="end" style="fill:var(--muted);font-size:10px">0</text>`
  g += `<text x="${L}" y="${H - 8}" text-anchor="middle" style="fill:var(--muted);font-size:10px">${esc(y0)}</text>`
  if (y1 !== y0) g += `<text x="${W - RGT}" y="${H - 8}" text-anchor="middle" style="fill:var(--muted);font-size:10px">${esc(y1)}</text>`

  const ordered = [...shown]
  ordered.forEach((s) => {
    const i = series.indexOf(s)
    const color = COLORS[i % COLORS.length]
    const dash = DASHES[i % DASHES.length]
    const pts = (s.points || []).filter((p) => finite(p.value) !== null && finite(p.year) !== null).sort((a, b) => a.year - b.year)
    if (!pts.length) return
    const da = dash ? ` stroke-dasharray="${dash}"` : ''
    // Break the line at gaps: one polyline per run of consecutive years.
    const runs = []
    let run = []
    for (const p of pts) {
      if (run.length && p.year - run[run.length - 1].year > 1) { runs.push(run); run = [] }
      run.push(p)
    }
    runs.push(run)
    for (const rn of runs) {
      g += `<polyline points="${rn.map((p) => `${r1(x(p.year))},${r1(y(p.value))}`).join(' ')}"${da} style="fill:none;stroke:${color};stroke-width:2"/>`
    }
    for (const p of pts) g += `<circle cx="${r1(x(p.year))}" cy="${r1(y(p.value))}" r="3" style="fill:${color}"/>`
    const last = pts[pts.length - 1]
    g += `<text x="${r1(x(last.year) + 8)}" y="${r1(y(last.value) + 4)}" style="fill:var(--ink);font-size:10px">${esc(s.label)} <tspan>${esc(fmt(last.value))}</tspan></text>`
  })
  return `<svg class="rd-lines" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(shown.map((s) => s.label).join(', '))}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}
