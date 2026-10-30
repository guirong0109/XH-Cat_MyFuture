// The 3D roadmap under "How it works": a road drawn in perspective over a ground grid, from the near left into the
// distance on the right, with a stop for each stage still to come. Pure geometry in the SVG's own units (VIEW, stretched
// to the scene); landing.css places each stage's sign over its stop.
export const VIEW = { w: 1000, h: 480, horizon: 150 }
export const STOPS = [[110, 448], [300, 404], [500, 360], [690, 318], [880, 280]]
const ENDS = [[-60, 500], [1080, 246]]
const VANISH = 560
const round = (n) => Math.round(n * 10) / 10

// Wider near the viewer (bottom), narrower towards the horizon.
export const roadWidth = (y) => 12 + 66 * ((y - VIEW.horizon) / (VIEW.h - VIEW.horizon))

// Points along a Catmull-Rom curve through the ends and the stops; every stop is a sample.
function centreLine(steps = 14) {
  const points = [ENDS[0], ...STOPS, ENDS[1]]
  const line = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1], points[i + 2] ?? points[i + 1]]
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      const at = (k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t
        + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)
      line.push([round(at(0)), round(at(1))])
    }
  }
  line.push(points.at(-1))
  return line
}

// road() → { band: polygon points, left / right: the two edges, centre: the dashed middle line }.
export function road() {
  const line = centreLine()
  const side = (sign) => line.map(([x, y], i) => {
    const [ax, ay] = line[Math.max(i - 1, 0)]
    const [bx, by] = line[Math.min(i + 1, line.length - 1)]
    const length = Math.hypot(bx - ax, by - ay) || 1
    const half = roadWidth(y) / 2
    return `${round(x - sign * half * (by - ay) / length)},${round(y + sign * half * (bx - ax) / length)}`
  })
  const left = side(1)
  const right = side(-1)
  return {
    band: [...left, ...right.reverse()].join(' '),
    left: left.join(' '),
    right: right.reverse().join(' '),
    centre: `M${line.map(([x, y]) => `${x} ${y}`).join(' L')}`,
  }
}

// grid() → [[x1, y1, x2, y2], …]: lines across the ground, closer together towards the horizon, and lines running
// to a vanishing point on it.
export function grid() {
  const { w, h, horizon } = VIEW
  const across = Array.from({ length: 9 }, (_, i) => {
    const y = round(horizon + (h - horizon) * ((i + 1) / 9) ** 1.8)
    return [0, y, w, y]
  })
  const start = horizon + 12
  const towards = Array.from({ length: 15 }, (_, i) => {
    const x = VANISH + (i - 7) * 260
    const f = (start - horizon) / (h - horizon)
    return [round(VANISH + (x - VANISH) * f), start, x, h]
  })
  return [...across, ...towards]
}
