// The bundled real snapshots (spec §4.4, §7): a complete, valid active manifest readable through the read-only file store.
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createFileStore } from '../../server/radar/store/file.js'
import { KEYS, RADAR_SOURCES, contentHash, getJson, readActive, sha256 } from '../../server/radar/manifest.js'
import { validateSignal } from '../../shared/radar/contract.js'

const store = createFileStore('data/radar/bundle')
const WORKBOOK = 'data/radar/source/dosm-jmi-2026q2.xlsx'

async function snapshotsOf(manifest) {
  const out = {}
  for (const s of RADAR_SOURCES) out[s] = (await getJson(store, KEYS.snapshot(s, manifest.snapshots[s])))?.value
  return out
}

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
    const snaps = await snapshotsOf(manifest)
    for (const s of RADAR_SOURCES) {
      expect(snaps[s], s).toBeTruthy()
      expect(snaps[s].sourceId).toBe(s)
      expect(snaps[s].contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(contentHash(snaps[s])).toBe(snaps[s].contentHash)
      for (const o of snaps[s].originals ?? []) {
        const original = await store.get(KEYS.original(s, o.sha256))
        expect(original, o.name).toBeTruthy()
        expect(sha256(original.bytes)).toBe(o.sha256)
      }
    }
    const signals = await getJson(store, KEYS.signals(manifest.signalsId))
    expect(signals.value.manifestId).toBe(manifest.manifestId)
  })

  it('every signal validates and cites snapshots the active manifest references', async () => {
    const { manifest } = await readActive(store)
    const { value } = await getJson(store, KEYS.signals(manifest.signalsId))
    expect(value.signals.length).toBeGreaterThan(0)
    const ids = new Set(Object.values(manifest.snapshots))
    for (const s of value.signals) {
      expect(validateSignal(s).ok, s.signalId ?? s.id).toBe(true)
      for (const id of s.sourceSnapshotIds) expect(ids.has(id), `${s.signalId} cites ${id}`).toBe(true)
    }
  })

  it('OpenAlex ends with the last complete year 2025 and DOSM with 2026 Q2', async () => {
    const { manifest } = await readActive(store)
    const { openalex, dosm } = await snapshotsOf(manifest)
    expect(openalex.lastYear).toBe(2025)
    expect(dosm.lastQuarter).toBe('2026 Q2')
  })

  it('the bundled DOSM original is byte-identical to the committed workbook', async () => {
    const { manifest } = await readActive(store)
    const { dosm } = await snapshotsOf(manifest)
    const committed = await readFile(WORKBOOK)
    expect(dosm.originals).toHaveLength(1)
    const bundled = await store.get(KEYS.original('dosm', dosm.originals[0].sha256))
    expect(Buffer.compare(bundled.bytes, committed)).toBe(0)
  })

  it('the DOSM snapshot keeps the release archive listing as break evidence (title change at 2025 Q3)', async () => {
    const { manifest } = await readActive(store)
    const { dosm } = await snapshotsOf(manifest)
    const listing = dosm.meta.listing
    expect(Array.isArray(listing)).toBe(true)
    const quarters = listing.map((e) => e.quarter)
    expect(quarters).toEqual([...quarters].sort())
    const q2 = listing.find((e) => e.quarter === '2025 Q2')
    const q3 = listing.find((e) => e.quarter === '2025 Q3')
    expect(q2.title).toContain('and My Job Profile')
    expect(q3.title).toContain('Job Market Insights')
    expect(q3.title).not.toContain('and My Job Profile')
    expect(q3.publishedAt).toBe('2026-04-28')
    expect(dosm.meta.listingTitle).toBe('Big Data Analytics: Job Market Insights, Second Quarter of 2026')
  })

  it('the previous manifest is consistent with its signals and is not the active one', async () => {
    const active = (await readActive(store)).manifest
    expect(active.previousManifestId).toBeTruthy()
    expect(active.previousManifestId).not.toBe(active.manifestId)
    const prev = (await getJson(store, KEYS.manifest(active.previousManifestId)))?.value
    expect(prev?.manifestId).toBe(active.previousManifestId)
    expect(prev.signalsId).not.toBe(active.signalsId)
    expect(prev.snapshots.dosm).toBe(active.snapshots.dosm)
    const signals = (await getJson(store, KEYS.signals(prev.signalsId)))?.value
    expect(signals.manifestId).toBe(prev.manifestId)
    const ids = new Set(Object.values(prev.snapshots).filter(Boolean))
    expect(signals.signals.length).toBeGreaterThan(0)
    for (const s of signals.signals) {
      expect(validateSignal(s).ok).toBe(true)
      for (const id of s.sourceSnapshotIds) expect(ids.has(id)).toBe(true)
    }
    for (const src of RADAR_SOURCES) {
      if (prev.snapshots[src]) expect(await store.get(KEYS.snapshot(src, prev.snapshots[src]))).toBeTruthy()
    }
  })
})
