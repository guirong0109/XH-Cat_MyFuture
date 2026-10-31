import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import review from '../public/js/screens/review.js'
import summary from '../public/js/screens/summary.js'
import upload from '../public/js/screens/upload.js'
import { emptyProfile } from '../shared/profileSchema.js'

const t = (key) => key
const file = (path) => readFile(new URL(`../public/${path}`, import.meta.url), 'utf8')

describe('the app screens in the landing page look', () => {
  it('loads the three fonts: Instrument Serif, Geist and Geist Mono', async () => {
    const html = await file('index.html')
    expect(html).toMatch(/fonts\.googleapis\.com\/css2\?family=Geist:[^"]*family=Geist\+Mono[^"]*family=Instrument\+Serif/)
  })

  it('uses the cream, paper and ink colours, serif headlines and mono labels', async () => {
    const css = await file('styles.css')
    for (const token of ['--bg:#f5f0e6', '--surface:#fffdf8', '--ink:#15130f', '--accent:#15130f']) expect(css).toContain(token)
    for (const font of ['--serif:"Instrument Serif"', '--sans:"Geist"', '--mono:"Geist Mono"']) expect(css).toContain(font)
    expect(css).toMatch(/^h1\{font-family:var\(--serif\)/m)
    expect(css).toMatch(/^\.field label\{font:[^;}]*var\(--mono\)/m)
  })

  it('draws thin rules instead of boxes, and keeps one rule per class', async () => {
    const css = await file('styles.css')
    expect(css).toMatch(/^\.card\{[^}]*border:0;border-top:1px solid var\(--ink\)/m)
    for (const rule of ['.receipt{', '.slot{', '.drop{', '.tabs{', '.choice{', '.banner{', '.tag{', '.chip{']) expect(css).toContain(rule)
    for (const [, name] of css.matchAll(/^\.([\w-]+)\{/gm)) expect(css.match(new RegExp(`^\\.${name}\\{`, 'gm'))).toHaveLength(1)
  })

  it('choice tiles look like buttons: an outline, round corners, an arrow in a circle and a press-down shadow', async () => {
    const css = await file('styles.css')
    const tile = css.match(/^\.grid>\.choice\{([^}]*)\}/m)[1]
    for (const part of ['border:1px solid var(--ink)', 'border-radius:14px', 'box-shadow:4px 4px 0 var(--ink)']) expect(tile).toContain(part)
    expect(css).toMatch(/^\.grid>\.choice::after\{[^}]*border-radius:50%/m)
    expect(css).toMatch(/^\.grid>\.choice:active\{[^}]*box-shadow:0 0 0 var\(--ink\)/m)
  })

  it('prints the profile as a receipt on Review and Your profile', () => {
    const profile = { ...emptyProfile(), profileStatus: 'confirmed' }
    expect(review({ t, state: { profile } })).toMatch(/<div class="receipt"[^>]*><table>/)
    expect(summary({ t, state: { profile, usable: true } })).toMatch(/<div class="receipt"[^>]*><table>/)
  })

  it('the CV goes into the ATM, and the reading and the draft print out as receipts', () => {
    const profile = emptyProfile()
    expect(upload({ t, state: { profile } })).toContain('<div class="drop atm" id="cvDrop">')
    expect(upload({ t, state: { profile, cv: { phase: 'busy', step: 1 } } })).toContain('<div class="slot"><div class="receipt"><ol class="steps">')
    const ready = upload({ t, state: { profile, lang: 'en', cv: { phase: 'ready', language: 'en' } } })
    expect(ready).toMatch(/<div class="slot"><div class="receipt"><h3>/)
  })
})
