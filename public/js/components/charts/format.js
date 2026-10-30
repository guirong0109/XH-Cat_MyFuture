// Number text for the charts: round before printing, never print null/undefined/NaN (shows a dash instead).
export const DASH = '—'
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export const fmt = (v, dp = 0) => {
  const n = num(v)
  return n === null ? DASH : n.toFixed(dp).replace(/^-(0(\.0+)?)$/, '$1')
}
export const fmtSigned = (v, dp = 2) => {
  const n = num(v)
  if (n === null) return DASH
  const s = Math.abs(n).toFixed(dp)
  if (Number(s) === 0) return s
  return `${n < 0 ? '−' : '+'}${s}`
}
export const finite = num
