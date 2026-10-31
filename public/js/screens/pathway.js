// Study pathway screen (#pathway), as in the owner-approved mockup docs/mockup-pathway.html (spec §8).
// One tab per saved target role (added from #match with "Plan my study pathway"), the role header with its Skill Match
// and progress counts, Part 1 "Study route" and Part 2 "Skills to build" (public/js/screens/pathwayParts.js), then a
// sources table. Answers come from POST /api/pathway (public/js/pathwayApi.js) and are never saved; the guest store
// keeps only the targets, the active one and the progress (pathwayToSave). Progress is per O*NET item key, shared by
// every target and self-reported: it never changes the Skill Match.
import { esc } from '../ui.js'
import { day } from './match.js'
import { ext, partOne, partTwo } from './pathwayParts.js'

const arr = (v) => (Array.isArray(v) ? v : [])
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
// A pathway answer (it has the role code), or null while it loads or after a failure.
const loaded = (a) => (plainObject(a) && typeof a.code === 'string' ? a : null)

// Only the targets, the active one and the progress are kept with the guest profile; the answers are fetched again.
export function pathwayToSave(p) {
  const targets = arr(p?.targets).filter((x) => plainObject(x) && typeof x.code === 'string').map((x) => ({ code: x.code, title: String(x.title ?? ''), addedAt: x.addedAt ?? null }))
  return { targets, active: typeof p?.active === 'string' ? p.active : null, progress: plainObject(p?.progress) ? p.progress : {} }
}

// The active target: the saved one when it is still a target, else the first target, else null.
export const activeOf = (p) => {
  const targets = arr(p?.targets)
  return targets.find((x) => x.code === p?.active)?.code ?? targets[0]?.code ?? null
}

// "N to build · S started · D done" over the gaps of an answer, from the shared progress.
function counts(t, a, progress) {
  const gaps = arr(a?.steps?.gaps)
  const of = (state) => gaps.filter((g) => progress?.[g.key]?.state === state).length
  return t('pwCounts', { build: gaps.length, started: of('started'), done: of('done') })
}
const matchText = (t, a) => (isNum(a?.skillMatch) ? t('pwTabMatch', { percent: a.skillMatch }) : t('pwTabNoMatch'))

function targetTabs(t, p, active) {
  const tabs = arr(p.targets).map((x) => {
    const a = loaded(p.answers?.[x.code])
    const bits = [`MASCO ${x.code}`, ...(a ? [matchText(t, a), ...(a.steps ? [counts(t, a, p.progress)] : [])] : [])].join(' · ')
    return `<div class="pw-tgt${x.code === active ? ' on' : ''}"><button type="button" data-act="pwTab" data-arg="${esc(x.code)}" aria-pressed="${x.code === active}">${esc(a?.title ?? x.title)}<small>${esc(bits)}</small></button><button class="pw-rm" type="button" data-act="pwRemove" data-arg="${esc(x.code)}" aria-label="${esc(t('pwRemoveLabel', { title: a?.title ?? x.title }))}">${esc(t('pwRemove'))}</button></div>`
  })
  return `<div class="pw-targets">${tabs.join('')}</div>`
}

const onetItems = (profile) => arr(profile?.skills).filter((s) => /^onet:(el|kn):/.test(s?.canonicalId ?? ''))
const plain = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.value === 'string' ? v.value : '')
function profileLine(t, profile) {
  const records = arr(profile?.education?.records)
  const field = records.map((r) => r?.field).find((f) => f?.code)
  const items = onetItems(profile)
  const bits = [plain(records[0]?.qualification), field ? t('mtFieldCode', { title: field.title ?? '', code: field.code }) : '', t('pwProfileSkills', { count: items.length, na: items.filter((s) => !s.proficiency).length })].filter(Boolean)
  return `<div class="pw-src pw-profile">${esc(t('pwProfileUsed'))} <b>${esc(bits.join(' · '))}</b> · ${esc(t('pwNeverStored'))}</div>`
}

function roleHeader(t, a, progress) {
  const page = ext(a.qualification?.url, t('mtEmascoPage'))
  const job = a.onet ? ` · ${esc(t('pwComparedWith'))} <b>${esc(a.onet.title)}</b> (${esc(a.onet.code)}), ${esc(t('pwComparedTail'))}` : ''
  const pct = isNum(a.skillMatch) ? `${esc(a.skillMatch)}%` : esc(t('mtNotAvailable'))
  return `<div class="card pw-head">
    <div class="pw-headmain"><h3 class="pw-title">${esc(a.title)}</h3><span class="tiny muted">MASCO ${esc(a.code)}${a.qualification?.url ? ` · ${page}` : ''}${job}</span></div>
    <div class="pw-headside"><div class="tiny muted">${esc(t('pwSkillMatchNow'))}</div><div class="pw-pct">${pct}</div>${a.steps ? `<div class="tiny muted">${esc(counts(t, a, progress))}</div>` : ''}</div>
  </div>`
}

const SRC_WHAT = { onet: 'pwSrc_onet', bridge: 'pwSrc_bridge', 'emasco-qualification': 'pwSrc_emasco', 'isced-cip': 'pwSrc_fields', 'cip-onet': 'pwSrc_fields', 'pathway-picks': 'pwSrc_picks' }
function sourcesTable(t, sources) {
  const rows = arr(sources).map((s) => {
    const id = String(s.id ?? '')
    const what = SRC_WHAT[id] ? t(SRC_WHAT[id]) : id.startsWith('site:') ? t('pwSrc_site') : id
    const name = id === 'pathway-picks' ? t('pwSrcPicksName') : s.name ?? id
    const licence = s.licence ?? (id === 'pathway-picks' || id.startsWith('site:') ? t('pwLinksOnly') : '—')
    return `<tr><td>${esc(what)}</td><td>${ext(s.url, name)}</td><td>${esc(s.date ? day(s.date) : '—')}</td><td>${esc(licence)}</td></tr>`
  }).join('')
  return `<div class="card pw-sources"><h3>${esc(t('pwSourcesTitle'))}</h3><div class="mt-tw"><table class="small">
    <thead><tr><th>${esc(t('pwColWhat'))}</th><th>${esc(t('pwColSource'))}</th><th>${esc(t('pwColDate'))}</th><th>${esc(t('pwColLicence'))}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function answerView(t, p, code) {
  const raw = p.answers?.[code]
  const a = loaded(raw)
  if (!a) {
    if (raw?.error === 'not_found') {
      return `<div class="card pw-card"><p>${esc(t('pwNotFound'))}</p><div class="mt-actions"><button class="btn sm" type="button" data-act="pwRemove" data-arg="${esc(code)}">${esc(t('pwRemove'))}</button></div></div>`
    }
    if (raw?.error) {
      return `<div class="banner b-bad"><div>${esc(t('pwError'))}</div><button class="btn sm" type="button" data-act="pwTab" data-arg="${esc(code)}">${esc(t('pwRetry'))}</button></div>`
    }
    return `<p class="muted"><span class="spin"></span> ${esc(t('pwLoading'))}</p>`
  }
  const broken = a.reason === 'chain_broken'
  const na = arr(a.steps?.notAssessed).length
  const prov = a.provisional && na
    ? `<div class="mt-note warn pw-prov"><b>${esc(t('pwProvTitle'))}</b> ${esc(t('pwProvText', { count: na }))} <button class="btn ghost sm pw-link" type="button" data-act="editSkills">${esc(t('pwSetLevels'))}</button></div>`
    : ''
  return `${roleHeader(t, a, p.progress)}${prov}${partOne(t, a, broken)}${broken ? '' : partTwo(t, a, p.progress)}${sourcesTable(t, a.sources)}`
}

export function pathwayScreen({ t, state }) {
  const p = { targets: [], progress: {}, answers: {}, ...(plainObject(state?.pathway) ? state.pathway : {}) }
  const head = `<h1>${esc(t('pathway'))}</h1><p class="lead">${esc(t('pwLead'))}</p>`
  if (!state?.profile) {
    return `<div class="pw">${head}<div class="card"><h3>${esc(t('mtNoProfile'))}</h3>
      <div class="mt-actions"><button class="btn pri" type="button" data-go="source">${esc(t('mtBuildProfile'))}</button></div></div></div>`
  }
  if (!arr(p.targets).length) {
    return `<div class="pw">${head}<div class="card"><p class="small">${esc(t('pwNoTarget'))}</p>
      <div class="mt-actions"><button class="btn pri" type="button" data-go="match">${esc(t('pwGoMatch'))}</button></div></div></div>`
  }
  const active = activeOf(p)
  return `<div class="pw">${head}
    <div class="tiny muted">${esc(t('pwYourRoles'))}</div>
    ${targetTabs(t, p, active)}
    ${profileLine(t, state.profile)}
    ${answerView(t, p, active)}
  </div>`
}

export default ({ t, state }) => pathwayScreen({ t, state })
