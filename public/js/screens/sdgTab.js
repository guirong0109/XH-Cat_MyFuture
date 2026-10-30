// SDG contribution screen (#sdg), as in the owner-approved mockup (spec §7, §8): the approved SDG links on the path of
// the role the user chose — the role's own group links plus the links of the items still to learn or raise for its
// best O*NET job. A count of links with reasons, per goal: potential, not measured. Never an impact number.
import { esc } from '../ui.js'
import { day, loadedDetail, reasonIn } from './match.js'

export function sdgView({ t, state }) {
  const m = state?.match ?? {}
  const lang = state?.lang ?? 'en'
  const head = `<h1>${esc(t('sdg'))}</h1><p class="lead">${esc(t('mtSdgLead'))} <b>${esc(t('mtPotential'))}</b>.</p>`
  const chosen = typeof m.chosen === 'string' ? m.chosen : null
  if (!chosen) {
    return `<div class="mt">${head}<div class="card"><h3>${esc(t('mtSdgNoRole'))}</h3><p class="small muted">${esc(t('mtSdgNoRoleText'))}</p>
      <div class="mt-actions"><button class="btn pri" type="button" data-go="match">${esc(t('mtGoMatch'))}</button></div></div></div>`
  }
  const raw = m.details?.[chosen]
  const d = loadedDetail(raw)
  if (!d) {
    const body = raw?.error
      ? `<div class="banner b-bad"><div>${esc(t('mtDetailError'))}</div><button class="btn sm" type="button" data-act="mDetail" data-arg="${esc(chosen)}">${esc(t('mtRetry'))}</button></div>`
      : `<p class="muted"><span class="spin"></span> ${esc(t('mtLoading'))}</p>`
    return `<div class="mt">${head}${body}</div>`
  }
  const tags = d.sdg?.tags ?? []
  const goals = d.sdg?.pathPreview?.goals ?? []
  const summary = goals.length
    ? `${esc(t('mtSdgLinksTo'))} ${goals.map((g) => `<b>${esc(t(g.count === 1 ? 'mtSdgGoalOne' : 'mtSdgGoalMany', { goal: g.goal, count: g.count }))}</b>`).join(', ')}.`
    : `<span class="tag mt-none">${esc(t('mtSdgNone'))}</span> ${esc(t('mtSdgNoneText'))}`
  const rows = goals.map((g) => {
    const links = (g.links ?? []).map((l) => {
      const own = l.via?.kind === 'role' ? tags.find((x) => x.target === l.target) : null
      const via = l.via?.kind === 'item' ? t('mtViaItem', { name: l.via.name ?? l.via.code ?? '' }) : t('mtViaRole', { code: l.via?.code ?? '' })
      const title = own?.targetTitle ? ` <span class="tiny muted">${esc(own.targetTitle)}</span>` : ''
      const when = own?.approvedAt ? t('mtApprovedDraft', { date: day(own.approvedAt) }) : t('mtApprovedDraftNoDate')
      return `<div class="small mt-sdglink"><b>${esc(t('mtTarget', { target: l.target }))}</b>${title} · ${esc(via)}<br>${esc(reasonIn(l.reason, lang))}<div class="tiny muted">${esc(when)}</div></div>`
    }).join('')
    return `<div class="mt-sdgrow"><div><span class="mt-sdgdot"></span><b>SDG ${esc(g.goal)}</b></div><div>${links}</div></div>`
  }).join('')
  const targets = (m.data?.sources ?? []).find((s) => s.id === 'sdg-targets')
  return `<div class="mt">${head}<div class="card">
    <div class="row mt-sdghead"><div><div class="tiny muted">${esc(t('mtSdgPath'))}</div><h3 class="mt-sdgttl">${esc(d.title)} <span class="mt-code">MASCO ${esc(d.code)}</span></h3></div>
      <span class="tag t-est">${esc(t('mtPotential'))}</span></div>
    <p class="small mt-gap">${summary}</p>
    ${rows}
    <div class="mt-src">${esc(t('mtSdgSrc', { date: day(targets?.date) }))}</div>
  </div></div>`
}

export default ({ t, state }) => sdgView({ t, state })
