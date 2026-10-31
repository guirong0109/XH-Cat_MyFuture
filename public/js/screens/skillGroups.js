// Skills and proficiency, grouped (owner, 31 Oct): each job and project is a card with the skills used in it; skills
// not used in any job or project are under Others. A skill keeps its links in usedIn ({ kind, title }), matched to the
// job title or project title, so a CV merged into a profile keeps them. The user checks a whole card ("Looks right")
// instead of each skill. A skill used in a job or project starts at Good, marked "From your projects" (owner, 31 Oct);
// levels are changed in a card's Edit view. Other skills are folded so the page is not one long list.
import { esc, tag } from '../ui.js'
import { levelFromUse, makeSkill } from '/shared/profileSchema.js'
import { reviewToggle } from '../components/fields.js'
import { pickerList, searchPicker } from '../components/searchPicker.js'
import { fieldSuggestions } from '../components/fieldSuggestions.js'

const CV_SOURCES = new Set(['cv_rules', 'cv_semantic', 'cv_ai'])
const norm = (text) => String(text ?? '').trim().toLowerCase()
const same = (a, b) => a.kind === b.kind && norm(a.title) === norm(b.title)
const numbered = (profile) => profile.skills.map((skill, i) => ({ skill, i }))

// The cards in order: jobs, projects, then Others. A link to a job or project that is not there any more counts as
// no link, so the skill shows under Others rather than disappearing.
export function groupsOf(profile) {
  const jobs = profile.employment.records.map((record, index) => ({ kind: 'job', index, key: `job|${index}`, title: record.jobTitle ?? '', record }))
  const projects = (profile.projects ?? []).map((record, index) => ({ kind: 'project', index, key: `project|${index}`, title: record.title ?? '', record }))
  const placed = [...jobs, ...projects].map((group) => ({ ...group, skills: numbered(profile).filter(({ skill }) => (skill.usedIn ?? []).some((p) => same(p, group))) }))
  const linked = new Set(placed.flatMap((group) => group.skills.map(({ i }) => i)))
  const other = { kind: 'other', index: null, key: 'other', title: '', record: null, skills: numbered(profile).filter(({ i }) => !linked.has(i)) }
  return [...placed, other].map((group) => ({
    ...group,
    fromCv: Boolean(group.record?.extraction) || group.skills.some(({ skill }) => CV_SOURCES.has(skill.source)),
    needsCheck: Boolean(group.record?.extraction && !group.record.userConfirmed) || group.skills.some(({ skill }) => CV_SOURCES.has(skill.source) && !skill.userConfirmed),
  }))
}

// The job or project a card stands for ({ kind, title }); null for Others.
export function placeOf(profile, key) {
  const group = groupsOf(profile).find((g) => g.key === key)
  return group && group.kind !== 'other' ? { kind: group.kind, title: group.title } : null
}

// "Looks right": the job or project and every skill in its card are confirmed.
export function confirmGroup(profile, key) {
  const group = groupsOf(profile).find((g) => g.key === key)
  if (!group) return profile
  const ids = new Set(group.skills.map(({ i }) => i))
  const out = { ...profile, skills: profile.skills.map((skill, i) => (ids.has(i) ? { ...skill, userConfirmed: true } : skill)) }
  const ok = (records) => records.map((record, i) => (i === group.index ? { ...record, userConfirmed: true } : record))
  if (group.kind === 'job') out.employment = { ...profile.employment, records: ok(profile.employment.records) }
  if (group.kind === 'project') out.projects = ok(profile.projects)
  return out
}

// A skill taken out of a card loses that link; one used nowhere else is removed.
export function unlinkSkill(profile, index, place) {
  const skills = profile.skills.flatMap((skill, i) => {
    if (i !== index) return [skill]
    const usedIn = (skill.usedIn ?? []).filter((p) => !same(p, place))
    return usedIn.length ? [{ ...skill, usedIn }] : []
  })
  return { ...profile, skills }
}

// A skill added to a card (place) or to Others (null). A skill already in the list gets the link, not a second entry.
export function linkSkill(profile, found, place) {
  const key = norm(found.canonicalId ?? found.name)
  const at = profile.skills.findIndex((skill) => norm(skill.canonicalId ?? skill.name) === key)
  if (at >= 0) {
    if (!place || (profile.skills[at].usedIn ?? []).some((p) => same(p, place))) return profile
    return { ...profile, skills: profile.skills.map((skill, i) => (i === at ? levelFromUse({ ...skill, usedIn: [...(skill.usedIn ?? []), place] }) : skill)) }
  }
  const skill = levelFromUse({ ...makeSkill({ ...found, source: 'user_input', usedIn: place ? [place] : [] }), ...(found.candidates?.length ? { candidates: found.candidates } : {}) })
  return { ...profile, skills: [...profile.skills, skill] }
}

// A job or project renamed keeps its skills; one removed sends them to Others.
export function renamePlace(profile, kind, before, after) {
  const from = { kind, title: before }
  return { ...profile, skills: profile.skills.map((skill) => (!(skill.usedIn ?? []).some((p) => same(p, from)) ? skill : { ...skill, usedIn: skill.usedIn.map((p) => (same(p, from) ? { kind, title: after } : p)) })) }
}
export function unlinkPlace(profile, kind, title) {
  const gone = { kind, title }
  return { ...profile, skills: profile.skills.map((skill) => (!(skill.usedIn ?? []).some((p) => same(p, gone)) ? skill : levelFromUse({ ...skill, usedIn: skill.usedIn.filter((p) => !same(p, gone)) }))) }
}

const LEVEL_OPTIONS = [['', 'levelNone'], ['basic', 'basic'], ['good', 'good'], ['expert', 'expert']]
// Skill level (owner, 31 Oct): a toggle bar; one press picks the level. "Not assessed yet" is on until one is chosen.
function levelBar(t, skill, i) {
  return `<div class="toggle" role="radiogroup" aria-label="${esc(t('level'))}">${LEVEL_OPTIONS.map(([value, key]) => {
    const on = (skill.proficiency ?? '') === value
    return `<button class="${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="level" data-arg="${i}|${value}">${esc(t(key))}</button>`
  }).join('')}</div>`
}

function picker({ t, state }, key, label) {
  const pick = state.pick?.[key]
  return searchPicker({ t, kind: 'skill', key, label, placeholder: t('skillAdd'), value: pick?.term ?? '', list: pick ? pickerList({ t, kind: 'skill', key, term: pick.term, result: pick.result, busy: pick.busy }) : '' })
}

// A skill chip: ✓ for a skill in the O*NET list (with the CV's own words when they differ), ? for one that is not.
function chip(t, skill) {
  const ai = skill.source === 'cv_ai' ? ` <small class="ai-tag">${esc(t('tagFromAi'))}</small>` : ''
  if (!skill.canonicalId) return `<span class="sk unk" title="${esc(t('skillUnknown'))}">? ${esc(skill.name)} <small>${esc(t('notInList'))}</small>${ai}</span>`
  const different = skill.originalText && norm(skill.originalText) !== norm(skill.name)
  const written = different && skill.match === 'short_form' ? '' : different ? ` <small>${esc(t('fromText', { text: skill.originalText }))}</small>` : ''
  if (different && skill.match === 'short_form') return `<span class="sk ok">✓ ${esc(skill.originalText)} → ${esc(skill.name)} (O*NET)${skill.proficiency ? ` <em>${esc(t(skill.proficiency))}</em>` : ''}${ai}</span>`
  const level = skill.proficiency ? ` <em>${esc(t(skill.proficiency))}</em>` : ''
  return `<span class="sk ok">✓ ${esc(skill.name)}${written}${level}${ai}</span>`
}

// The AI's O*NET suggestion for a CV skill: what it is, the words it comes from, where the list is from, Keep / Remove.
function suggestion(t, skill, i) {
  const s = skill.aiSuggestion
  if (!s) return ''
  return `<div class="tiny ai-suggest"><span>${esc(t('aiSuggests', { name: s.name, evidence: s.evidence }))}</span> <span class="muted">${esc(t('aiSuggestSource'))}</span> <button class="btn sm" data-act="keepAi" data-arg="${i}">${esc(t('keep'))}</button> <button class="btn sm ghost" data-act="dropAi" data-arg="${i}">${esc(t('remove'))}</button></div>`
}

// One skill in a card's Edit view: its level, the standard term to pick when it is unclear, and how to take it out.
function editRow(t, group, { skill, i }) {
  const pick = skill.candidates?.length
    ? `<div class="tiny">${esc(t('pickTerm'))} ${skill.candidates.map((c) => `<button class="btn sm" data-act="pickSkill" data-arg="${i}|${esc(c.id)}">${esc(c.name)}</button>`).join(' ')}</div>`
    : ''
  const source = skill.canonicalId ? `<span class="tiny muted">O*NET · ${esc(skill.canonicalId)}</span>` : `<span class="tiny muted">${esc(t('skillUnknown'))}</span>`
  const suggested = skill.suggestedFrom ? `<div class="tiny muted">${esc(t('suggestFrom', { field: skill.suggestedFrom.title, source: `O*NET ${skill.suggestedFrom.onetVersion ?? ''}`.trim() }))}</div>` : ''
  const LEVEL_TAGS = { assessed: ['calc', 'tagAssessed'], self_reported: ['self', 'tagSelf'], from_projects: ['est', 'tagFromProjects'] }
  const levelTag = LEVEL_TAGS[skill.proficiencyStatus] ? tag(...LEVEL_TAGS[skill.proficiencyStatus].map((part, n) => (n ? t(part) : part))) : ''
  const out = group.kind === 'other'
    ? `<button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="skills|${i}">${esc(t('remove'))}</button>`
    : `<button class="btn sm ghost" style="color:var(--bad)" data-act="unlinkSkill" data-arg="${i}|${group.key}">${esc(t('removeHere'))}</button>`
  return `<div class="sk-row"><div class="sk-name"><b>${esc(skill.name)}</b> ${source}${suggested}${suggestion(t, skill, i)}${pick}</div>
    ${levelBar(t, skill, i)} ${levelTag} ${reviewToggle(t, `skills.${i}`, skill)} ${out}</div>`
}

function editView(t, group) {
  const rows = group.skills.map((entry) => editRow(t, group, entry)).join('')
  let details = ''
  if (group.kind === 'job') details = `<button class="btn sm ghost" data-act="section" data-arg="1">${esc(t('editJobThere'))} →</button>`
  if (group.kind === 'project') {
    const i = group.index
    details = `<div class="grid g2">
      <div class="field"><label for="pt-${i}">${esc(t('projTitle'))}</label><input id="pt-${i}" data-rec="projects|${i}|title" value="${esc(group.record.title ?? '')}"></div>
      <div class="field"><label for="pd-${i}">${esc(t('projDesc'))}</label><input id="pd-${i}" data-rec="projects|${i}|description" value="${esc(group.record.description ?? '')}"></div>
    </div><button class="btn sm ghost" style="color:var(--bad)" data-act="delRec" data-arg="projects|${i}">${esc(t('remove'))}</button>`
  }
  return `<div class="grp-edit">${rows}${details}</div>`
}

function card(ctx, group) {
  const { t, state } = ctx
  const editing = state.groupEdit === group.key
  const record = group.record
  const isOther = group.kind === 'other'
  const heading = isOther
    ? `<h3>${esc(t('grpOther'))}</h3>`
    : `<span class="kind">${esc(t(group.kind === 'job' ? 'grpJob' : 'grpProject'))}</span><h3>${esc([group.title, record.employer].filter(Boolean).join(' · ') || '…')}</h3>${record.extraction?.method === 'ai' ? ` <small class="ai-tag">${esc(t('tagFromAi'))}</small>` : ''}`
  const status = group.needsCheck
    ? `<button class="btn pri sm" data-act="groupOk" data-arg="${group.key}">${esc(t('looksRight'))}</button>`
    : group.fromCv ? tag('ok', `✓ ${t('grpConfirmed')}`) : ''
  const actions = `<div class="row">${status}<button class="btn sm" data-act="groupEdit" data-arg="${group.key}">${esc(t(editing ? 'grpDone' : 'edit'))}</button></div>`
  const years = record?.years != null && record.years !== '' ? t('jobYears', { n: record.years }) : ''
  const sub = isOther ? t('grpOtherSub') : [record.period, years].filter(Boolean).join(' · ')
  // What the CV says about the job or project (the lines under its title).
  const quote = record?.description ? `<p class="grp-quote">${esc(t('grpAsWritten', { text: record.description }))}</p>` : ''
  const adding = state.groupAdd === group.key
  const chips = group.skills.map(({ skill }) => chip(t, skill)).join('')
  const add = isOther ? '' : `<button class="sk add" data-act="groupAdd" data-arg="${group.key}">${esc(t('addSkillChip'))}</button>`
  const search = isOther ? picker(ctx, 'skill', t('skillSearch')) : adding ? picker(ctx, `gskill|${group.key}`, t('grpAddLabel')) : ''
  // Skills added from a field-of-study suggestion say where the suggestion came from (once per field).
  const fields = new Map(group.skills.filter(({ skill }) => skill.suggestedFrom).map(({ skill }) => [skill.suggestedFrom.code, skill.suggestedFrom]))
  const sources = [...fields.values()].map((from) => `<p class="tiny muted">${esc(t('suggestFrom', { field: from.title, source: `O*NET ${from.onetVersion ?? ''}`.trim() }))}</p>`).join('')
  const suggestions = group.skills.map(({ skill, i }) => suggestion(t, skill, i)).join('')
  const body = `${chips || add ? `<div class="sks">${chips}${add}</div>` : ''}${suggestions}${sources}${editing ? editView(t, group) : ''}`
  if (!isOther) return `<section class="grp"><div class="grp-head"><div class="grp-title">${heading}</div>${actions}</div>
    ${sub ? `<p class="grp-sub">${esc(sub)}</p>` : ''}${quote}${body}${search}</section>`
  // Other skills: the search and the suggestions stay open; the skills themselves are folded until "Show".
  const open = Boolean(state.otherOpen || editing)
  const fold = group.skills.length
    ? `<button class="fold" data-act="otherFold" aria-expanded="${open}">${esc(open ? t('otherHide') : t('otherShow', { n: group.skills.length }))}</button>${open ? body : ''}`
    : ''
  return `<section class="grp"><div class="grp-head"><div class="grp-title">${heading}</div>${group.skills.length ? actions : ''}</div>
    <p class="grp-sub">${esc(sub)}</p>${search}${fieldSuggestions(ctx)}${fold}</section>`
}

// What the CV gave, counted, with one button to check every card at once.
function summary(t, groups) {
  const count = (kind) => groups.filter((g) => g.kind === kind).length
  const others = groups.at(-1).skills.length
  const parts = [
    count('job') ? (count('job') === 1 ? t('nJob') : t('nJobs', { n: count('job') })) : '',
    count('project') ? (count('project') === 1 ? t('nProject') : t('nProjects', { n: count('project') })) : '',
    others ? t('nOther', { n: others }) : '',
  ].filter(Boolean)
  const toCheck = groups.filter((g) => g.needsCheck).length
  return `<div class="cvsum"><div><p class="kicker">${esc(t('tagFromCv'))}</p><h3>${esc(t('cvFound', { list: parts.join(', ') }))}</h3>
    <p class="tiny muted">${esc(t('cvConfirmEach'))}</p></div>
    <button class="btn pri" data-act="groupOkAll">${esc(t('confirmAllN', { n: toCheck }))}</button></div>`
}

export function skillGroups(ctx) {
  const { t, profile } = ctx
  const groups = groupsOf(profile)
  const top = profile.inputMethod === 'cv' && groups.some((g) => g.needsCheck) ? summary(t, groups) : ''
  const placed = groups.filter((g) => g.kind !== 'other').map((g) => card(ctx, g)).join('')
  const addProject = `<button class="btn sm" data-act="addRec" data-arg="projects" style="margin:0 0 16px">${esc(t('addProject'))}</button>`
  const fromUse = profile.skills.some((skill) => skill.proficiencyStatus === 'from_projects') ? `<p class="tiny muted">${esc(t('grpLevelNote'))}</p>` : ''
  const legend = profile.skills.length ? `${fromUse}<p class="tiny muted">${esc(t('grpLegend'))}</p>` : ''
  return `${top}${placed}${addProject}${card(ctx, groups.at(-1))}${legend}`
}
