// Radar admin review (#admin) and judge Trend Change Test (#judge) screens (spec §8, §9, §11.5a, §12, §13).
// The app's own design (D22): styles.css tokens and classes, plus the rd-* classes. No score, weight or ranking anywhere.
// The key box is a password field that is never filled in or echoed; the key and the CSRF token never reach the state
// (public/js/radarAdminApi.js keeps the token in memory). Every interpolated value goes through esc().
//
// adminView({t, state, data}): data = {public (radarApi.load data), status, mappings, breaks, now?}
// judgeView({t, state, data}):  data = {report (demo before/after report), now?}
// UI state: state.radarAdmin = {session: {role, expiresAt}, msgs: {signin|map|brk|status|refresh|judge: msg}, notes,
//                               scen: 'A'|'B'|'C', exported, devStore (from GET /api/radar/manifest on open)}
import { esc, tag } from '../ui.js'
import { DASH, finite, fmt, fmtSigned } from '../components/charts/format.js'
import { fmtDate, fmtInt, fmtPct, fmtSignedPct, ruleText, safeUrl, srcLink, statusTag } from '../components/evidencePanel.js'
import { statusCards } from './radar.js'
import { RADAR_CONFIG } from '../../../shared/radar/config.js'

const SOURCE_NAMES = { openalex: 'OpenAlex', dosm: 'DOSM' }
// Display name of a source in the admin tables and messages (the two O*NET names are translated).
const srcName = (t, id) => (id === 'onet-skills' ? t('rdSrcOnetSkills') : id === 'onet-hottech' ? t('rdSrcOnetHot') : SOURCE_NAMES[id] ?? id)
const RELEASE_PATTERN = '\\d{2}\\.\\d' // HTML pattern attribute: two digits, a dot, one digit
const LEVELS = { 2: 'rdLevel_broad', 3: 'rdLevel_narrow', 4: 'rdLevel_detailed' }
const MAP_STATUS = { pending: ['unv', 'rdStatusProposed'], approved: ['ok', 'rdStatusApproved'], rejected: ['bad', 'rdStatusRejected'] }
const MAP_DECISIONS = [['approved', 'rdApprove'], ['rejected', 'rdReject'], ['revise', 'rdRevise']]
const BREAK_DECISIONS = [['confirmed', 'rdBreakConfirm'], ['dismissed_counts', 'rdBreakDismiss'], ['dismissed_shares', 'rdBreakDismissShares'], ['annotate', 'rdBreakAnnotate']]
const BREAK_KIND = { unreviewed: 'unv', confirmed: 'bad', dismissed_counts: 'ok', dismissed_shares: 'ok' }
// Codes made in the browser (never sent): their own text, no code shown.
const CLIENT_CODES = { note_required: 'rdNoteRequired', bad_link: 'rdLinkInvalid', no_edit: 'rdJudgeNoEdit' }
const GRID_QUARTERS = 5
const GROUP_PREFIX = 'masco2020:'

const ui = (state) => state?.radarAdmin ?? {}
const signedIn = (state, role) => ui(state).session?.role === role
const nowOf = (data) => (finite(data?.now) !== null ? data.now : Date.now())

// The rdErr_* text of a code; an unknown code gets the general text (never a raw key).
export function errText(t, code) {
  if (CLIENT_CODES[code]) return t(CLIENT_CODES[code])
  const key = `rdErr_${code}`
  const text = t(key)
  return text === key ? t('rdErr_other') : text
}

function minutesLeft(expiresAt, now) {
  const end = Date.parse(expiresAt ?? '')
  return Number.isFinite(end) ? String(Math.max(0, Math.ceil((end - now) / 60000))) : DASH
}

// A message region: always present (so focus can move to it), filled when there is something to say.
// After a mapping or break decision: applied now (a new data version) or at the next refresh (with the code).
function recalcMsg(t, m) {
  if (m.kind !== 'ok' || !m.recalculation) return null
  const r = m.recalculation
  return r.appliesAt === 'now'
    ? esc(t('rdBreakApplied', { manifest: r.manifestId ?? DASH }))
    : `${esc(t('rdBreakNextRefresh'))}${r.code ? ` <code>${esc(r.code)}</code> ${esc(errText(t, r.code))}` : ''}`
}

function message(t, state, name, inner = null) {
  const m = ui(state).msgs?.[name]
  const id = `admMsg-${name}`
  if (!m) return `<div id="${id}" class="rd-msg" role="status" tabindex="-1"></div>`
  let body = inner ? inner(m) : null
  if (body === null) {
    if (m.kind === 'bad') {
      const code = CLIENT_CODES[m.code] ? '' : ` <code>${esc(m.code)}</code>`
      const errors = (m.errors ?? []).length ? `<ul class="rd-list tiny">${m.errors.map((e) => `<li><code>${esc(e.code)}</code> ${esc(e.path ?? '')}${e.sourceId ? ` · ${esc(e.sourceId)}` : ''}</li>`).join('')}</ul>` : ''
      body = `${esc(errText(t, m.code))}${code}${errors}`
    } else {
      body = esc(m.key ? t(m.key, m.vars ?? {}) : '')
    }
  }
  const kind = m.kind === 'bad' ? 'b-bad' : 'b-info'
  return `<div id="${id}" class="banner ${kind} rd-msg" role="${m.kind === 'bad' ? 'alert' : 'status'}" tabindex="-1"><div>${body}</div></div>`
}

function devBanner(t, on) {
  return on ? `<div class="banner b-warn"><div>${esc(t('rdDevStore'))}</div></div>` : ''
}

// The key box: a labelled password field, never given a value; the key is read once on submit and the box cleared.
function signInCard(t, state, role) {
  const admin = role === 'admin'
  return `<div class="card rd-sec">
    <h2>${esc(t('rdAdminSignIn'))}</h2>
    <p class="small muted">${esc(t(admin ? 'rdAdminKeyNote' : 'rdJudgeKeyNote'))}</p>
    <form class="rd-signin" data-form="admSignIn" data-arg="${role}" autocomplete="off" novalidate>
      <div class="field"><label for="admKey">${esc(t(admin ? 'rdAdminKey' : 'rdJudgeKey'))}</label>
        <input type="password" id="admKey" name="admKey" autocomplete="off" spellcheck="false" required></div>
      ${admin ? `<div class="field"><label for="admLabel">${esc(t('rdAdminLabel'))}</label><input type="text" id="admLabel" name="admLabel" autocomplete="off" maxlength="40"></div>` : ''}
      <button class="btn pri" type="submit">${esc(t('rdAdminSignIn'))}</button>
    </form>
    ${message(t, state, 'signin')}
  </div>`
}

const disabled = (on) => (on ? ' disabled' : '')

// ---------- admin: mapping review ----------

function mappingCard(t, state, data) {
  const lang = state?.lang ?? 'en'
  const m = data.mappings ?? {}
  const writable = Boolean(m.writable)
  const fields = new Map((data.public?.refs?.fields ?? []).map((f) => [f.code, f.title]))
  const topics = new Map((data.public?.refs?.topics ?? []).map((tp) => [tp.axisId, tp]))
  const rows = (m.mappings ?? []).map((p) => {
    const code = String(p.iscedCode ?? '')
    const level = LEVELS[code.length] ? t(LEVELS[code.length]) : DASH
    const title = fields.get(code)
    const axisKey = `rdAxis_${p.axisId}`
    const axis = t(axisKey) === axisKey ? String(p.axisId ?? DASH) : t(axisKey)
    const topic = topics.get(p.axisId)
    const [kind, label] = MAP_STATUS[p.reviewStatus] ?? MAP_STATUS.pending
    const last = p.reviewedAt ? `<div class="tiny muted">${esc(p.reviewedBy ?? DASH)} · ${esc(fmtDate(p.reviewedAt))}</div>` : ''
    const reason = p.reason?.[lang] ?? p.reason?.en ?? DASH
    const buttons = MAP_DECISIONS.map(([decision, key]) => `<button class="btn sm" data-act="admMap" data-arg="${esc(`${p.mappingId}|${decision}`)}" aria-label="${esc(`${t(key)}: ${p.mappingId}`)}"${disabled(!writable)}>${esc(t(key))}</button>`).join('')
    return `<tr><td><code>${esc(p.mappingId)}</code></td>
      <td>${esc(code)}${title ? ` · ${esc(title)}` : ''}<div class="tiny muted">${esc(level)}</div></td>
      <td>${esc(axis)}${topic ? `<div class="tiny muted">${esc(topic.openalexId ?? '')} ${srcLink({ label: 'OpenAlex', url: topic.sourceUrl })}</div>` : ''}</td>
      <td class="small">${esc(reason)}</td>
      <td>${tag(kind, t(label))}${last}</td>
      <td><div class="row rd-decide">${buttons}</div></td></tr>`
  }).join('')
  return `<div class="card rd-sec" id="admMapCard">
    <h2>${esc(t('rdAdminMapTitle'))} ${tag('self', t('rdAdminMapTag'))}</h2>
    <p class="small muted">${esc(t('rdAdminMapNote'))}</p>
    <p class="tiny muted">${esc(t('rdMappingVersion'))}: <code>${esc(m.mappingVersion ?? DASH)}</code></p>
    <div class="field"><label for="admMapNote">${esc(t('rdNote'))}</label><textarea id="admMapNote" rows="2" maxlength="2000" required aria-required="true">${esc(ui(state).notes?.map ?? '')}</textarea></div>
    ${message(t, state, 'map', (m) => recalcMsg(t, m))}
    <div class="rd-scroll"><table><tr><th>${esc(t('rdColId'))}</th><th>${esc(t('rdColField'))}</th><th>${esc(t('rdColTopic'))}</th><th>${esc(t('rdColReason'))}</th><th>${esc(t('rdColStatus'))}</th><th>${esc(t('rdColDecide'))}</th></tr>${rows || `<tr><td colspan="6" class="muted">${esc(t('rdEvNone'))}</td></tr>`}</table></div>
  </div>`
}

// ---------- admin: break review ----------

// The DOSM listing titles of the quarter before and the flagged quarter, side by side (spec 6.2: evidence, not a cause).
function listingTitles(t, b) {
  const entries = (b.evidence?.listing ?? []).filter((e) => e && typeof e.quarter === 'string')
  if (!entries.length) return ''
  const cell = (e) => (e.status === 'listed' && typeof e.title === 'string'
    // D3: the title links to its real release page (from the archive page, via the server); srcLink escapes both.
    ? `${safeUrl(e.pageUrl) ? srcLink({ label: e.title, url: e.pageUrl }) : esc(e.title)}${e.publishedAt ? `<div class="tiny muted">${esc(t('rdBrkEvPublished', { date: e.publishedAt }))}</div>` : ''}`
    : `<span class="muted">${esc(t('rdBrkEvNotListed'))}</span>`)
  return `<li><b>${esc(t('rdBrkEvTitles'))}</b>
    <table class="rd-brk-titles small"><tr>${entries.map((e) => `<th scope="col">${esc(e.quarter)}</th>`).join('')}</tr>
    <tr>${entries.map((e) => `<td>${cell(e)}</td>`).join('')}</tr></table></li>`
}

function breakEvidence(t, b, data, reviews) {
  const items = []
  // Links built by the server (the source adapter's URL builders); the browser keeps no copy of the pattern.
  const release = b.releaseLinks ?? {}
  if (safeUrl(release.page)) items.push(`<li>${srcLink({ label: t('rdBrkEvRelease', { period: b.period }), url: release.page })}</li>`)
  if (safeUrl(release.listing)) items.push(`<li>${srcLink({ label: t('rdBrkEvListing', { period: b.period }), url: release.listing })}</li>`)
  const titles = listingTitles(t, b)
  if (titles) items.push(titles)
  const occ = data.public?.occ
  if (occ?.listingTitle) {
    const link = (occ.sourceLinks ?? []).find((l) => safeUrl(l?.url))
    items.push(`<li>${esc(t('rdBrkEvTitle', { title: occ.listingTitle }))} ${link ? srcLink({ label: 'DOSM', url: link.url }) : ''}</li>`)
  }
  for (const r of reviews) {
    const links = (r.evidence ?? []).map((url) => srcLink({ label: url, url })).filter(Boolean).join(' ')
    items.push(`<li class="tiny muted">${esc(fmtDate(r.reviewedAt))} · ${esc(t(`rdDecision_${r.decision}`))} · ${esc(r.reviewer ?? DASH)}: ${esc(r.note || DASH)} ${links}</li>`)
  }
  return `<ul class="rd-list small">${items.join('')}</ul>`
}

function breakCard(t, state, data) {
  const b = data.breaks ?? {}
  const writable = Boolean(b.writable)
  const reviews = b.reviews ?? []
  const c = RADAR_CONFIG.breaks
  const rows = (b.breaks ?? []).map((x, i) => {
    const mine = reviews.filter((r) => r.target === `dosm:${x.period}`).sort((p, q) => String(q.reviewedAt ?? '').localeCompare(String(p.reviewedAt ?? '')))
    const status = BREAK_KIND[x.status] ? x.status : 'unreviewed'
    const buttons = BREAK_DECISIONS.map(([decision, key]) => `<button class="btn sm" data-act="admBreak" data-arg="${i}|${decision}" aria-label="${esc(`${t(key)}: ${x.period}`)}"${disabled(!writable)}>${esc(t(key))}</button>`).join('')
    return `<tr><td><b>${esc(x.period)}</b><details class="tiny muted"><summary>${esc(t('rdObsHash'))}</summary><code>${esc(x.observationHash ?? DASH)}</code></details></td>
      <td class="num">${esc(fmtSignedPct(x.totalChangePercent, 1))}</td>
      <td class="num">${esc(`${fmtInt(x.groupsSameWay)}/${fmtInt(x.eligibleGroups)}`)}</td>
      <td>${breakEvidence(t, x, data, mine)}</td>
      <td>${tag(BREAK_KIND[status], t(`rdBreak_${status}`))}</td>
      <td><div class="row rd-decide">${buttons}</div></td></tr>`
  }).join('')
  return `<div class="card rd-sec" id="admBrkCard">
    <h2>${esc(t('rdAdminBreakTitle'))} ${tag('self', t('rdAdminBreakTag'))}</h2>
    <p class="small muted">${esc(t('rdAdminBreakNote', { totalPercent: fmt(c.totalPercent, 0), groupShare: fmt(c.groupShare * 100, 0), groupPercent: fmt(c.groupPercent, 0) }))}</p>
    <p class="tiny muted">${esc(t('rdSnapshot'))}: <code>${esc(b.snapshotId ?? DASH)}</code> · ${esc(t('rdManifestId'))}: <code>${esc(b.manifestId ?? DASH)}</code></p>
    <div class="grid g2">
      <div class="field"><label for="admBrkNote">${esc(t('rdNote'))}</label><textarea id="admBrkNote" rows="2" maxlength="2000" required aria-required="true">${esc(ui(state).notes?.brk ?? '')}</textarea></div>
      <div class="field"><label for="admBrkLink">${esc(t('rdEvidenceLink'))}</label><input type="url" id="admBrkLink" maxlength="500" autocomplete="off" value="${esc(ui(state).notes?.link ?? '')}"></div>
    </div>
    ${message(t, state, 'brk', (m) => recalcMsg(t, m))}
    <div class="rd-scroll"><table><tr><th>${esc(t('rdColQuarter'))}</th><th class="num">${esc(t('rdColTotalQoq'))}</th><th class="num">${esc(t('rdColGroupsSame'))}</th><th>${esc(t('rdEvidence'))}</th><th>${esc(t('rdColStatus'))}</th><th>${esc(t('rdColDecide'))}</th></tr>${rows || `<tr><td colspan="6" class="muted">${esc(t('rdEvNone'))}</td></tr>`}</table></div>
  </div>`
}

// ---------- admin: ingestion status and refresh ----------

const resultText = (t, outcome, code) => `${esc(outcome || DASH)}${code ? ` · <code>${esc(code)}</code> ${esc(errText(t, code))}` : ''}`

function statusCard(t, state, data) {
  const s = data.status ?? {}
  const p = data.public ?? {}
  const checks = Object.entries(s.lastChecks ?? {}).map(([source, c]) => `<tr><td>${esc(srcName(t, source))}</td><td>${esc(fmtDate(c?.checkedAt))}</td><td>${resultText(t, c?.outcome, c?.code)}</td><td>${esc(fmtDate(c?.lastOkAt))}</td></tr>`).join('')
  const log = (s.log ?? []).map((e) => `<tr><td>${esc(fmtDate(e.time))}</td><td>${esc(e.source ? srcName(t, e.source) : DASH)}</td><td>${esc(e.operation || DASH)}</td><td>${resultText(t, e.outcome, e.code)}${e.ids?.manifestId ? `<div class="tiny muted"><code>${esc(e.ids.manifestId)}</code></div>` : ''}</td></tr>`).join('')
  const orphans = s.orphans ?? []
  const blocked = s.orphansBlocked ? `<p class="small">${esc(errText(t, s.orphansBlocked))} <code>${esc(s.orphansBlocked)}</code></p>` : ''
  const orphanList = orphans.length ? `<ul class="rd-list tiny">${orphans.map((k) => `<li><code>${esc(k)}</code></li>`).join('')}</ul>` : `<p class="small muted">${esc(t('rdAdminNoOrphans'))}</p>`
  const head = (cols) => `<tr>${cols.map((k) => `<th>${esc(t(k))}</th>`).join('')}</tr>`
  return `<div class="card rd-sec" id="admStatusCard">
    <h2>${esc(t('rdAdminIngestTitle'))}</h2>
    ${message(t, state, 'status')}
    ${statusCards(p.states ?? {}, t, { sources: p.sources ?? [], manifestId: s.activeManifestId ?? p.manifestId ?? null, ai: p.ai ?? null, occ: p.occ ?? null })}
    <dl class="rd-kv small">
      <dt>${esc(t('rdManifestId'))}</dt><dd><code>${esc(s.activeManifestId ?? DASH)}</code></dd>
      <dt>${esc(t('rdAdminConflicts'))}</dt><dd>${esc(fmtInt((s.conflicts ?? []).length))}</dd>
      <dt>${esc(t('rdAdminOrphans'))}</dt><dd>${esc(fmtInt(orphans.length))} <button class="btn sm" data-act="admCleanup"${disabled(!s.writable || !orphans.length || Boolean(s.orphansBlocked))}>${esc(t('rdAdminCleanUp'))}</button>${blocked}${orphanList}</dd>
    </dl>
    <h3>${esc(t('rdAdminChecks'))}</h3>
    <div class="rd-scroll"><table>${head(['rdColSource', 'rdColTime', 'rdColResult', 'rdLastFetch'])}${checks || `<tr><td colspan="4" class="muted">${esc(t('rdEvNone'))}</td></tr>`}</table></div>
    <h3>${esc(t('rdAdminLog'))}</h3>
    <div class="rd-scroll"><table>${head(['rdColTime', 'rdColSource', 'rdColOperation', 'rdColResult'])}${log || `<tr><td colspan="4" class="muted">${esc(t('rdEvNone'))}</td></tr>`}</table></div>
    <p class="tiny muted">${esc(t('rdAdminLogNote'))}</p>
  </div>`
}

// One O*NET row: name, active release or window (with its fetched date), last check with its outcome code.
function onetRow(t, data, id, control) {
  const src = (data.public?.sources ?? []).find((s) => s.sourceId === id)
  const check = data.status?.lastChecks?.[id]
  const active = id === 'onet-skills' ? src?.version : src?.window?.label
  const activeLabel = id === 'onet-skills' ? 'rdAdminOnetActiveRelease' : 'rdAdminOnetActiveWindow'
  return `<div class="rd-onet-row" id="admRow-${esc(id)}">
    <h3>${esc(t(id === 'onet-skills' ? 'rdAdminOnetSkillsRow' : 'rdAdminOnetHotRow'))}</h3>
    <dl class="rd-kv tiny">
      <dt>${esc(t(activeLabel))}</dt><dd>${esc(active ?? DASH)}${src?.fetchedAt ? ` · ${esc(t('rdEvFetched'))} ${esc(fmtDate(src.fetchedAt))}` : ''}</dd>
      <dt>${esc(t('rdAdminOnetLastCheck'))}</dt><dd>${check ? `${esc(fmtDate(check.checkedAt))} · ${resultText(t, check.outcome, check.code)}` : esc(t('rdHealth_never_run'))}</dd>
    </dl>
    <div class="row">${control}</div>
  </div>`
}

function refreshCard(t, state, data) {
  const writable = Boolean(data.status?.writable)
  const refreshMsg = (m) => {
    const source = m.source ? srcName(t, m.source) : DASH
    if (m.kind === 'bad') return `${esc(t('rdRefreshFailed', { source }))} <code>${esc(m.code)}</code> ${esc(errText(t, m.code))}`
    const r = m.result ?? {}
    if (r.outcome === 'published') return esc(t('rdRefreshPublished', { source, manifest: r.manifestId ?? DASH }))
    return esc(t('rdRefreshNoChange', { source }))
  }
  return `<div class="card rd-sec" id="admRefreshCard">
    <h2>${esc(t('rdAdminRefreshTitle'))}</h2>
    <p class="small muted">${esc(t('rdAdminRefreshNote'))}</p>
    <div class="row"><button class="btn" data-act="admRefresh" data-arg="openalex"${disabled(!writable)}>${esc(t('rdAdminRefreshOpenAlex'))}</button><button class="btn" data-act="admRefresh" data-arg="dosm"${disabled(!writable)}>${esc(t('rdAdminRefreshDosm'))}</button></div>
    ${onetRow(t, data, 'onet-skills', `<label class="small" for="admOnetRelease">${esc(t('rdAdminOnetReleaseLabel'))}</label>
      <input id="admOnetRelease" type="text" inputmode="decimal" autocomplete="off" maxlength="4" size="5" pattern="${RELEASE_PATTERN}" placeholder="31.1" aria-describedby="admOnetReleaseHint"${disabled(!writable)}>
      <button class="btn" data-act="admRefreshOnetSkills"${disabled(!writable)}>${esc(t('rdAdminOnetRefresh'))}</button>
      <span class="tiny muted" id="admOnetReleaseHint">${esc(t('rdAdminOnetReleaseHint'))}</span>`)}
    ${onetRow(t, data, 'onet-hottech', `<button class="btn" data-act="admRefresh" data-arg="onet-hottech"${disabled(!writable)}>${esc(t('rdAdminOnetRefresh'))}</button>`)}
    ${message(t, state, 'refresh', refreshMsg)}
  </div>`
}

function historyCard(t, data) {
  const all = [...(data.mappings?.reviews ?? []), ...(data.breaks?.reviews ?? [])]
    .sort((a, b) => String(b.reviewedAt ?? '').localeCompare(String(a.reviewedAt ?? '')))
  const rows = all.map((r) => `<tr><td>${esc(fmtDate(r.reviewedAt))}</td><td>${esc(r.reviewer ?? DASH)}</td><td><code>${esc(r.target ?? DASH)}</code></td><td>${esc(t(`rdDecision_${r.decision}`) === `rdDecision_${r.decision}` ? String(r.decision ?? DASH) : t(`rdDecision_${r.decision}`))}</td><td class="small">${esc(r.note || DASH)}</td></tr>`).join('')
  return `<div class="card rd-sec"><h2>${esc(t('rdAdminHistoryTitle'))}</h2>
    <div class="rd-scroll"><table><tr><th>${esc(t('rdColWhen'))}</th><th>${esc(t('rdColReviewer'))}</th><th>${esc(t('rdColItem'))}</th><th>${esc(t('rdColDecision'))}</th><th>${esc(t('rdColNote'))}</th></tr>${rows || `<tr><td colspan="5" class="muted">${esc(t('rdNoHistory'))}</td></tr>`}</table></div>
  </div>`
}

function exportCard(t, state) {
  const out = ui(state).exported
  if (!out) return ''
  return `<div class="card rd-sec" id="admExportCard"><h2>${esc(t('rdAdminExport'))}</h2>
    <p class="small muted">${esc(t('rdExportNote'))}</p>
    <pre class="rd-pre" tabindex="0" id="admExportJson">${esc(JSON.stringify(out, null, 2))}</pre>
    <button class="btn sm" data-act="admExportClose">${esc(t('rdEvClose'))}</button></div>`
}

export function adminView({ t, state, data }) {
  const u = ui(state)
  const head = `<h1 id="admTop" tabindex="-1">${esc(t('rdAdminTitle'))}</h1><p class="lead">${esc(t('rdAdminLead'))}</p>`
  const dev = devBanner(t, Boolean(data?.status?.devStore || data?.public?.devStore || u.devStore))
  if (!signedIn(state, 'admin')) return `<div class="rd rd-admin">${head}${dev}${signInCard(t, state, 'admin')}</div>`
  const session = `<div class="row rd-session">${tag('calc', t('rdAdminSignedIn', { minutes: minutesLeft(u.session?.expiresAt, nowOf(data)) }))}
    <button class="btn sm" data-act="admSignOut">${esc(t('rdAdminSignOut'))}</button>
    <button class="btn sm" data-act="admExport">${esc(t('rdAdminExport'))}</button>
    <button class="btn sm" data-act="admReload">${esc(t('rdReload'))}</button></div>`
  if (!data || u.loading) {
    return `<div class="rd rd-admin">${head}${dev}${session}${message(t, state, 'status')}<p class="muted"><span class="spin"></span> ${esc(t('rdLoading'))}</p></div>`
  }
  const readOnly = data.status && !data.status.writable ? `<div class="banner b-info"><div>${esc(t('rdAdminReadOnly'))}</div></div>` : ''
  return `<div class="rd rd-admin">${head}${dev}${readOnly}${session}
    ${exportCard(t, state)}
    ${mappingCard(t, state, data)}
    ${breakCard(t, state, data)}
    ${statusCard(t, state, data)}
    ${refreshCard(t, state, data)}
    ${historyCard(t, data)}</div>`
}

// ---------- judge ----------

const groupCode = (entityId) => (String(entityId ?? '').startsWith(GROUP_PREFIX) ? String(entityId).slice(GROUP_PREFIX.length) : null)

// Scenario A: the cells the judge changed, as edits. entries = [[`<group code>|<period>`, raw text], ...]. Blank or
// unchanged cells are left out; text that is not a number is sent as NaN so validation refuses it with a reason.
export function judgeEdits(report, entries) {
  const table = report?.current?.dosm
  if (!table) return []
  const edits = []
  for (const [cell, raw] of entries ?? []) {
    const bar = String(cell).indexOf('|')
    const code = String(cell).slice(0, bar)
    const period = String(cell).slice(bar + 1)
    const i = (table.periods ?? []).indexOf(period)
    if (bar < 0 || i < 0 || !table.groups?.[code]) continue
    const text = String(raw ?? '').trim()
    if (text === '') continue
    const value = Number(text)
    if (value === table.groups[code].values?.[i]) continue
    edits.push({ entityId: `${GROUP_PREFIX}${code}`, period, value: Number.isFinite(value) ? value : Number.NaN })
  }
  return edits
}

function scenarioControls(t, state, report) {
  const scen = ['B', 'C'].includes(ui(state).scen) ? ui(state).scen : 'A'
  const table = report.current?.dosm ?? {}
  const periods = (table.periods ?? []).slice(-GRID_QUARTERS)
  const offset = (table.periods ?? []).length - periods.length
  const seg = `<span class="seg" role="group" aria-label="${esc(t('rdJudgeScenario'))}">${[['A', 'rdScenA'], ['B', 'rdScenB'], ['C', 'rdScenC']].map(([id, key]) => `<button id="demoScen${id}" class="${scen === id ? 'on' : ''}" data-act="admScen" data-arg="${id}" aria-pressed="${scen === id}">${esc(t(key))}</button>`).join('')}</span>`
  let body
  if (scen === 'A') {
    const codes = Object.keys(table.groups ?? {}).sort()
    const rows = codes.map((code) => {
      const g = table.groups[code]
      const cells = periods.map((period, j) => {
        const v = g.values?.[offset + j]
        return `<td><input class="rd-cell" type="number" min="0" step="1" inputmode="numeric" data-demo-cell="${esc(`${code}|${period}`)}" value="${finite(v) === null ? '' : esc(String(v))}" aria-label="${esc(`${code} · ${g.name}, ${period}`)}"></td>`
      }).join('')
      return `<tr><th scope="row" class="small">${esc(`${code} · ${g.name}`)}</th>${cells}</tr>`
    }).join('')
    const total = `<tr><th scope="row" class="small">${esc(t('rdTotalAds'))}</th>${periods.map((_, j) => `<td class="num small">${esc(fmtInt(table.total?.[offset + j]))}</td>`).join('')}</tr>`
    body = `<p class="small muted">${esc(t('rdJudgeEditNote'))}</p>
      <div class="rd-scroll"><table class="rd-grid"><tr><th>${esc(t('rdGroupCol'))}</th>${periods.map((p) => `<th>${esc(p)}</th>`).join('')}</tr>${rows}${total}</table></div>`
  } else if (scen === 'C') {
    const c = report.scenarios?.C ?? {}
    body = `<p class="small muted">${esc(t('rdJudgeCNote', { skill: c.example ?? DASH, job: c.code ?? DASH }))}</p>
      <p class="tiny muted">${esc(t('rdSkLabelUs'))} · ${esc(t('rdSkLabelSoftware'))}</p>`
  } else {
    const b = report.scenarios?.B ?? {}
    const factor = finite(b.defaultFactor) === null ? '' : String(b.defaultFactor)
    body = `<div class="field"><label for="demoFactor">${esc(t('rdJudgeFactor'))}</label><input type="number" id="demoFactor" min="0" step="0.1" inputmode="decimal" value="${esc(factor)}"></div>
      <p class="small muted">${esc(t('rdJudgeBNote', { period: b.period ?? DASH, groups: (b.groups ?? []).join(', ') || DASH }))}</p>`
  }
  return `<div class="card rd-sec" id="demoControls">
    <div class="row rd-controls">${seg}</div>
    <p class="tiny muted">${esc(t('rdJudgeManifest'))}: <code>${esc(report.manifests?.after ?? DASH)}</code></p>
    ${body}
    <div class="row" style="margin-top:12px"><button class="btn pri" data-act="demoApply" data-arg="${scen}">${esc(t('rdJudgeApply'))}</button><button class="btn" data-act="demoReset">${esc(t('rdJudgeReset'))}</button></div>
  </div>`
}

function entityName(t, report, entityId) {
  const code = groupCode(entityId)
  if (code === 'total') return t('rdTotalAds')
  const g = code ? report.current?.dosm?.groups?.[code] : null
  return g ? `${code} · ${g.name}` : String(entityId ?? DASH)
}

// One side (before or after) of a changed classification: status, latest share and change, rule text (R16).
function sideOf(t, d) {
  if (!d) return `<span class="muted">${esc(DASH)}</span>`
  const ice = d.evidenceSufficiency === 'insufficient_comparable_evidence'
  const parts = [statusTag(d, t)]
  if (d.recent?.period) parts.push(`<div class="small">${esc(d.recent.period)}: ${esc(d.change?.unit === 'pp' ? fmtPct(d.recent.value) : fmtInt(d.recent.value))}</div>`)
  if (!ice && d.evidenceSufficiency === 'sufficient' && finite(d.change?.value) !== null) {
    const change = d.change.unit === 'pp' ? `${fmtSigned(d.change.value, 2)} pp` : `${fmtSigned(d.change.value, 2)} log2`
    parts.push(`<div class="small">${esc(t('rdEvChange'))}: ${esc(change)}${finite(d.change.relativePercent) !== null ? ` (${esc(fmtSignedPct(d.change.relativePercent, 1))})` : ''}</div>`)
  }
  const rule = ruleText(d.rule, t)
  if (rule) parts.push(`<div class="tiny">${esc(rule)}</div>`)
  return parts.join('')
}

function changeNames(t, changes) {
  return (changes ?? []).map((c) => {
    const key = `rdChange_${c}`
    return t(key) === key ? String(c) : t(key)
  }).join(', ')
}

// A skill signal states what its data is and links its source (US job ads, software only).
function skillNote(t, e) {
  if (e?.system !== 'O*NET Software Skills') return ''
  const link = e.sourceUrl ? ` · <a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">${esc(e.sourceUrl)}</a>` : ''
  return `<div class="tiny muted">${esc(t('rdSkLabelUs'))} · ${esc(t('rdSkLabelSoftware'))}${link}</div>`
}

function reportCard(t, report) {
  const names = new Map((report.signals ?? []).map((s) => [s.signalId, s.entity]))
  const label = (signalId) => {
    const e = names.get(signalId)
    if (String(signalId).startsWith('onet:indemand:') && e) return `${e.name} · ${String(signalId).split(':')[2]}`
    return e ? `${e.code} · ${e.name}` : String(signalId ?? DASH)
  }
  const nothing = !(report.observations ?? []).length && !(report.changedSignals ?? []).length
  const ids = `<table class="small"><tr><th></th><th>${esc(t('rdJudgeBefore'))}</th><th>${esc(t('rdJudgeAfter'))}</th></tr>
    <tr><th scope="row">${esc(t('rdJudgeManifest'))}</th><td><code>${esc(report.manifests?.before ?? DASH)}</code></td><td><code>${esc(report.manifests?.after ?? DASH)}</code></td></tr>
    ${['dosm', 'openalex', 'onet-skills'].filter((s) => s !== 'onet-skills' || report.snapshots?.after?.[s]).map((s) => `<tr><th scope="row">${esc(t('rdSnapshot'))} ${esc(srcName(t, s))}</th><td><code>${esc(report.snapshots?.before?.[s] ?? DASH)}</code></td><td><code>${esc(report.snapshots?.after?.[s] ?? DASH)}</code></td></tr>`).join('')}</table>`

  const obs = (report.observations ?? []).map((o) => `<li>${esc(entityName(t, report, o.entityId))} · ${esc(o.period)}: <span class="rd-num">${esc(fmtInt(o.old))} → ${esc(fmtInt(o.new))}</span></li>`).join('')
  const signals = (report.changedSignals ?? []).map((c) => `<tr><td><b>${esc(label(c.signalId))}</b><div class="tiny muted">${esc(changeNames(t, c.changes))}</div>${skillNote(t, names.get(c.signalId))}</td><td>${sideOf(t, c.details?.before)}</td><td>${sideOf(t, c.details?.after)}</td></tr>`).join('')
  const momentum = Object.entries(report.momentum ?? {}).map(([axisId, m]) => `<li>${esc(t(`rdAxis_${axisId}`) === `rdAxis_${axisId}` ? axisId : t(`rdAxis_${axisId}`))}: ${esc(fmt(m?.before?.current?.value, 1))} → ${esc(fmt(m?.after?.current?.value, 1))}</li>`).join('')
  const added = (report.breaks?.added ?? []).map((b) => `<li>${tag('bad', t('rdJudgePossibleBreak'))} <b>${esc(b.period)}</b> · ${esc(t('rdColTotalQoq'))} ${esc(fmtSignedPct(b.totalChangePercent, 1))} · ${esc(t('rdColGroupsSame'))} ${esc(`${fmtInt(b.groupsSameWay)}/${fmtInt(b.eligibleGroups)}`)}</li>`).join('')
  const ice = (report.insufficientComparisons ?? []).map((c) => `<li><b>${esc(`${c.entity?.code ?? ''} · ${c.entity?.name ?? ''}`)}</b> ${tag('bad', t('rdIce'))}<div class="tiny">${esc(ruleText(c.after?.rule, t) || (c.breakPeriods ?? []).join(', '))}</div></li>`).join('')

  const a = report.affected ?? {}
  const groups = (a.groups ?? []).map((g) => `<li>${esc(`${g.code} · ${g.name}`)}</li>`).join('')
  const jobs = (a.occupations ?? []).map((o) => `<li>${esc(`${o.name ?? ''} · ${o.system === 'emasco' ? 'eMASCO' : String(o.system ?? '')} ${o.code ?? ''}`)}</li>`).join('')
  const fields = (a.fields ?? []).map((f) => `<li>${esc(`${f.iscedCode ?? f.code ?? ''} · ${f.axisId ? t(`rdAxis_${f.axisId}`) : ''} · ${f.mappingId ?? ''}`)}</li>`).join('')
  const none = `<p class="small muted">${esc(t('rdEvNone'))}</p>`
  const list = (html) => (html ? `<ul class="rd-list small">${html}</ul>` : none)

  return `<div class="card rd-sec" id="demoReport" tabindex="-1">
    <h2>${esc(t('rdJudgeDiff'))} ${tag('self', t('rdTagSynthetic'))}</h2>
    ${nothing ? `<p class="small">${esc(t('rdJudgeNoChange'))}</p>` : ''}
    <div class="rd-scroll">${ids}</div>
    <h3>${esc(t('rdJudgeObs'))}</h3>${list(obs)}
    <h3>${esc(t('rdJudgeSignals'))}</h3>
    ${signals ? `<div class="rd-scroll"><table><tr><th>${esc(t('rdGroupCol'))}</th><th>${esc(t('rdJudgeBefore'))}</th><th>${esc(t('rdJudgeAfter'))}</th></tr>${signals}</table></div>` : none}
    ${momentum ? `<h3>${esc(t('rdMomentum'))}</h3><ul class="rd-list small">${momentum}</ul>` : ''}
    <h3>${esc(t('rdJudgeBreaksAdded'))}</h3>${list(added)}
    <h3>${esc(t('rdJudgeInsufficient'))}</h3>${list(ice)}
    <h3>${esc(t('rdJudgeAffected'))}</h3>
    <div class="grid g2">
      <div class="rd-mini"><b>${esc(t('rdJudgeGroups'))}</b>${list(groups)}</div>
      <div class="rd-mini"><b>${esc(t('rdJudgeJobs'))}</b>${jobs ? `<details><summary class="small">${esc(t('rdJudgeJobsCount', { count: fmtInt((a.occupations ?? []).length) }))}</summary><ul class="rd-list small">${jobs}</ul></details>` : none}</div>
      <div class="rd-mini"><b>${esc(t('rdJudgeFields'))}</b>${list(fields)}</div>
      <div class="rd-mini"><b>${esc(t('rdJudgeSkillsTitle'))}</b><p class="small">${esc(t('rdJudgeSkills'))}</p></div>
    </div>
    <p class="small" style="margin-top:12px">${esc(t('rdJudgeProd'))}</p>
    <p class="small"><b>${esc(t('rdNoRankings'))}</b></p>
  </div>`
}

export function judgeView({ t, state, data }) {
  const u = ui(state)
  const report = data?.report ?? null
  const head = `<h1 id="admTop" tabindex="-1">${esc(t('rdJudgeTitle'))}</h1><p>${tag('self', t('rdJudgeTag'))}</p>`
  const dev = devBanner(t, Boolean(report?.devStore || u.devStore))
  if (!signedIn(state, 'demo')) return `<div class="rd rd-judge">${head}${dev}${signInCard(t, state, 'demo')}</div>`
  const session = `<div class="row rd-session">${tag('calc', t('rdJudgeExpires', { minutes: minutesLeft(report?.expiresAt ?? u.session?.expiresAt, nowOf(data)) }))}
    <button class="btn sm" data-act="admSignOut">${esc(t('rdAdminSignOut'))}</button></div>`
  const judgeMsg = (m) => {
    if (m.kind !== 'bad' || m.code !== 'validation_failed') return null
    const errors = (m.errors ?? []).map((e) => `<li><code>${esc(e.code)}</code> ${esc(e.path ?? '')}${e.sourceId ? ` · ${esc(e.sourceId)}` : ''}</li>`).join('')
    return `${esc(errText(t, m.code))} <code>${esc(m.code)}</code> ${esc(t('rdJudgeKept'))}${errors ? `<ul class="rd-list tiny">${errors}</ul>` : ''}`
  }
  if (!report || u.loading) {
    return `<div class="rd rd-judge">${head}${dev}${session}${message(t, state, 'judge', judgeMsg)}${u.loading || !u.msgs?.judge ? `<p class="muted"><span class="spin"></span> ${esc(t('rdLoading'))}</p>` : ''}</div>`
  }
  return `<div class="rd rd-judge">${head}${dev}${session}
    <p class="small">${esc(t('rdJudgeSynthetic'))}</p>
    ${message(t, state, 'judge', judgeMsg)}
    <div class="grid g2 rd-judge-grid">${scenarioControls(t, state, report)}${reportCard(t, report)}</div></div>`
}
