// Pixel art for the landing page's "How it works": a 12 × 12 icon per stage still to come, a padlock, the player sprite and a
// 3 × 5 digit face. Drawn as SVG squares with crisp edges in currentColor, so CSS picks the colour. # is a filled square.
import { esc } from '../ui.js'

export const ICONS = {
  radar: [
    '....####....',
    '..##....##..',
    '.#........#.',
    '.#...##...#.',
    '#...#..#...#',
    '#..#.##.#..#',
    '#..#.##.#..#',
    '#...#..#...#',
    '.#...##...#.',
    '.#........#.',
    '..##....##..',
    '....####....',
  ],
  match: [
    '............',
    '....####....',
    '...##..##...',
    '.##########.',
    '.##########.',
    '.##########.',
    '.####..####.',
    '.##########.',
    '.##########.',
    '.##########.',
    '.##########.',
    '............',
  ],
  roadmap: [
    '.##.........',
    '.########...',
    '.##########.',
    '.########...',
    '.##.........',
    '.##.........',
    '.##.........',
    '.##.........',
    '.##.........',
    '####........',
    '......#.#.#.',
    '............',
  ],
  sdg: [
    '........####',
    '.....#######',
    '...########.',
    '..#######.#.',
    '.######..#..',
    '.#####..#...',
    '.####..#....',
    '.###.##.....',
    '..#.#.......',
    '.#..........',
    '#...........',
    '............',
  ],
  futures: [
    '#..........#',
    '##........##',
    '.##......##.',
    '..##....##..',
    '...##..##...',
    '....####....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '....####....',
  ],
}

export const LOCK = ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########', '########']
export const SPRITE = ['..####..', '..####..', '...##...', '.######.', '#.####.#', '..####..', '..#..#..', '.##..##.']

const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
}

// pixelArt(['##.#']) → an SVG whose path draws each run of # as one rectangle.
export function pixelArt(rows, cls = '') {
  const runs = rows.flatMap((row, y) => [...row.matchAll(/#+/g)].map((run) => `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`))
  return `<svg class="px${cls ? ` ${cls}` : ''}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true"><path d="${runs.join('')}"/></svg>`
}

// pixelDigits('01') → the digits side by side, one blank column apart; screen readers get the plain text.
export function pixelDigits(text) {
  const faces = [...text].map((digit) => DIGITS[digit])
  const rows = Array.from({ length: 5 }, (_, y) => faces.map((face) => face[y]).join('.'))
  return `<span class="lp-sr">${esc(text)}</span>${pixelArt(rows, 'px-digits')}`
}
