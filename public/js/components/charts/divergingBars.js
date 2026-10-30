// Diverging bars (change in percentage points) as an SVG string. Each row has a text label with the signed value
// and the direction word; rows without a value show their status text instead of a bar.
import { esc } from '../../ui.js'
import { fmtSigned, finite } from './format.js'

// Note: row.status and row.text are shown as given, so the caller must pass them already translated.
const W = 460
const ROW = 30
const CX = 290
const HALF = 110

const colorFor = (dir) => (dir === 'rising' ? 'var(--ok)' : dir === 'declining' ? 'var(--bad)' : 'var(--muted)')

export function divergingBars({ rows = [], t }) {
  if (!rows.length) return `<p class="muted">${esc(t('rdNoData'))}</p>`
  const max = Math.max(0.01, ...rows.map((r) => (finite(r.pp) === null ? 0 : Math.abs(r.pp))))
  let g = `<line x1="${CX}" y1="0" x2="${CX}" y2="${rows.length * ROW + 8}" style="stroke:var(--line)"/>`
  rows.forEach((r, i) => {
    const y = 6 + i * ROW
    const v = finite(r.pp)
    const dirText = r.direction && r.direction !== 'insufficient' ? t(`rdDir_${r.direction}`) : ''
    g += `<g class="rd-divrow" role="group" aria-label="${esc(`${r.label}: ${v === null ? r.text || r.status || '' : `${fmtSigned(v)} ${t('rdPpUnit')} ${dirText}`}`)}">`
    g += `<text x="${CX - HALF - 8}" y="${y + 15}" text-anchor="end" style="fill:var(--ink);font-size:12px">${esc(r.label)}</text>`
    if (v === null) {
      g += `<text x="${CX + 8}" y="${y + 15}" style="fill:var(--muted);font-size:11px">${esc(r.text || r.status || '')}</text>`
    } else {
      const w = Math.round(((Math.abs(v) / max) * HALF) * 10) / 10
      const x = v < 0 ? CX - w : CX
      g += `<rect x="${x}" y="${y + 3}" width="${w}" height="18" rx="2" style="fill:${colorFor(r.direction)}"/>`
      const tx = v < 0 ? CX - w - 6 : CX + w + 6
      g += `<text x="${tx}" y="${y + 16}" text-anchor="${v < 0 ? 'end' : 'start'}" style="fill:var(--ink);font-size:11px">${esc(fmtSigned(v))} ${esc(t('rdPpUnit'))}${dirText ? ` · ${esc(dirText)}` : ''}</text>`
    }
    g += '</g>'
  })
  const h = rows.length * ROW + 12
  return `<svg class="rd-div" viewBox="0 0 ${W} ${h}" width="100%" role="group" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}
