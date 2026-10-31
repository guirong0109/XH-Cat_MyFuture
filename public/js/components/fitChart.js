// "How fit is worked out" chart (spec §5, owner's chart): one pair of bars per item, "You" and "Needed", on O*NET's
// 0-7 level scale. Items in O*NET importance order (ties by name); the first 8 unless `all`. Pure: returns HTML text.
import { esc } from '../ui.js'

const MAX = 7
const FIRST = 8
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export const chartOrder = (rows) => [...(rows ?? [])].sort((a, b) => num(b.importance) - num(a.importance) || cmp(String(a.name), String(b.name)))

// A long name goes on two lines, split at the last space within the first 24 characters.
function lines(name) {
  const s = String(name ?? '')
  if (s.length <= 24) return [s]
  const cut = s.lastIndexOf(' ', 24)
  return cut > 0 ? [s.slice(0, cut), s.slice(cut + 1)] : [s]
}

export function fitChart({ rows, t, all = false }) {
  const ordered = chartOrder(rows)
  const shown = all ? ordered : ordered.slice(0, FIRST)
  const L = 175
  const W = 520
  const R = 20
  const step = (W - L - R) / MAX
  const rowH = 38
  const H = shown.length * rowH + 30
  let g = ''
  for (let v = 0; v <= MAX; v++) {
    const x = (L + v * step).toFixed(1)
    g += `<line x1="${x}" y1="4" x2="${x}" y2="${H - 22}" stroke="var(--line)"/><text class="mt-ax" x="${x}" y="${H - 8}" text-anchor="middle">${v}</text>`
  }
  shown.forEach((r, i) => {
    const y = 8 + i * rowH
    const words = lines(r.name)
    words.forEach((w, k) => {
      g += `<text x="${L - 8}" y="${(y + 14 + k * 12 - (words.length - 1) * 6).toFixed(1)}" text-anchor="end">${esc(w)}</text>`
    })
    const you = Math.min(Math.max(num(r.you), 0), MAX)
    const needed = Math.min(Math.max(num(r.needed), 0), MAX)
    g += `<rect x="${L}" y="${y}" width="${Math.max(you * step, 0.5).toFixed(1)}" height="13" fill="var(--you)" stroke="var(--need)" stroke-width=".8"/>`
    g += `<rect x="${L}" y="${y + 14}" width="${(needed * step).toFixed(1)}" height="13" fill="var(--need)"/>`
  })
  return `<svg class="mt-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('mtChartAria'))}">${g}</svg>
    <div class="mt-legend"><span><i style="background:var(--you)"></i>${esc(t('mtYou'))}</span><span><i style="background:var(--need)"></i>${esc(t('mtNeeded'))}</span>
    <span class="muted mt-legend-note">${esc(t('mtScale'))}</span></div>`
}
