// Real Radar server on port 0 over the bundled store (now = 2026-10-31); returns the public API data.
import { expect } from 'vitest'
import { createApp } from '../../server/app.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { createRadarService } from '../../server/radar/service.js'
import { loadRadarReferences } from '../../server/radar/references.js'
import * as radarApi from '../../public/js/radarApi.js'

export async function startRadar() {
  const references = await loadRadarReferences('data')
  const radar = createRadarService({ store: null, bundleStore: createFileStore('data/radar/bundle'), references: async () => references, ingestor: null, now: () => new Date('2026-10-31T00:00:00Z') })
  const server = createApp({ radar, d1: null, tempStore: null, llmProviders: [], onetLive: null }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const out = await radarApi.load(undefined, { base })
  expect(out.ok).toBe(true)
  return { base, data: out.data, close: () => new Promise((resolve) => server.close(resolve)) }
}
