// AI tasks scatter (spec 2026-10-31-radar-ai-usage-questions, D40-D42) as an SVG string. One dot per task of the user's
// job: across = share of the task's AI conversations where AI does the task (0-100 %), up = the task's share of all AI
// conversations on a log scale (0.01 % to 10 %; under 0.01 % sits on a labelled band). Dots are drawn at their real
// values: no jitter, so dots at the same place overlap (the list under the chart holds every value). Every dot is a
// keyboard button (<g role="button" tabindex="0" data-act data-arg>). Colours are the app's CSS variables.
import { esc } from '../../ui.js'
import { finite } from './format.js'

const W = 460
const H = 326
export const PLOT = { left: 56, right: 440, top: 24, low: 244, band: 268, bottom: 280 }
const TICKS = [0.01, 0.1, 1, 10]
const MIN = 0.01
const MAX = 10

const p1 = (n) => Math.round(n * 10) / 10
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// automation % -> x
export const xOf = (automation) => PLOT.left + (clamp(automation, 0, 100) / 100) * (PLOT.right - PLOT.left)

// usage % -> y: equal steps per tenfold between 10 % (top) and 0.01 %; anything under 0.01 % goes on the band.
export function yOf(usage) {
  if (!(usage >= MIN)) return PLOT.band
  const f = (Math.log10(MAX) - Math.log10(Math.min(usage, MAX))) / (Math.log10(MAX) - Math.log10(MIN))
  return PLOT.top + f * (PLOT.low - PLOT.top)
}

// items: [{ id, n, text, automation, usage, aria }]; act: the data-act of a dot; label: the chart's aria-label.
export function taskScatter({ items = [], act, label = '', t }) {
  const { left, right, top, low, band, bottom } = PLOT
  const muted = 'fill:var(--muted);font-size:9px'
  let g = `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" style="fill:none;stroke:var(--line)"/>`
  g += `<rect class="rd-band" x="${left}" y="${band - 10}" width="${right - left}" height="20" style="fill:var(--surface2);stroke:none"/>`
  g += `<text x="${left + 6}" y="${band + 3}" style="${muted}">${esc(t('rdAiScUnder'))}</text>`
  for (const v of TICKS) {
    const y = p1(yOf(v))
    g += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" style="stroke:var(--line)"/>`
    g += `<text x="${left - 6}" y="${p1(y + 3)}" text-anchor="end" style="${muted}">${v}%</text>`
  }
  for (const v of [0, 25, 50, 75, 100]) {
    const x = p1(xOf(v))
    if (v !== 50) g += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" style="stroke:var(--line)"/>`
    g += `<text x="${x}" y="${bottom + 14}" text-anchor="middle" style="${muted}">${v}%</text>`
  }
  g += `<line class="rd-half" x1="${p1(xOf(50))}" y1="${top}" x2="${p1(xOf(50))}" y2="${bottom}" stroke-dasharray="4 4" style="stroke:var(--muted)"/>`
  g += `<text x="${left + 6}" y="${top + 12}" style="fill:var(--ink2);font-size:10px">${esc(t('rdAiScHelps'))}</text>`
  g += `<text x="${right - 6}" y="${top + 12}" text-anchor="end" style="fill:var(--ink2);font-size:10px">${esc(t('rdAiScDoes'))}</text>`
  g += `<text x="${(left + right) / 2}" y="${H - 4}" text-anchor="middle" style="fill:var(--muted);font-size:10px">${esc(t('rdAiScX'))}</text>`
  g += `<text x="12" y="${(top + low) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(top + low) / 2})" style="fill:var(--muted);font-size:10px">${esc(t('rdAiScUp'))}</text>`
  for (const it of items) {
    const a = finite(it.automation)
    const u = finite(it.usage)
    if (a === null || u === null) continue
    const x = p1(xOf(a))
    const y = p1(yOf(u))
    g += `<g role="button" tabindex="0" data-act="${esc(act)}" data-arg="${esc(it.id)}" aria-label="${esc(it.aria)}">`
    g += `<circle class="rd-pt" cx="${x}" cy="${y}" r="5" style="fill:var(--est);fill-opacity:0.85;stroke:var(--surface);stroke-width:1.5"/>`
    g += `<text x="${p1(x + 7)}" y="${p1(y + 3)}" style="fill:var(--ink);font-size:9px">T${esc(it.n)}</text></g>`
  }
  return `<svg class="rd-scatter" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`
}
