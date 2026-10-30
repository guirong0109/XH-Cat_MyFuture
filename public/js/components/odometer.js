// Mechanical roller counters for the landing page's numbers. Each digit is a wheel in a recessed window; it rolls
// from 0 when first seen, lower digits spin more turns (faster), and it overshoots a little before settling.
// Without script, or with "reduce motion", the window simply shows the value.
import { esc } from '../ui.js'

const CELL_EM = 1.1 // height of one digit on the wheel (matches .odo-wheel in landing.css)
const MAX_TURNS = 3

// rollPlan('600,000+') → { parts: [{kind:'digit', digit, cells, to, ms} | {kind:'sep', char}], suffix: '+' }
export function rollPlan(value) {
  const [, body, suffix] = String(value).match(/^([\d,.]*)(.*)$/)
  let place = 0
  const parts = [...body].map((char) => {
    if (!/\d/.test(char)) return { kind: 'sep', char }
    const digit = Number(char)
    const turns = Math.min(place, MAX_TURNS)
    const cells = [...Array.from({ length: turns * 10 }, (_, i) => i % 10), ...Array.from({ length: digit + 1 }, (_, i) => i), (digit + 1) % 10]
    const wheel = { kind: 'digit', digit, cells, to: cells.length - 2, ms: 1100 + 170 * place }
    place += 1
    return wheel
  })
  return { parts, suffix }
}

export function odometer(value, key) {
  const { parts, suffix } = rollPlan(value)
  const wheels = parts.map((part) => (part.kind === 'sep'
    ? `<span class="odo-sep">${esc(part.char)}</span>`
    : `<span class="odo-wheel"><span class="odo-strip" style="--to:${part.to}" data-to="${part.to}" data-ms="${part.ms}">${part.cells.map((n) => `<i>${n}</i>`).join('')}</span></span>`)).join('')
  return `<span class="odo" data-odo="${esc(key)}"><span class="lp-sr">${esc(value)}</span><span class="odo-face" aria-hidden="true"><span class="odo-window">${wheels}</span>${suffix ? `<span class="odo-suffix">${esc(suffix)}</span>` : ''}</span></span>`
}

// Browser only. The app redraws the whole page on any change (a reply from the server, a language change), so each
// counter remembers when its roll started: a redrawn counter carries on from the same moment, or shows its value.
const startedAt = new Map()
let observer = null
const at = (cells) => `translateY(${(-cells * CELL_EM).toFixed(3)}em)`

function roll(counter, elapsed = 0) {
  if (!counter.isConnected) return
  // the hero's counters wait for the ATM intro to finish
  if (document.body.classList.contains('intro-playing')) return setTimeout(() => roll(counter), 150)
  if (!startedAt.has(counter.dataset.odo)) startedAt.set(counter.dataset.odo, performance.now())
  for (const strip of counter.querySelectorAll('.odo-strip')) {
    const to = Number(strip.dataset.to)
    const animation = strip.animate([
      { transform: at(0), easing: 'cubic-bezier(.3,.04,.22,1)' },
      { transform: at(to + 0.24), offset: 0.8, easing: 'ease-in-out' },
      { transform: at(to - 0.07), offset: 0.92, easing: 'ease-in-out' },
      { transform: at(to) },
    ], { duration: Number(strip.dataset.ms), fill: 'forwards' })
    animation.currentTime = elapsed
    animation.onfinish = () => animation.cancel()
  }
  counter.classList.remove('armed')
}

export function armOdometers(root, { reducedMotion }) {
  if (reducedMotion || !('IntersectionObserver' in window)) return
  observer?.disconnect()
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      observer.unobserve(entry.target)
      roll(entry.target)
    }
  }, { threshold: 0.6 })
  for (const counter of root.querySelectorAll('.odo[data-odo]')) {
    const started = startedAt.get(counter.dataset.odo)
    if (started === undefined) {
      counter.classList.add('armed')
      observer.observe(counter)
    } else if (performance.now() - started < 3000) {
      roll(counter, performance.now() - started)
    }
  }
}
