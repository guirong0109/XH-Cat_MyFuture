// Public Future Skills Radar routes (spec §13, public rows). Read-only GETs: the server receives no profile data
// (personal relevance is computed in the browser, spec §11.2). Every answer carries manifestId, activeManifestId,
// devStore and the per-source states (spec §12); follow-up calls send ?manifest=<id> back so one screen never mixes
// versions (spec §6.5): an id no longer stored → 409 manifest_gone.
//
// GET /api/radar/manifest       active (or asked) manifest and source states
// GET /api/radar/sources        source registry, links, policies, periods, states
// GET /api/radar/ai/topics      the six axes: yearly series, momentum, signals; the Computer Science reference series
// GET /api/radar/occupations    DOSM groups: counts, shares, signals; total; breaks; context indicator (context_only)
// GET /api/radar/references     topics, field-topic records, occupation bridge, ISCED-F fields with O*NET jobs
// GET /api/radar/signals/:id    one signal with its full evidence
// GET /api/radar/export         radar-signal/v1 signals of the active manifest + references for Matching
import express from 'express'
import { sendError } from '../errors.js'
import { CONTRACT, validateSignal } from '../../shared/radar/contract.js'
import { shares } from '../../shared/radar/dosm.js'
import { DOSM_METRIC, DOSM_UNIT, dosmTableFromSnapshot, openalexCounts } from '../../shared/radar/snapshot.js'
import { DOSM_SHARE_METRIC, OPENALEX_METRIC, OPENALEX_REFERENCE_ID, OPENALEX_REFERENCE_POPULATION, OPENALEX_UNIT } from '../../shared/radar/pipeline.js'
import { RadarError } from './service.js'

const ERRORS = {
  manifest_gone: [409, 'That version of the Radar data is no longer available. Reload to see the current data.', false],
  not_configured: [503, 'The Radar data is not available on this server.', false],
  store_unavailable: [503, 'Saved Radar data is not reachable right now.', true],
  publish_conflict: [503, 'Saved Radar data is not reachable right now.', true],
}

// The two sources as published, with their links and use policies (data/SOURCES.md).
const SOURCES = [
  {
    sourceId: 'openalex',
    name: 'OpenAlex',
    publisher: 'OurResearch',
    links: [
      { label: 'OpenAlex', url: 'https://openalex.org' },
      { label: 'OpenAlex API documentation', url: 'https://docs.openalex.org' },
    ],
    policy: 'OpenAlex data is CC0 (public domain).',
    measures: 'Research papers per year whose primary topic is the axis topic (primary_topic counting rule).',
  },
  {
    sourceId: 'dosm',
    name: 'Department of Statistics Malaysia (DOSM): Big Data Analytics, Job Market Insights',
    publisher: 'Department of Statistics Malaysia',
    links: [
      { label: 'DOSM', url: 'https://www.dosm.gov.my' },
      { label: 'DOSM release archive', url: 'https://www.dosm.gov.my/portal-main/release-archive' },
    ],
    policy: 'Public DOSM release; licence terms per dosm.gov.my (to confirm).',
    measures: 'Online job offerings per quarter by MASCO 2020 major occupation group (Table 2).',
  },
]

const envelope = (answer) => ({ manifestId: answer.manifestId, activeManifestId: answer.activeManifestId, devStore: answer.devStore, states: answer.states })
const signalOf = (view, signalId) => view.signals.signals.find((s) => s.signalId === signalId) ?? null

// ?manifest=: absent or empty → the active manifest; anything else is looked up (a non-string never matches).
function requestedManifest(request) {
  const raw = request.query.manifest
  if (raw === undefined || raw === '') return undefined
  return typeof raw === 'string' ? raw : false
}

function aiTopics(view, refs) {
  const snapshot = view.snapshots.openalex
  const seriesOf = (counts) =>
    Object.entries(counts)
      .map(([year, value]) => ({ year: Number(year), value }))
      .filter((p) => Number.isFinite(p.year))
      .sort((a, b) => a.year - b.year)
  const reference = {}
  for (const o of snapshot?.observations ?? []) {
    if (o.entityType === 'reference' && o.entityId === OPENALEX_REFERENCE_ID && typeof o.value === 'number') reference[o.period] = o.value
  }
  return {
    metric: OPENALEX_METRIC,
    unit: OPENALEX_UNIT,
    snapshotId: snapshot?.snapshotId ?? null,
    fetchedAt: snapshot?.fetchedAt ?? null,
    lastYear: snapshot?.lastYear ?? null,
    classification: snapshot?.classification ?? null,
    sourceLinks: snapshot?.sourceUrls ?? [],
    reference: { id: OPENALEX_REFERENCE_ID, population: OPENALEX_REFERENCE_POPULATION, series: snapshot ? seriesOf(reference) : [] },
    axes: (refs.topics ?? []).map((topic) => ({
      axisId: topic.axisId,
      openalexId: topic.openalexId,
      officialTitle: topic.officialTitle,
      description: topic.description ?? null,
      friendlyLabel: topic.friendlyLabel ?? null,
      hierarchy: topic.hierarchy ?? null,
      sourceUrl: topic.sourceUrl ?? null,
      series: snapshot ? seriesOf(openalexCounts(snapshot, topic.openalexId)) : [],
      momentum: view.signals.momentum?.[topic.axisId] ?? null,
      signal: signalOf(view, `openalex:${topic.openalexId}`),
    })),
  }
}

function occupations(view) {
  const snapshot = view.snapshots.dosm
  const context = view.signals.context?.dosm ?? null
  const base = {
    metric: DOSM_METRIC,
    unit: DOSM_UNIT,
    shareMetric: DOSM_SHARE_METRIC,
    shareUnit: 'percent',
    snapshotId: snapshot?.snapshotId ?? null,
    fetchedAt: snapshot?.fetchedAt ?? null,
    publishedAt: snapshot?.meta?.publishedAt ?? null,
    listingTitle: snapshot?.meta?.listingTitle ?? null,
    classification: snapshot?.classification ?? null,
    sourceLinks: snapshot?.sourceUrls ?? [],
    breaks: view.signals.breaks ?? [],
    // DOSM's own quarter-on-quarter total change: shown as context only, never used to classify anything.
    context: context ? { ...context, label: 'context_only' } : null,
  }
  if (!snapshot) return { ...base, periods: [], latestPeriod: null, total: [], unclassified: [], groups: [] }
  const table = dosmTableFromSnapshot(snapshot)
  const share = shares(table)
  return {
    ...base,
    periods: table.periods,
    latestPeriod: table.periods.at(-1) ?? null,
    total: table.total,
    unclassified: table.unclassified,
    groups: Object.entries(table.groups).map(([code, group]) => ({
      code,
      name: group.name,
      counts: group.values,
      shares: share[code],
      signal: signalOf(view, `dosm:masco2020:${code}`),
    })),
  }
}

// Reference data for personal relevance in the browser (built once; it does not depend on the manifest).
const referencesCache = new WeakMap()
function referenceData(refs) {
  if (referencesCache.has(refs)) return referencesCache.get(refs)
  const data = {
    versions: refs.versions ?? {},
    topics: refs.topics ?? [],
    // Only owner decisions leave the server on public routes (spec §13, D6, ruling R26): approved links, and rejections
    // so the browser can let a detailed rejection override a broader approval. Pending proposals stay with the admin API.
    fieldTopics: (refs.fieldTopics ?? []).filter((m) => m.reviewStatus === 'approved' || m.reviewStatus === 'rejected'),
    bridge: refs.bridgeFile ?? null,
    fields: (refs.fieldList?.() ?? []).map((f) => ({ code: f.code, title: f.title, jobs: refs.fieldJobs(f.code) })),
    emascoRoles: refs.emascoRoles ?? [],
  }
  referencesCache.set(refs, data)
  return data
}

export function radarRoutes({ radar }) {
  const router = express.Router()

  // Each handler gets the answer for the asked (or active) manifest; Radar errors use the app's error shape.
  const handle = (build, { manifestParam = true } = {}) => async (request, response) => {
    try {
      const answer = await radar.answer(manifestParam ? requestedManifest(request) : undefined)
      const body = await build(answer, request, response)
      if (body === null) return undefined
      return response.json({ ...envelope(answer), ...body })
    } catch (error) {
      if (!(error instanceof RadarError)) throw error
      const [status, message, retryable] = ERRORS[error.code] ?? ERRORS.store_unavailable
      return sendError(response, status, ERRORS[error.code] ? error.code : 'store_unavailable', message, retryable)
    }
  }
  const refsOrUnavailable = async () => {
    try {
      return await radar.references()
    } catch {
      throw new RadarError('not_configured')
    }
  }

  router.get('/api/radar/manifest', handle(({ view }) => {
    const m = view.manifest
    return {
      createdAt: m.createdAt ?? null,
      previousManifestId: m.previousManifestId ?? null,
      snapshots: m.snapshots,
      signalsId: m.signalsId,
      configVersion: m.configVersion ?? null,
      mappingVersion: m.mappingVersion ?? null,
      breakReviewsVersion: m.breakReviewsVersion ?? null,
    }
  }))

  router.get('/api/radar/sources', handle(({ view }) => ({
    sources: SOURCES.map((source) => {
      const snapshot = view.snapshots[source.sourceId]
      return {
        ...source,
        snapshotId: snapshot?.snapshotId ?? null,
        observationPeriod: source.sourceId === 'openalex' ? (snapshot?.lastYear != null ? String(snapshot.lastYear) : null) : snapshot?.lastQuarter ?? null,
        publishedAt: source.sourceId === 'dosm' ? snapshot?.meta?.publishedAt ?? null : null,
        fetchedAt: snapshot?.fetchedAt ?? null,
        evidenceLinks: snapshot?.sourceUrls ?? [],
      }
    }),
  })))

  router.get('/api/radar/ai/topics', handle(async ({ view }) => aiTopics(view, await refsOrUnavailable())))

  router.get('/api/radar/occupations', handle(({ view }) => occupations(view)))

  router.get('/api/radar/references', handle(async () => referenceData(await refsOrUnavailable())))

  router.get('/api/radar/signals/:id', handle(({ view }, request, response) => {
    const signal = signalOf(view, request.params.id)
    if (!signal) {
      sendError(response, 404, 'not_found', 'No such Radar signal in this data version.')
      return null
    }
    return { signal }
  }))

  // For Matching: the active manifest's signals, each passing the radar-signal/v1 contract, and the references.
  router.get('/api/radar/export', handle(async ({ view }) => {
    const refs = await refsOrUnavailable()
    return {
      contract: CONTRACT,
      signals: view.signals.signals.filter((s) => s?.contract === CONTRACT && validateSignal(s).ok),
      references: {
        versions: refs.versions ?? {},
        topics: refs.topics ?? [],
        fieldTopics: (refs.fieldTopics ?? []).filter((m) => m.reviewStatus === 'approved'),
        bridgeSteps: refs.bridge?.steps ?? [],
      },
    }
  }, { manifestParam: false }))

  return router
}
