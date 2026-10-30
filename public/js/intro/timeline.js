// The ATM stage without three.js: when each phase runs, how the receipt paper curls, and what it prints.
// The scene (atmIntro.js) reads these, so the timing and the text can be tested in Node.

// The ATM comes into view, then waits ('idle') until the user clicks.
export const ARRIVE_LENGTH = 1.0
// After the click, phase lengths in seconds, in order. Then 'pinned': the receipt stays in the middle.
const PHASES = [['print', 2.8], ['tear', 0.6], ['fly', 1.6]]
export const INTRO_LENGTH = PHASES.reduce((sum, [, length]) => sum + length, 0)

// stageAt(sinceLoad, sincePrint) → { phase, k }: the phase and how far through it (0..1).
// sincePrint is null until the user clicks to print.
export function stageAt(sinceLoad, sincePrint) {
  if (sincePrint === null) return sinceLoad < ARRIVE_LENGTH ? { phase: 'arrive', k: Math.max(0, sinceLoad / ARRIVE_LENGTH) } : { phase: 'idle', k: 1 }
  let start = 0
  for (const [phase, length] of PHASES) {
    if (sincePrint < start + length) return { phase, k: Math.max(0, (sincePrint - start) / length) }
    start += length
  }
  return { phase: 'pinned', k: 1 }
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

// The receipt, top to bottom: the landing page's question section (the ATM story, draft copy).
export function receiptLines(t) {
  return [
    { kind: 'brand', text: 'FUTUREREADY MY' },
    { kind: 'text', text: t('introTitle').toUpperCase() },
    { kind: 'rule' },
    { kind: 'label', text: t('ldQKicker').toUpperCase() },
    { kind: 'quote', text: t('atmTitle') },
    { kind: 'body', text: t('atmBody') },
    { kind: 'rule' },
    { kind: 'note', text: t('atmNote') },
  ]
}
