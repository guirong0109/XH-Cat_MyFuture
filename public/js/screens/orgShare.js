// Employee share screen (#share): (t, shareState) -> html. Shows the organisation, the exact list HR will see (from the
// dry run of PUT /api/org/share), what is not shared, the name field and the buttons. shareState is state.share, made by
// public/js/orgActions.js; nothing here is stored in the browser. Every server value goes through esc().
import { esc } from '../ui.js'
import { day } from './match.js'

const arr = (v) => (Array.isArray(v) ? v : [])
const LEVELS = ['basic', 'good', 'expert', 'not_assessed']
const NOT_ONET = 'not an O*NET skill or knowledge item'

const errorText = (t, code) => {
  for (const key of [`shErr_${code}`, `ogErr_${code}`]) if (t(key) !== key) return t(key)
  return t('ogErr_other')
}
const wrap = (inner) => `<div class="og sh">${inner}</div>`
const banner = (kind, text) => `<div class="banner ${kind}" role="${kind === 'b-bad' ? 'alert' : 'status'}"><div>${esc(text)}</div></div>`

function skillTable(t, shared) {
  const rows = shared.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(LEVELS.includes(s.level) ? t(`shLevel_${s.level}`) : t('shLevel_not_assessed'))}</td></tr>`).join('')
  return `<div class="table-wrap"><table><thead><tr><th>${esc(t('shColSkill'))}</th><th>${esc(t('shColLevel'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function notShared(t, list) {
  if (!list.length) return ''
  const items = list.map((n) => `“${esc(n.name)}” (${esc(n.reason === NOT_ONET ? t('shNotOnet') : n.reason)})`).join('; ')
  return `<p class="tiny muted">${esc(t('shNotShared'))} ${items}.</p>`
}

function chooser(t, s) {
  const profiles = arr(s.profiles)
  if (!profiles.length) {
    return `<div class="banner b-info"><div>${esc(t('shNoProfile'))}</div></div>
      <div class="row"><button class="btn pri" type="button" data-go="source">${esc(t('shBuild'))}</button></div>`
  }
  const options = profiles.map((p) => `<option value="${esc(p.id)}"${p.id === s.profileId ? ' selected' : ''}>${esc(t('shProfileOpt', { date: day(p.updatedAt) }))}</option>`).join('')
  return `<div class="field" style="max-width:320px"><label for="shProfile">${esc(t('shProfile'))}</label><select class="input" id="shProfile">${options}</select></div>`
}

// "Role: <title> · <code>" (HR sees the role the link sets), or "No role set".
function roleLine(t, who) {
  const code = who?.currentCode
  if (!code) return `<p class="small">${esc(t('shNoRole'))}</p>`
  return `<p class="small">${esc(t('shRole', { role: who.currentTitle ? `${who.currentTitle} · ${code}` : code }))}</p>`
}

export default function shareScreen(t, s) {
  if (!s || s.status === 'loading') return wrap(`<p class="muted"><span class="spin"></span> ${esc(t('ogLoading'))}</p>`)
  if (s.status === 'off') return wrap(banner('b-info', t('ogOff')))
  const existing = s.existing ?? null
  const org = s.join?.orgName ?? existing?.orgName ?? ''
  const message = s.message ? banner(s.message.kind === 'ok' ? 'b-ok' : 'b-bad', s.message.text) : ''
  const hiring = `<p class="tiny muted">${esc(t('ogHiring'))}</p>`

  // an expired, used or own link: told in words; a share that already exists can still be changed or stopped
  const linkProblem = s.joinError ? banner('b-bad', errorText(t, s.joinError)) : ''
  if (!s.join && !existing) {
    return wrap(`${s.joinError ? linkProblem : `<p class="lead">${esc(t('shNoLink'))}</p>`}${message}${hiring}`)
  }

  const group = s.join?.groupName ?? existing?.groupName ?? ''
  const preview = s.preview
  const shared = arr(preview?.shared)
  const list = preview
    ? shared.length
      ? `<p class="small">${esc(t('shSees', { org }))}</p>${roleLine(t, s.join ?? existing)}${skillTable(t, shared)}${notShared(t, arr(preview.notShared))}
         <div class="og-src"><b>${esc(t('ogSource'))}</b> ${esc(t('shSrc', { date: day(arr(s.profiles).find((p) => p.id === s.profileId)?.updatedAt) }))}</div>`
        : `<div class="banner b-info"><div>${esc(t('shNoSkills'))}</div></div>${notShared(t, arr(preview.notShared))}`
    : arr(s.profiles).length ? `<p class="muted"><span class="spin"></span> ${esc(t('shChecking'))}</p>` : ''

  const canShare = shared.length > 0 && (s.join || existing)
  const name = `<div class="field" style="max-width:320px"><label for="shName">${esc(t('shName'))}</label><input class="input" id="shName" maxlength="80" value="${esc(s.displayName ?? '')}"></div>`
  const buttons = canShare
    ? `<div class="row"><button class="btn pri" type="button" data-act="shareDo">${esc(t(existing ? 'shUpdate' : 'shShare'))}</button>${existing ? `<button class="btn" type="button" data-act="shareStop">${esc(t('shStop'))}</button>` : ''}</div>`
    : existing ? `<div class="row"><button class="btn" type="button" data-act="shareStop">${esc(t('shStop'))}</button></div>` : ''
  const already = existing ? banner('b-info', t('shAlready', { org: existing.orgName, group: existing.groupName, name: existing.displayName })) : ''
  return wrap(`<h1>${esc(t('shTitle', { org }))}</h1>
    ${group && s.join ? `<p class="lead">${esc(t('shGroupLine', { group }))}</p>` : ''}
    ${linkProblem}${already}${message}
    <div class="card stack">${chooser(t, s)}${list}${canShare ? name : ''}${buttons}</div>
    ${hiring}`)
}
