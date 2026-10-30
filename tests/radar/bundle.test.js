// The bundled real snapshots (spec §4.4, §7): a complete, valid active manifest readable through the read-only file store.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { createFileStore } from '../../server/radar/store/file.js'
import { KEYS, RADAR_SOURCES, getJson, readActive } from '../../server/radar/manifest.js'
import { validateSignal } from '../../shared/radar/contract.js'

const store = createFileStore('data/radar/bundle')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

describe('bundled Radar data', () => {
  it('has an active manifest that points at both snapshots and a signals object', async () => {
    const active = await readActive(store)
    expect(active?.manifest).toBeTruthy()
    const m = active.manifest
    for (const s of RADAR_SOURCES) expect(typeof m.snapshots[s]).toBe('string')
    expect(typeof m.signalsId).toBe('string')
  })

  it('every referenced object exists and matches its hash', async () => {
    const { manifest } = await readActive(store)
    expect(await store.get(KEYS.manifest(manifest.manifestId))).toBeTruthy()
    for (const s of RADAR_SOURCES) {
      const got = await getJson(store, KEYS.snapshot(s, manifest.snapshots[s]))
      expect(got, s).toBeTruthy()
      expect(got.value.sourceId).toBe(s)
      for (const o of got.value.originals ?? []) {
        const original = await store.get(KEYS.original(s, o.sha256))
        expect(original, o.name).toBeTruthy()
        expect(sha(original.bytes)).toBe(o.sha256)
      }
    }
    const signals = await getJson(store, KEYS.signals(manifest.signalsId))
    expect(signals.value.manifestId).toBe(manifest.manifestId)
  })

  it('every signal validates', async () => {
    const { manifest } = await readActive(store)
    const { value } = await getJson(store, KEYS.signals(manifest.signalsId))
    expect(value.signals.length).toBeGreaterThan(0)
    for (const s of value.signals) expect(validateSignal(s).ok, s.signalId ?? s.id).toBe(true)
  })

  it('OpenAlex ends with the last complete year 2025 and DOSM with 2026 Q2', async () => {
    const { manifest } = await readActive(store)
    const oa = (await getJson(store, KEYS.snapshot('openalex', manifest.snapshots.openalex))).value
    const dosm = (await getJson(store, KEYS.snapshot('dosm', manifest.snapshots.dosm))).value
    expect(oa.lastYear).toBe(2025)
    expect(dosm.lastQuarter).toBe('2026 Q2')
  })
})
