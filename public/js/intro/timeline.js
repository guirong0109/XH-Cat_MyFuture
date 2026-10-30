// The ATM intro without three.js: when each phase runs, how the receipt paper curls, and what it prints.
// The scene (atmIntro.js) reads these, so the timing and the text can be tested in Node.

// Phase lengths in seconds, in order. 'done' follows the last one.
const PHASES = [['arrive', 1.0], ['print', 2.8], ['tear', 0.6], ['fly', 1.6], ['reveal', 0.7]]
export const INTRO_LENGTH = PHASES.reduce((sum, [, length]) => sum + length, 0)

// introAt(2.1) → { phase: 'print', k: 0.39 }: the phase at this time and how far through it (0..1).
export function introAt(time) {
  let start = 0
  for (const [phase, length] of PHASES) {
    if (time < start + length) return { phase, k: Math.max(0, (time - start) / length) }
    start += length
  }
  return { phase: 'done', k: 1 }
}

export const shouldPlayIntro = ({ reducedMotion, webgl }) => !reducedMotion && webgl

export const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

// Where a point of the paper sits, d along the paper from the slot (d < 0: still inside the machine).
// The paper leaves the slot straight out (+z), curls down on a quarter circle of radius R, then hangs (−y).
export function curlPoint(d, R) {
  if (d <= 0) return { y: 0, z: d }
  const arc = (Math.PI * R) / 2
  if (d <= arc) return { y: -(R - R * Math.cos(d / R)), z: R * Math.sin(d / R) }
  return { y: -(R + d - arc), z: R }
}

// The receipt, top to bottom: the ATM story (draft copy) ending on the page's question.
export function receiptLines(t) {
  const up = (key) => t(key).toUpperCase()
  return [
    { kind: 'brand', text: 'FUTUREREADY MY' },
    { kind: 'text', text: up('introTitle') },
    { kind: 'rule' },
    { kind: 'row', left: up('introTask'), right: up('introWho'), head: true },
    { kind: 'row', left: up('introCash'), right: up('introMachine') },
    { kind: 'row', left: up('introAdvice'), right: up('introPeople') },
    { kind: 'row', left: up('introSales'), right: up('introPeople') },
    { kind: 'row', left: up('introSolve'), right: up('introPeople') },
    { kind: 'rule' },
    { kind: 'text', text: up('introTeller') },
    { kind: 'text', text: up('introNext'), accent: true },
    { kind: 'rule' },
    { kind: 'big', text: t('heroLine').replace('{em}', t('heroEm')) },
    { kind: 'note', text: t('atmNote') },
  ]
}
