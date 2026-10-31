// Organisation screens (HR and career centres), one pure renderer per tab: (t, orgState) -> html string.
// orgState is state.org (see public/js/orgActions.js): { data: GET /api/org, team: GET /api/org/team, view, scenario,
// page, sel, planGroup, sdgGroup, preview, link, roleSearch, ... }. Layout and wording follow docs/mockup-org.html.
// Every list names its source; every text goes through esc(); every link through safeUrl() (ext).
// Numbers are only shown, never worked out here: they come from the team answer.
import { esc, tag } from '../ui.js'
import { ext, sourceLine } from './pathwayParts.js'
import { day, reasonIn, reviewText, unGoalUrl } from './match.js'

const arr = (v) => (Array.isArray(v) ? v : [])
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const one = (n) => (isNum(n) ? (Math.round(n * 10) / 10).toFixed(1) : '0.0')
export const COLUMNS_PER_PAGE = 6

export const typeOf = (o) => ((o?.team?.org?.type ?? o?.data?.org?.type) === 'centre' ? 'centre' : 'hr')
// A word that changes with the organisation type: department / programme, staff / student, team / cohort plan.
export const word = (t, o, key) => t(`og_${key}_${typeOf(o)}`)
const teamOf = (o) => (o?.team && typeof o.team === 'object' && Array.isArray(o.team.groups) ? o.team : null)
const groupsOf = (o) => (teamOf(o) ? teamOf(o).groups : arr(o?.data?.groups))
const roleBy = (o) => (typeOf(o) === 'centre' || o?.team?.view === 'target' || o?.view === 'target' ? 'target' : 'current')
const sliceOf = (person, view) => (view === 'target' ? person?.target : person?.current) ?? null

const head = (t, o, key, lead = '') => `<h1>${esc(word(t, o, key))}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}`
const plainHead = (t, key, lead = '') => `<h1>${esc(t(key))}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}`

// "Source: <what this list is made from>" and, when the answer has them, the named sources with dates and licences.
function src(t, o, key, extra = '') {
  const sources = arr(o?.team?.sources)
  return `<div class="og-src"><b>${esc(t('ogSource'))}</b> ${esc(t(key))}</div>${extra}${sources.length ? sourceLine(t, sources, ['*']) : ''}`
}

const loading = (t, o) => `<div class="card"><p class="muted">${o?.teamError ? esc(t('ogTeamError')) : `<span class="spin"></span> ${esc(t('ogLoading'))}`}</p>
  ${o?.teamError ? `<button class="btn sm" type="button" data-act="orgRetry">${esc(t('ogRetry'))}</button>` : ''}</div>`

const noPeople = (t) => `<div class="banner b-info"><div>${esc(t('ogNoPeople'))}</div></div>`

// The "compare against" switch. Career centres only have the target role.
function viewSeg(t, o) {
  const view = roleBy(o)
  const button = (id, key) => `<button type="button" class="${view === id ? 'on' : ''}" data-act="orgView" data-arg="${id}">${esc(t(key))}</button>`
  return `<div class="row"><span class="small muted">${esc(t('ogCompare'))}</span><div class="seg">${typeOf(o) === 'hr' ? button('current', 'ogCurrent') : ''}${button('target', 'ogTarget')}</div></div>`
}

// ---------- eMASCO role search (target role of a group, current role of a join link) ----------
function roleBox(t, o, forKey) {
  const rs = o?.roleSearch
  if (!rs || rs.for !== forKey) return ''
  let list = ''
  if (rs.busy) list = `<p class="tiny muted">${esc(t('occSearching'))}</p>`
  else if (rs.failed) list = `<p class="tiny">${esc(t('ogRoleFail'))}</p>`
  else if (rs.results) {
    list = rs.results.length
      ? rs.results.map((c, i) => `<button type="button" class="choice" data-act="orgRolePick" data-arg="${i}"><b>${esc(c.title)}</b><span class="tiny muted">eMASCO ${esc(c.code)}</span></button>`).join('')
      : `<p class="tiny muted">${esc(t('ogRoleNone'))}</p>`
  }
  return `<div class="og-rolebox"><label class="tiny muted" for="ogRoleQ">${esc(t('ogRoleSearchLabel'))}</label>
    <input id="ogRoleQ" data-org-role="${esc(forKey)}" value="${esc(rs.term ?? '')}" placeholder="${esc(t('ogRoleSearchHint'))}" autocomplete="off">
    <div class="og-roles">${list}</div>
    <div class="tiny muted">${esc(t('ogSrcSetup'))}</div>
    <button type="button" class="btn sm" data-act="orgRoleClose">${esc(t('ogCancel'))}</button></div>`
}
// "Accountant · 2411-01": the title with its code; the code alone when the title is not known
export const roleLabel = (title, code) => (title && code ? `${title} · ${code}` : code ?? '—')
const roleName = (o, code, title = null) => roleLabel(title ?? o?.titles?.[code] ?? null, code)

// ---------- 1 Setup ----------
export function setupView(t, o) {
  const lead = `${t('ogSetupLead')} ${t('ogHiring')}`
  const data = o?.data
  if (!data?.org) {
    const draft = o?.draftType === 'centre' ? 'centre' : 'hr'
    const seg = ['hr', 'centre'].map((id) => `<button type="button" class="${draft === id ? 'on' : ''}" data-act="orgDraftType" data-arg="${id}">${esc(t(`og_type_${id}`))}</button>`).join('')
    return `${plainHead(t, 'ogSetupTitle', lead)}
    <form class="card og-stack" data-form="orgCreate">
      <div class="field"><label for="ogName">${esc(t('ogOrgName'))}</label><input id="ogName" maxlength="80" value="${esc(o?.draftName ?? '')}" autocomplete="organization" required></div>
      <div class="field"><label>${esc(t('ogType'))}</label><div class="seg og-wrap">${seg}</div></div>
      <span class="tiny muted">${esc(t('ogTypeNote'))}</span>
      <div class="row"><button class="btn pri" type="submit">${esc(t('ogCreate'))}</button></div>
      <div class="og-src"><b>${esc(t('ogSource'))}</b> ${esc(t('ogSrcSetup'))}</div>
    </form>`
  }
  const type = typeOf(o)
  const sizes = new Map()
  const titleOfGroup = new Map()
  for (const g of arr(o?.team?.groups)) { sizes.set(g.id, g.size); titleOfGroup.set(g.id, g.targetTitle ?? null) }
  const rows = arr(data.groups).map((g) => {
    const target = g.targetCode
      ? `<b>${esc(roleName(o, g.targetCode, titleOfGroup.get(g.id) ?? null))}</b> <button type="button" class="iconbtn" data-act="orgClearTarget" data-arg="${esc(g.id)}" aria-label="${esc(t('ogRemoveTarget'))}">✕</button>`
      : `<span class="muted">${esc(t('ogNoTarget'))}</span>`
    return `<tr><td>${esc(g.name)}${sizes.has(g.id) ? ` <span class="tiny muted">${esc(t('ogStaffCount', { count: sizes.get(g.id), people: t(`og_person_${type}`) }))}</span>` : ''}</td>
      <td>${target}<br><button type="button" class="btn sm" data-act="orgRoleOpen" data-arg="g:${esc(g.id)}">${esc(t('ogChange'))}</button>${roleBox(t, o, `g:${g.id}`)}</td>
      <td><button type="button" class="iconbtn" data-act="orgDelGroup" data-arg="${esc(g.id)}" aria-label="${esc(`${t('ogRemove')} ${g.name}`)}">✕</button></td></tr>`
  }).join('')
  return `${plainHead(t, 'ogSetupTitle', lead)}
  <div class="grid g2 og-top">
    <form class="card og-stack" data-form="orgRename">
      <div class="field"><label for="ogName">${esc(t('ogOrgName'))}</label><input id="ogName" maxlength="80" value="${esc(data.org.name)}" required></div>
      <div class="field"><label>${esc(t('ogType'))}</label><div>${tag('src', t(`og_type_${type}`))}</div></div>
      <span class="tiny muted">${esc(t(type === 'centre' ? 'ogTypeNoteCentre' : 'ogTypeNote'))}</span>
      <div class="row"><button class="btn pri" type="submit">${esc(t('ogSave'))}</button>
        <button class="btn" type="button" style="color:var(--bad)" data-act="orgDeleteOrg">${esc(t('ogDeleteOrg'))}</button></div>
    </form>
    <div class="card og-stack">
      <h3>${esc(t('ogGroupsTitle', { groups: word(t, o, 'depts') }))}</h3>
      ${rows ? `<div class="og-tw"><table><thead><tr><th>${esc(word(t, o, 'dept'))}</th><th>${esc(t('ogTargetRole'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      <form class="row" data-form="orgAddGroup"><input id="ogNewGroup" class="og-grow" maxlength="80" placeholder="${esc(word(t, o, 'addgroup'))}" aria-label="${esc(word(t, o, 'addgroup'))}" required>
        <button class="btn sm" type="submit">${esc(t('ogAddGroupBtn'))}</button></form>
      <div class="og-src"><b>${esc(t('ogSource'))}</b> ${esc(t('ogSrcSetup'))}</div>
    </div>
  </div>`
}

// ---------- 2 People ----------
function previewCard(t, p) {
  const rejected = arr(p.rejected)
  const unknown = arr(p.unrecognised)
  const groups = arr(p.newGroups)
  const list = (items) => `<ul class="og-list">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
  return `<div class="card og-preview"><b class="small">${esc(t('ogPreviewOf', { name: p.name ?? '' }))}</b> ${tag('unv', t('ogNothingSaved'))}
    <dl class="kv"><dt>${esc(t('ogAccepted'))}</dt><dd>${esc(p.accepted ?? 0)}</dd>
    <dt>${esc(t('ogRejected'))}</dt><dd>${esc(rejected.length)}${rejected.length ? list(rejected.map((r) => t('ogRowReason', { row: r.row, reason: r.reason }))) : ''}</dd>
    <dt>${esc(t('ogUnrecognised'))}</dt><dd>${esc(unknown.length)}${unknown.length ? list(unknown.map((u) => t('ogRowSkill', { row: u.row, skill: u.skill }))) : ''}</dd>
    ${groups.length ? `<dt>${esc(t('ogNewGroups'))}</dt><dd>${esc(groups.join(', '))}</dd>` : ''}</dl>
    <div class="row"><button class="btn pri sm" type="button" data-act="orgImport" ${p.accepted > 0 ? '' : 'disabled'}>${esc(t('ogImport', { count: p.accepted ?? 0 }))}</button>
      <button class="btn sm" type="button" data-act="orgCancelImport">${esc(t('ogCancel'))}</button></div></div>`
}

function inviteCard(t, o) {
  const groups = groupsOf(o)
  const hr = typeOf(o) === 'hr'
  const options = groups.map((g) => `<option value="${esc(g.id)}" ${o?.inviteGroup === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')
  const code = o?.inviteCode
    ? `<b>${esc(roleName(o, o.inviteCode))}</b> <button type="button" class="iconbtn" data-act="orgInviteRoleClear" aria-label="${esc(t('ogRemove'))}">✕</button>`
    : `<span class="muted">${esc(t('ogNoTarget'))}</span>`
  const role = hr
    ? `<div class="field"><label>${esc(t('ogInviteRole'))}</label><div>${code}</div><div><button type="button" class="btn sm" data-act="orgRoleOpen" data-arg="invite">${esc(t('ogChange'))}</button></div>${roleBox(t, o, 'invite')}</div>`
    : ''
  const link = o?.link
    ? `<div class="banner b-info"><div><b>${esc(t('ogLinkOnce'))}</b><br><span class="tiny og-break" id="ogLinkText">${esc(o.link.url)}</span><br>
        <span class="tiny muted">${esc(t('ogLinkNote'))}</span><div class="row"><button class="btn sm" type="button" data-act="orgCopy">${esc(t('ogCopy'))}</button></div></div></div>`
    : ''
  return `<div class="card og-stack"><h3>${esc(t('ogInviteTitle'))}</h3>
    ${groups.length
      ? `<div class="field"><label for="ogInviteGroup">${esc(word(t, o, 'dept'))}</label><select id="ogInviteGroup">${options}</select></div>${role}
         <div class="row"><button class="btn" type="button" data-act="orgInvite">${esc(t('ogMakeLink'))}</button></div>`
      : `<p class="small muted">${esc(t('ogNoGroups', { dept: word(t, o, 'dept').toLowerCase() }))}</p>`}
    ${link}</div>`
}

function leftOutNotes(t, o, team) {
  const view = team.view === 'target' ? 'target' : 'current'
  return arr(team.leftOut).map((l) => {
    const person = arr(team.people).find((p) => p.id === l.personId)
    const slice = sliceOf(person, view)
    const key = ['chain_broken', 'unknown_role', 'no_known_skill', 'no_current_role'].includes(l.reason) ? l.reason : 'no_known_skill'
    return `<p class="note">${esc(t(`ogReason_${key}`, { name: person?.displayName ?? '', code: roleLabel(slice?.title, slice?.code ?? l.code ?? ''), step: l.missingStep ?? '' }))}</p>`
  }).join('')
}

function percentCell(t, slice, none) {
  if (!slice) return `<span class="muted">${esc(none)}</span>`
  if (!slice.available) return `<span class="tag t-bad">${esc(t('ogNA'))}</span>`
  return `${esc(slice.percent)}%${slice.provisional ? ` ${tag('prov', t('ogProvisional'))}` : ''}`
}

function staffTable(t, o) {
  const team = teamOf(o)
  const hr = typeOf(o) === 'hr'
  const groups = groupsOf(o)
  const people = team ? arr(team.people) : arr(o?.data?.people)
  if (!people.length) return noPeople(t)
  const rows = people.map((p) => {
    const prov = p.current?.provisional || p.target?.provisional ? ` ${tag('self', t('ogProvisional'))}` : ''
    const move = `<select class="og-sel" data-org-move="${esc(p.id)}" aria-label="${esc(t('ogMovePerson', { dept: word(t, o, 'dept'), name: p.displayName ?? '' }))}">${groups.map((g) => `<option value="${esc(g.id)}" ${g.id === p.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`
    const source = p.source === 'shared'
      ? `${tag('src', t('ogSrcShared'))}${p.addedAt ? `<div class="tiny muted">${esc(day(p.addedAt))}</div>` : ''}`
      : tag('unv', t('ogSrcRoster'))
    return `<tr><td>${esc(p.displayName)}${prov}</td><td>${move}</td>
      ${hr ? `<td>${esc(roleLabel(p.current?.title, p.current?.code ?? p.currentCode))}</td><td class="num">${team ? percentCell(t, p.current, '—') : '—'}</td>` : ''}
      <td class="num">${team ? percentCell(t, p.target, t('ogNoTargetShort')) : '—'}</td><td>${source}</td>
      <td><button type="button" class="iconbtn" data-act="orgDelPerson" data-arg="${esc(p.id)}" aria-label="${esc(t('ogRemovePerson', { name: p.displayName ?? '' }))}">✕</button></td></tr>`
  }).join('')
  return `<div class="og-tw"><table><thead><tr><th>${esc(t('ogColName'))}</th><th>${esc(word(t, o, 'dept'))}</th>
    ${hr ? `<th>${esc(t('ogColRole'))}</th><th class="num">${esc(t('ogColNow'))}</th>` : ''}<th class="num">${esc(t('ogColTarget'))}</th><th>${esc(t('ogColSource'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
}

export function peopleView(t, o) {
  const team = teamOf(o)
  const hr = typeOf(o) === 'hr'
  const count = (team ? arr(team.people) : arr(o?.data?.people)).length
  const left = team ? arr(team.leftOut).length : 0
  const sample = `<button class="btn" type="button" data-act="orgSample">${esc(t('ogUseSample'))}</button>`
  return `${head(t, o, 'people', t(hr ? 'ogPeopleLead' : 'ogPeopleLeadCentre'))}
  ${o?.message ? `<div class="banner ${o.message.kind === 'ok' ? 'b-ok' : 'b-bad'}" role="status"><div>${esc(o.message.text)}</div></div>` : ''}
  <div class="grid g2 og-top">
    <div class="card og-stack"><h3>${esc(t('ogUploadTitle'))}</h3>
      <div class="banner b-warn"><div><b>${esc(t('ogSynthetic'))}</b></div></div>
      <input type="file" id="ogFile" accept=".csv,text/csv" hidden>
      <div class="row"><button class="btn" type="button" data-act="orgChooseFile">${esc(t('ogChooseFile'))}</button>${sample}</div>
      ${o?.preview ? previewCard(t, o.preview) : ''}</div>
    ${inviteCard(t, o)}
  </div>
  <h2>${esc(word(t, o, 'staff'))} <span class="muted small">${esc(t('ogStaffCount', { count, people: word(t, o, 'person') }))}${left ? ` · ${esc(t('ogLeftOutCount', { count: left }))}` : ''}</span></h2>
  <div class="card">${team || !o?.teamError ? staffTable(t, o) : loading(t, o)}
    ${team ? leftOutNotes(t, o, team) : ''}<p class="note">${esc(t('ogPeopleNote'))}</p>
    ${src(t, o, 'ogSrcPeople')}</div>`
}

// ---------- 3 Heatmap ----------
const heatClass = (cell) => {
  const short = (cell.below ?? 0) + (cell.missing ?? 0)
  if (short === 0) return 0
  return cell.averageGap < 1 ? 1 : cell.averageGap < 2 ? 2 : 3
}

function cellPanel(t, o, team) {
  const sel = o?.sel
  const cell = sel ? team.heatmap?.cells?.[sel.groupId]?.[sel.key] : null
  const group = sel ? arr(team.groups).find((g) => g.id === sel.groupId) : null
  const column = sel ? arr(team.heatmap?.columns).find((c) => c.key === sel.key) : null
  if (!cell || !group) {
    return `<div class="card og-stack"><span class="tiny muted">${esc(t('ogCellTitle'))}</span><p class="small">${esc(t('ogCellHint'))}</p></div>`
  }
  const n = cell.needing || 0
  const pc = (x) => (n ? Math.round(((x ?? 0) / n) * 1000) / 10 : 0)
  // a cell can hold several roles (current view): name every role of the people in it, never one for all
  const view = team.view === 'target' ? 'target' : 'current'
  const byId = new Map(arr(team.people).map((p) => [p.id, p]))
  const who = arr(cell.people)
  const roles = [...new Map(who.map((x) => sliceOf(byId.get(x.personId), view)).filter((r) => r?.code).map((r) => [r.code, roleLabel(r.title, r.code)])).values()]
  const code = roles.length ? roles.join(', ') : roleLabel(team.plans?.[group.id]?.roleTitle, team.plans?.[group.id]?.roleCode)
  const statusWord = { met: 'ogMet', below: 'ogBelow', missing: 'ogMissing', not_assessed: 'ogNotAssessed' }
  const levelWord = { 2: 'basic', 4: 'good', 6: 'expert' }
  const youText = (x) => {
    if (x.status === 'not_assessed') return t('ogNotAssessed')
    if (x.status === 'missing' || !isNum(x.you) || x.you === 0) return t('ogCellNotListed')
    return levelWord[x.you] ? t(`mtLevel_${levelWord[x.you]}`) : one(x.you)
  }
  const people = who.length
    ? `<dt>${esc(t('ogCellPeople'))}</dt><dd><ul class="og-list">${who.map((x) => `<li>${esc(t('ogCellPerson', {
      name: byId.get(x.personId)?.displayName ?? '', status: t(statusWord[x.status] ?? 'ogMissing'), you: youText(x), needed: one(x.needed),
    }))}</li>`).join('')}</ul></dd>`
    : ''
  const needed = isNum(cell.neededMax)
    ? `<p class="small">${esc(t('ogCellNeeded', { level: one(cell.neededMax) }))}${cell.neededMax > 6 ? ` ${esc(t('ogStillShort'))}` : ''}</p>`
    : ''
  const bar = [['met', 'ok'], ['below', 'self'], ['missing', 'bad'], ['notAssessed', 'est']]
  return `<div class="card og-stack"><span class="tiny muted">${esc(t('ogCellTitle'))}</span>
    <h3>${esc(group.name)} · ${esc(column?.name ?? sel.key)}</h3>
    <dl class="kv"><dt>${esc(t(roles.length > 1 ? 'ogCellRoles' : 'ogCellRole'))}</dt><dd>${esc(code)}</dd>
      <dt>${esc(t('ogCellShort'))}</dt><dd>${esc(t('ogCellShortVal', { total: one(cell.levelsShort), avg: one(cell.averageGap) }))}</dd>${people}</dl>
    ${needed}
    <div><div class="og-bar">${bar.map(([k, c]) => `<i style="width:${pc(cell[k])}%;background:var(--${c})"></i>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--ok)"></i>${esc(t('ogMet'))} ${esc(cell.met ?? 0)}</span><span><i style="background:var(--self)"></i>${esc(t('ogBelow'))} ${esc(cell.below ?? 0)}</span><span><i style="background:var(--bad)"></i>${esc(t('ogMissing'))} ${esc(cell.missing ?? 0)}</span><span><i style="background:var(--est)"></i>${esc(t('ogNotAssessed'))} ${esc(cell.notAssessed ?? 0)}</span></div></div>
    ${cell.notAssessed > 0 ? `<div class="banner b-warn tiny"><div>${esc(t('ogCellProvNote', { count: cell.notAssessed }))}</div></div>` : ''}
    <button class="btn pri" type="button" data-act="orgToPlan" data-arg="${esc(group.id)}">${esc(t('ogMakePlan', { group: group.name }))}</button>
    <div class="og-src"><b>${esc(t('ogSource'))}</b> ${esc(t('ogSrcHeat'))}</div></div>`
}

export function heatView(t, o) {
  const title = `<h1>${esc(t('ogHeatTitle'))}</h1><p class="lead">${esc(t('ogHeatLead'))}</p>`
  const team = teamOf(o)
  if (!team) return `${title}${loading(t, o)}${src(t, o, 'ogSrcHeat')}`
  if (!arr(team.people).length) return `${title}${noPeople(t)}${src(t, o, 'ogSrcHeat')}`
  const view = team.view === 'target' ? 'target' : 'current'
  const columns = arr(team.heatmap?.columns)
  const pages = Math.max(1, Math.ceil(columns.length / COLUMNS_PER_PAGE))
  const page = Math.min(Math.max(Number(o?.page) || 0, 0), pages - 1)
  const shown = columns.slice(page * COLUMNS_PER_PAGE, (page + 1) * COLUMNS_PER_PAGE)
  const leftOut = arr(team.leftOut)
  const sel = o?.sel
  const rows = arr(team.groups).map((g) => {
    const left = leftOut.filter((l) => l.groupId === g.id).length
    const cells = shown.map((c) => {
      const cell = team.heatmap?.cells?.[g.id]?.[c.key]
      if (!cell) return `<td class="blank">${esc(view === 'target' && !g.targetCode ? t('ogNoTargetRole') : t('ogNotNeeded'))}</td>`
      const short = (cell.below ?? 0) + (cell.missing ?? 0)
      const on = sel && sel.groupId === g.id && sel.key === c.key
      return `<td class="og-c${heatClass(cell)}${on ? ' sel' : ''}" role="button" tabindex="0" data-act="orgCell" data-arg="${esc(g.id)}|${esc(c.key)}"><b>${esc(t('ogCellOf', { n: short, m: cell.needing }))}</b><small>${esc(t('ogCellAvg', { avg: one(cell.averageGap) }))}${cell.provisional ? ` · ${esc(t('ogCellProv'))}` : ''}</small></td>`
    }).join('')
    return `<tr><th class="rh" scope="row">${esc(g.name)}<br><small class="muted">${esc(t('ogStaffCount', { count: g.size ?? 0, people: word(t, o, 'person') }))}${left ? ` · ${esc(t('ogLeftOutGroup', { count: left }))}` : ''}</small></th>${cells}</tr>`
  }).join('')
  const legend = [['0', 'ogLegend0'], ['1', 'ogLegend1'], ['2', 'ogLegend2'], ['3', 'ogLegend3']].map(([c, k]) => `<span><i class="og-c${c}"></i>${esc(t(k))}</span>`).join('')
  const table = shown.length
    ? `<div class="og-tw"><table class="og-heat"><thead><tr><th></th>${shown.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
       <div class="row og-between"><span class="tiny muted">${esc(t('ogCols', { from: page * COLUMNS_PER_PAGE + 1, to: page * COLUMNS_PER_PAGE + shown.length, total: columns.length }))}</span>
       <div class="row"><button class="btn sm" type="button" data-act="orgPage" data-arg="${page - 1}" aria-label="${esc(t('ogPrev'))}" ${page === 0 ? 'disabled' : ''}>‹</button>
       <button class="btn sm" type="button" data-act="orgPage" data-arg="${page + 1}" aria-label="${esc(t('ogNext'))}" ${page >= pages - 1 ? 'disabled' : ''}>›</button></div></div>`
    : `<p class="small muted">${esc(t('ogHeatEmpty'))}</p>`
  return `${title}
  <div class="card row og-between">${viewSeg(t, o)}<div class="legend">${legend}<span><i class="og-none"></i>${esc(t('ogLegendNone'))}</span></div></div>
  ${leftOut.length ? `<div class="banner b-warn og-gap"><div>${esc(t('ogLeftOut', { count: leftOut.length, people: word(t, o, 'people') }))}</div></div>` : ''}
  <div class="grid side og-top"><div class="card">${table}</div>${cellPanel(t, o, team)}</div>
  <div class="card">${src(t, o, 'ogSrcHeat')}</div>`
}

// ---------- 4 Team plan ----------
function courseItem(t, p) {
  const site = p.siteName ?? p.site ?? ''
  const approved = typeof p.approvedAt === 'string' && p.approvedAt ? ` ${tag('ok', t('pwApprovedOn', { date: day(p.approvedAt) }))}` : ''
  return `<li><span class="pw-site">${esc(site)}</span> ${ext(p.link ?? p.url, `${p.name ?? p.title ?? ''} ↗`)}${approved} <span class="tiny muted">${esc(t('pwChecked', { date: day(p.checkedAt) }))}</span></li>`
}

function stepItem(t, o, s) {
  const to = t(`mtLevel_${s.to}`) === `mtLevel_${s.to}` ? String(s.to ?? '') : t(`mtLevel_${s.to}`)
  const line = t(s.peopleShort === 1 ? 'ogStepLineOne' : 'ogStepLine', { short: s.peopleShort ?? 0, missing: s.missing ?? 0, below: s.below ?? 0, levels: one(s.levelsShort), to })
  const options = ['planned', 'in_progress', 'done'].map((k) => `<option value="${k}" ${(s.status ?? 'planned') === k ? 'selected' : ''}>${esc(t(`ogStatus_${k}`))}</option>`).join('')
  const courses = arr(s.courses)
  const links = arr(s.search).filter((l) => l && l.url)
  const more = links.length ? `<div class="pw-more"><span class="muted">${esc(t('pwMoreOn'))}</span>${links.map((l) => ext(l.url, `${l.name ?? l.site ?? ''} ↗`, 'pw-chip')).join('')}</div>` : ''
  return `<li><div class="row og-between"><h3>${esc(s.name ?? s.key)}</h3>
    <select class="og-sel" data-org-status="${esc(s.key)}" aria-label="${esc(t('ogStatusOf', { name: s.name ?? s.key }))}">${options}</select></div>
    <p class="small">${esc(line)}${s.stillShort ? ` ${esc(t('ogStillShort'))}` : ''}</p>
    ${courses.length ? `<ul class="pw-picks">${courses.map((p) => courseItem(t, p)).join('')}</ul>` : `<div class="banner b-info tiny"><div>${esc(t(links.length ? 'ogNoPick' : 'ogNoPickNoLinks'))}</div></div>`}
    ${more}
    <p class="tiny muted">${esc(t('ogTime'))}</p></li>`
}

export function planView(t, o) {
  const title = `<h1>${esc(word(t, o, 'plan'))}</h1>`
  const team = teamOf(o)
  if (!team) return `${title}${loading(t, o)}${src(t, o, 'ogSrcPlan')}`
  const groups = arr(team.groups)
  if (!groups.length) return `${title}${noPeople(t)}${src(t, o, 'ogSrcPlan')}`
  const g = groups.find((x) => x.id === o?.planGroup) ?? groups[0]
  const view = team.view === 'target' ? 'target' : 'current'
  const plan = team.plans?.[g.id] ?? { roleCode: null, steps: [] }
  const steps = arr(plan.steps)
  const select = `<div class="field"><label for="ogPlanGroup">${esc(word(t, o, 'dept'))}</label><select id="ogPlanGroup">${groups.map((x) => `<option value="${esc(x.id)}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`
  let body
  const noRoleKey = view === 'target' ? 'ogPlanNoRoleTarget' : plan.noRole === 'none_available' ? 'ogPlanNoAvailable' : 'ogPlanNoRoleCurrent'
  if (!plan.roleCode) body = `<li class="og-plain"><div class="banner b-info"><div>${esc(t(noRoleKey))}</div></div></li>`
  else if (!steps.length) body = `<li class="og-plain"><p class="small">${esc(t('ogPlanNone'))}</p></li>`
  else body = steps.map((s) => stepItem(t, o, s)).join('')
  const count = (k) => steps.filter((s) => (s.status ?? 'planned') === k).length
  const side = `<div class="card og-stack"><h3>${esc(t('ogPlanFor'))}</h3>
    <p class="small">${esc(t('ogPlanForText', { group: g.name, count: g.size ?? 0, people: word(t, o, 'person'), kind: t(view === 'target' ? 'ogTarget' : 'ogCurrent'), code: roleLabel(plan.roleTitle, plan.roleCode) }))}</p>
    ${plan.roleCode && isNum(plan.counted) ? `<p class="small">${esc(t('ogPlanCounted', { code: roleLabel(plan.roleTitle, plan.roleCode), count: plan.counted, total: g.size ?? 0 }))}</p>` : ''}
    <dl class="kv"><dt>${esc(t('ogSteps'))}</dt><dd>${esc(t('ogStepsSkills', { count: steps.length }))}</dd>
      <dt>${esc(t('ogStatus_planned'))}</dt><dd>${count('planned')}</dd><dt>${esc(t('ogStatus_in_progress'))}</dt><dd>${count('in_progress')}</dd><dt>${esc(t('ogStatus_done'))}</dt><dd>${count('done')}</dd></dl>
    ${src(t, o, 'ogSrcPlan')}</div>`
  return `${title}
  <div class="card row">${select}${viewSeg(t, o)}${tag('self', t('ogSelfReported'))}</div>
  <div class="grid side og-top"><div class="card"><ol class="og-steps">${body}</ol><p class="note">${esc(t('ogPlanOrder'))}</p></div>${side}</div>`
}

// ---------- 5 Outlook and SDG ----------
// matching's dated sources (AI, job ads, SDG) for these parts, with their dates
const dated = (t, team, ids) => (arr(team?.outlookSources).length ? sourceLine(t, team.outlookSources, ids) : '')

function sdgBlock(t, o, team, g) {
  const sdg = team.sdg?.[g.id]
  const goals = arr(sdg?.goals)
  const lang = o?.lang ?? 'en'
  if (!goals.length) return `<p class="small">${esc(t('ogSdgNone'))}</p>`
  const total = sdg.total ?? goals.reduce((n, x) => n + (x.count ?? 0), 0)
  const line = `<p class="small">${esc(t('ogSdgLine', { group: g.name, links: total, goals: goals.length }))}</p>`
  const rows = goals.map((x) => {
    const url = unGoalUrl(x.goal)
    const badge = url
      ? `<a class="sdg" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('ogGoalLabel', { goal: x.goal }))}">${esc(x.goal)}</a>`
      : `<span class="sdg">${esc(x.goal)}</span>`
    const links = arr(x.links).map((l) => `<div class="small"><b>${esc(l.target)}</b> · ${esc(reasonIn(l.reason, lang))} ${tag(l.approvedAt ? 'ok' : 'unv', reviewText(t, l.approvedAt))}</div>`).join('')
    return `<div class="row og-sdgrow">${badge}<div><b class="small">${esc(t(x.count === 1 ? 'ogSdgLinkOne' : 'ogSdgLinkMany', { count: x.count ?? 0 }))}</b>${links}</div></div>`
  }).join('')
  return `${line}<div class="og-stack">${rows}</div>`
}

export function outlookView(t, o) {
  const title = `<h1>${esc(t('ogOutlookTitle'))}</h1><p class="lead">${esc(t('ogHiring'))}</p>`
  const team = teamOf(o)
  if (!team) return `${title}${loading(t, o)}${src(t, o, 'ogSrcOutlook')}`
  const groups = arr(team.groups)
  if (!arr(team.people).length) return `${title}${noPeople(t)}${src(t, o, 'ogSrcOutlook')}`
  const scenario = team.scenario === 'rapid' ? 'rapid' : 'moderate'
  const seg = ['moderate', 'rapid'].map((s) => `<button type="button" class="${scenario === s ? 'on' : ''}" data-act="orgScenario" data-arg="${s}">${esc(t(s === 'rapid' ? 'mtScnRapid' : 'mtScnModerate'))}</button>`).join('')
  const by = t(roleBy(o) === 'target' ? 'ogByTarget' : 'ogByCurrent')
  const bands = groups.map((g) => {
    const counts = arr(team.bands?.[g.id])
    const left = arr(team.leftOut).filter((l) => l.groupId === g.id).length
    return `<div class="card"><h3>${esc(g.name)}</h3><span class="tiny muted">${esc(by)}${left ? ` · ${esc(t('ogLeftOutGroup', { count: left }))}` : ''}</span>
      <div class="og-band">${[1, 2, 3, 4].map((n) => `<div class="b${n}" data-band="${n}"><b>${esc(counts[n - 1] ?? 0)}</b>${esc(t(`ogBand${n}`))}</div>`).join('')}</div></div>`
  }).join('')
  // who moved between Moderate and Rapid, per group and pair of bands
  const groupOf = new Map(arr(team.people).map((p) => [p.id, p.groupId]))
  const lines = []
  for (const g of groups) {
    const pairs = new Map()
    for (const m of arr(team.moved)) if (groupOf.get(m.personId) === g.id) pairs.set(`${m.from}|${m.to}`, { from: m.from, to: m.to, count: (pairs.get(`${m.from}|${m.to}`)?.count ?? 0) + 1 })
    for (const p of [...pairs.values()].sort((a, b) => a.from - b.from || a.to - b.to)) lines.push(t('ogMovedLine', { group: g.name, ...p }))
  }
  const g = groups.find((x) => x.id === o?.sdgGroup) ?? groups[0]
  const sdgSelect = `<select id="ogSdgGroup" aria-label="${esc(t('ogSdgFor'))}">${groups.map((x) => `<option value="${esc(x.id)}" ${g && x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
  return `${title}
  <div class="card row og-between"><div class="row"><span class="small muted">${esc(t('ogScenario'))}</span><div class="seg">${seg}</div></div>${tag('est', t('ogEstimates'))}</div>
  <div class="banner b-est small"><div>${esc(t('ogScenarioNote'))}</div></div>
  <div class="grid g3">${bands}</div>
  <div class="card og-gap"><h3>${esc(t('ogMovedTitle'))}</h3>
    ${lines.length ? lines.map((l) => `<p class="small">${esc(l)}</p>`).join('') : `<p class="small">${esc(t('ogMovedNone'))}</p>`}
    ${src(t, o, 'ogSrcOutlook', dated(t, team, ['aei', 'ilo', 'dosm']))}</div>
  <h2>${esc(t('ogSdgTitle'))} ${tag('unv', t('mtPotential'))}</h2>
  <div class="card"><div class="row"><label class="small muted" for="ogSdgGroup">${esc(t('ogSdgFor'))}</label>${sdgSelect}</div>
    ${g ? sdgBlock(t, o, team, g) : ''}
    <div class="og-src"><b>${esc(t('ogSource'))}</b> ${esc(t('ogSrcSdg'))}</div>${dated(t, team, ['sdg-targets', 'sdg-links'])}</div>`
}
