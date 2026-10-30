// Momentum radar as an SVG string. Colours are the app's CSS variables (light and dark themes).
// Every point is a keyboard button (<g role="button" tabindex="0" data-act="axis" data-arg="axisId">) with a text label.
import { esc } from '../../ui.js'
import { fmt, finite } from './format.js'

const RINGS = [[30, 'rdRingHalved'], [50, 'rdRingSame'], [70, 'rdRingDoubled'], [90, 'rdRingFour']]
const W = 460
const H = 350
const CX = 230
const CY = 175
const R = 118

const angle = (i, n) => (-90 + (360 / n) * i) * (Math.PI / 180)
const at = (i, n, v) => [CX + ((R * v) / 100) * Math.cos(angle(i, n)), CY + ((R * v) / 100) * Math.sin(angle(i, n))]
const p1 = (n) => Math.round(n * 10) / 10
const pts = (list) => list.map(([x, y]) => `${p1(x)},${p1(y)}`).join(' ')

function ariaFor(a, t) {
  const v = finite(a.value)
  const parts = [`${a.label}:`, v === null ? t(`rdMom_${a.state || 'invalid'}`) : `${t('rdMomentum')} ${fmt(v)}`]
  if (v !== null && a.capped) parts.push(t('rdMomCapped', { ratio: a.ratio != null ? fmt(a.ratio, 2) : '5.7' }))
  if (v !== null && a.smallCounts) parts.push(t('rdMomSmall'))
  return parts.join(' ')
}

const wrapAttrs = (a, t) =>
  `role="button" tabindex="0" data-act="axis" data-arg="${esc(a.axisId)}" aria-label="${esc(ariaFor(a, t))}"`

// Fallback when fewer than 3 axes have an index: horizontal bars with the same buttons and text.
function barFallback(axes, t) {
  const rowH = 34
  const x0 = 200
  const bw = 200
  let g = ''
  axes.forEach((a, i) => {
    const y = 12 + i * rowH
    const v = finite(a.value)
    const text = v === null ? t(`rdMom_${a.state || 'invalid'}`) : fmt(v)
    g += `<g class="rd-barrow" ${wrapAttrs(a, t)}>`
    g += `<text x="${x0 - 8}" y="${y + 14}" text-anchor="end" style="fill:var(--ink);font-size:12px${a.highlighted ? ';font-weight:700' : ''}">${esc(a.label)}</text>`
    g += `<rect x="${x0}" y="${y}" width="${bw}" height="18" rx="3" style="fill:var(--surface);stroke:var(--line)"/>`
    if (v !== null) {
      const cls = a.smallCounts ? ' class="rd-small"' : ''
      g += `<rect${cls} x="${x0}" y="${y}" width="${p1((bw * Math.max(0, Math.min(100, v))) / 100)}" height="18" rx="3" style="fill:${a.smallCounts ? 'var(--surface)' : 'var(--accent)'};stroke:var(--accent);stroke-width:2"/>`
    }
    g += `<text x="${x0 + bw + 8}" y="${y + 14}" style="fill:${v === null ? 'var(--muted)' : 'var(--ink)'};font-size:11px">${esc(text)}</text>`
    g += '</g>'
  })
  const h = 24 + axes.length * rowH
  return `<svg class="rd-bars" viewBox="0 0 ${W} ${h}" width="100%" role="group" aria-label="${esc(t('rdMomentum'))}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}

export function radarChart({ axes = [], comparison = [], t }) {
  const n = axes.length
  const valid = axes.filter((a) => finite(a.value) !== null)
  if (n < 3 || valid.length < 3) return barFallback(axes, t)

  let g = ''
  for (const [r] of RINGS) {
    const ring = axes.map((_, i) => at(i, n, r))
    g += `<polygon class="rd-ring" points="${pts(ring)}" style="fill:none;stroke:${r === 50 ? 'var(--muted)' : 'var(--line)'}" ${r === 50 ? 'stroke-dasharray="3 3"' : ''}/>`
  }
  axes.forEach((_, i) => {
    const [x, y] = at(i, n, 100)
    g += `<line x1="${CX}" y1="${CY}" x2="${p1(x)}" y2="${p1(y)}" style="stroke:var(--line)"/>`
  })
  for (const [r, key] of RINGS) {
    g += `<text x="${CX + 4}" y="${p1(CY - (R * r) / 100 - 2)}" style="fill:var(--muted);font-size:9px">${r} ${esc(t(key))}</text>`
  }

  // Previous-year comparison: dashed polygon through the axes that have a value.
  const cmp = axes.map((_, i) => (finite(comparison[i]) === null ? null : at(i, n, comparison[i]))).filter(Boolean)
  if (cmp.length >= 3) {
    g += `<polygon class="rd-cmp" points="${pts(cmp)}" stroke-dasharray="5 4" style="fill:none;stroke:var(--muted);stroke-width:1.5"/>`
  }

  g += `<polygon class="rd-data" points="${pts(axes.flatMap((a, i) => (finite(a.value) === null ? [] : [at(i, n, a.value)])))}" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:2"/>`

  axes.forEach((a, i) => {
    const v = finite(a.value)
    const ang = angle(i, n)
    const lx = CX + (R + 16) * Math.cos(ang)
    const ly = CY + (R + 16) * Math.sin(ang)
    const cos = Math.cos(ang)
    const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
    const on = a.highlighted
    g += `<g ${wrapAttrs(a, t)}>`
    g += `<text x="${p1(lx)}" y="${p1(ly + 3)}" text-anchor="${anchor}" style="fill:${on ? 'var(--accent)' : 'var(--ink)'};font-size:11px;font-weight:${on ? 700 : 400}">${esc(a.label)}</text>`
    if (v === null) {
      // No index: grey point at its own spot near the centre of its axis, with the reason as text.
      const [x, y] = at(i, n, 14)
      g += `<circle class="rd-noidx" cx="${p1(x)}" cy="${p1(y)}" r="6" style="fill:var(--muted);stroke:var(--surface);stroke-width:2"/>`
      g += `<text x="${p1(lx)}" y="${p1(ly + 15)}" text-anchor="${anchor}" style="fill:var(--muted);font-size:9px">${esc(t(`rdMom_${a.state || 'invalid'}`))}</text>`
    } else {
      const [x, y] = at(i, n, v)
      const ring = on ? 'stroke-width:3' : 'stroke-width:2.5'
      g += a.smallCounts
        ? `<circle class="rd-small" cx="${p1(x)}" cy="${p1(y)}" r="6" style="fill:var(--surface);stroke:var(--accent);${ring}"/>`
        : `<circle class="rd-pt" cx="${p1(x)}" cy="${p1(y)}" r="6" style="fill:var(--accent);stroke:var(--surface);stroke-width:2"/>`
      g += `<text x="${p1(x + 9)}" y="${p1(y + 4)}" style="fill:var(--ink);font-size:10px">${esc(fmt(v))}${a.capped ? ' ≥ 5.7×' : ''}</text>`
    }
    g += '</g>'
  })

  return `<svg class="rd-radar" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(t('rdMomentum'))}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}
