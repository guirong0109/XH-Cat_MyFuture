// Profile radar as an SVG string, for both the skills chart (log scale) and the AI tasks chart (linear scale).
// Colours are the app's CSS variables. Every corner is a keyboard button (<g role="button" tabindex="0" data-act data-arg>).
// Ring labels and aria text come from the caller. Fewer than 3 items fall back to horizontal bars.
import { esc } from '../../ui.js'
import { fmt, finite } from './format.js'

const W = 460
const H = 350
const CX = 230
const CY = 175
const R = 118
const FLOOR = 0.04 // a log value below min is drawn here, never at the centre
const LINE = 16
const LINES = 3

const angle = (i, n) => (-90 + (360 / n) * i) * (Math.PI / 180)
const p1 = (n) => Math.round(n * 10) / 10
const pts = (list) => list.map(([x, y]) => `${p1(x)},${p1(y)}`).join(' ')

// Value -> 0..1 share of the radius.
function frac(scale, v) {
  const x = finite(v)
  if (x === null) return 0
  const { kind, min, max } = scale
  if (kind === 'log') {
    if (x < min) return FLOOR
    return Math.min(1, Math.max(FLOOR, Math.log(x / min) / Math.log(max / min)))
  }
  return Math.min(1, Math.max(0, (x - min) / (max - min)))
}

// Greedy wrap of words to `line` characters, at most `max` lines; the last line ends with … when text is cut.
function wrap(text, line = LINE, max = LINES) {
  const lines = []
  let cur = ''
  const words = String(text).split(/\s+/).filter(Boolean)
  for (let k = 0; k < words.length; k++) {
    const w = words[k]
    if (cur && (cur + ' ' + w).length > line) {
      lines.push(cur)
      cur = w
      if (lines.length === max) break
    } else cur = cur ? `${cur} ${w}` : w
  }
  if (lines.length < max && cur) lines.push(cur)
  const used = lines.join(' ').split(/\s+/).length
  if (used < words.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, line - 1)}…`
  return lines.map((l) => (l.length > line + 4 ? `${l.slice(0, line + 3)}…` : l))
}

const attrs = (it, act) => `role="button" tabindex="0" data-act="${esc(act)}" data-arg="${esc(it.id)}" aria-label="${esc(it.aria)}"`

const BAR_LINE = 28 // characters of a bar label per line (the label column is 182 wide)
const BAR_LINES = 2

function barFallback(items, scale, act, label, c, prefix = '') {
  const rowH = 34
  const x0 = 190
  const bw = 130
  let g = ''
  items.forEach((it, i) => {
    const y = 12 + i * rowH
    const f = frac(scale, it.value)
    const lines = wrap(prefix ? `${prefix}${i + 1} ${it.label}` : it.label, BAR_LINE, BAR_LINES)
    const ty = y + 14 - ((lines.length - 1) * 12) / 2
    const val = wrap(it.valueText ?? fmt(it.value), 22, 1)[0] ?? ''
    g += `<g class="rd-barrow" ${attrs(it, act)}>`
    g += `<text x="${x0 - 8}" y="${p1(ty)}" text-anchor="end" style="fill:var(--ink);font-size:12px">${lines.map((l, k) => `<tspan x="${x0 - 8}" dy="${k === 0 ? 0 : 12}">${esc(l)}</tspan>`).join('')}</text>`
    g += `<rect x="${x0}" y="${y}" width="${bw}" height="18" rx="3" style="fill:var(--surface);stroke:var(--line)"/>`
    g += `<rect x="${x0}" y="${y}" width="${p1(bw * f)}" height="18" rx="3" style="fill:${it.hollow ? 'var(--surface)' : c};stroke:${c};stroke-width:2"/>`
    g += `<text x="${x0 + bw + 8}" y="${y + 14}" style="fill:var(--ink);font-size:11px">${esc(val)}</text>`
    g += '</g>'
  })
  const h = 24 + items.length * rowH
  return `<svg class="rd-bars" viewBox="0 0 ${W} ${h}" width="100%" role="group" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}

export function profileRadar({ items = [], scale, rings = [], act, label = '', colour = 'accent', numbersOnlyAbove = 16, prefix = '', t } = {}) {
  const c = colour === 'est' ? 'var(--est)' : 'var(--accent)'
  const n = items.length
  if (n < 3) return barFallback(items, scale, act, label, c, prefix)

  const at = (i, f) => [CX + R * f * Math.cos(angle(i, n)), CY + R * f * Math.sin(angle(i, n))]
  let g = ''
  for (const r of rings) {
    const f = frac(scale, r.value)
    g += `<polygon class="rd-ring" points="${pts(items.map((_, i) => at(i, f)))}" style="fill:none;stroke:${r.dashed ? 'var(--muted)' : 'var(--line)'}"${r.dashed ? ' stroke-dasharray="3 3"' : ''}/>`
  }
  items.forEach((_, i) => {
    const [x, y] = at(i, 1)
    g += `<line x1="${CX}" y1="${CY}" x2="${p1(x)}" y2="${p1(y)}" style="stroke:var(--line)"/>`
  })
  for (const r of rings) {
    g += `<text x="${CX + 4}" y="${p1(CY - R * frac(scale, r.value) - 2)}" style="fill:var(--muted);font-size:9px">${esc(r.label)}</text>`
  }

  // Previous values: dashed polygon, only when every item has one.
  if (items.every((it) => finite(it.previous) !== null)) {
    g += `<polygon class="rd-cmp" points="${pts(items.map((it, i) => at(i, frac(scale, it.previous))))}" stroke-dasharray="5 4" style="fill:none;stroke:var(--muted);stroke-width:1.5"/>`
  }
  g += `<polygon class="rd-data" points="${pts(items.map((it, i) => at(i, frac(scale, it.value))))}" style="fill:${c};fill-opacity:0.15;stroke:${c};stroke-width:2"/>`

  const full = n <= numbersOnlyAbove
  items.forEach((it, i) => {
    const ang = angle(i, n)
    const lx = CX + (R + 16) * Math.cos(ang)
    const ly = CY + (R + 16) * Math.sin(ang)
    const cos = Math.cos(ang)
    const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
    const lines = full ? wrap(`${prefix}${i + 1} ${it.label}`) : [`${prefix}${i + 1}`]
    const y0 = ly + 3 - ((lines.length - 1) * 12) / 2 * (Math.sin(ang) < -0.3 ? 2 : Math.sin(ang) > 0.3 ? 0 : 1)
    g += `<g ${attrs(it, act)}>`
    g += `<text x="${p1(lx)}" y="${p1(y0)}" text-anchor="${anchor}" style="fill:var(--ink);font-size:10px">`
    g += lines.map((l, k) => `<tspan x="${p1(lx)}" dy="${k === 0 ? 0 : 12}">${esc(l)}</tspan>`).join('')
    g += '</text>'
    const [x, y] = at(i, frac(scale, it.value))
    g += `<circle class="${it.hollow ? 'rd-new' : 'rd-pt'}" cx="${p1(x)}" cy="${p1(y)}" r="6" style="fill:${it.hollow ? 'var(--surface)' : c};stroke:${it.hollow ? c : 'var(--surface)'};stroke-width:${it.hollow ? 2.5 : 2}"/>`
    g += '</g>'
  })

  return `<svg class="rd-radar" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}
