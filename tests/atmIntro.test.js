import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { INTRO_LENGTH, curlPoint, introAt, receiptLines, shouldPlayIntro } from '../public/js/intro/timeline.js'
import { t as translate } from '../shared/i18n.js'

describe('ATM intro timeline', () => {
  it('runs arrive → print → tear → fly, then holds the receipt until the user moves on', () => {
    const order = ['arrive', 'print', 'tear', 'fly', 'hold']
    let last = 0
    for (let time = 0; time <= INTRO_LENGTH + 1; time += 0.05) {
      const { phase, k } = introAt(time)
      const index = order.indexOf(phase)
      expect(index).toBeGreaterThanOrEqual(last)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThanOrEqual(1)
      last = index
    }
    expect(introAt(0).phase).toBe('arrive')
    expect(introAt(INTRO_LENGTH)).toEqual({ phase: 'hold', k: 1 })
    expect(introAt(INTRO_LENGTH + 600).phase).toBe('hold')
  })

  it('is skipped when the user asks for less motion or the browser has no WebGL', () => {
    expect(shouldPlayIntro({ reducedMotion: false, webgl: true })).toBe(true)
    expect(shouldPlayIntro({ reducedMotion: true, webgl: true })).toBe(false)
    expect(shouldPlayIntro({ reducedMotion: false, webgl: false })).toBe(false)
  })
})

describe('receipt paper', () => {
  it('leaves the slot straight, curls down, then hangs without jumps', () => {
    const R = 0.3
    expect(curlPoint(-0.2, R)).toEqual({ y: 0, z: -0.2 })
    const step = 1e-4
    for (const d of [0, (Math.PI * R) / 2]) {
      const a = curlPoint(d - step, R)
      const b = curlPoint(d + step, R)
      expect(Math.hypot(a.y - b.y, a.z - b.z)).toBeLessThan(3 * step)
    }
    const low = curlPoint(2, R)
    expect(low.z).toBeCloseTo(R)
    expect(low.y).toBeLessThan(-1.5)
  })

  it('prints the question section (the ATM story) in the chosen language, marked draft, without the page headline', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const t = (key, vars) => translate(lang, key, vars)
      const lines = receiptLines(t)
      const text = lines.map((line) => line.text ?? '').join('\n')
      expect(text).not.toMatch(/undefined|\{\w+\}/)
      expect(lines).toContainEqual({ kind: 'label', text: t('ldQKicker').toUpperCase() })
      expect(lines).toContainEqual({ kind: 'quote', text: t('atmTitle') })
      expect(lines).toContainEqual({ kind: 'body', text: t('atmBody') })
      expect(lines.at(-1)).toEqual({ kind: 'note', text: t('atmNote') })
      expect(text).not.toContain(t('heroEm'))
    }
  })
})

describe('three.js from our own server', () => {
  let server
  let directory
  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('serves the three.js module and its add-ons (works offline, no CDN)', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'three-'))
    server = createApp({ dataDir: directory, d1: null, tempStore: null, llmProviders: [] }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    for (const file of ['/vendor/three/build/three.module.js', '/vendor/three/addons/geometries/RoundedBoxGeometry.js']) {
      const response = await fetch(base + file)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/javascript/)
      expect((await response.text()).length).toBeGreaterThan(1000)
    }
  })
})
