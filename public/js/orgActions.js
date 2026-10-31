// Organisation view actions (HR and career centres). Keeps app.js small: createOrgActions({ state, render, api, t, go })
// returns { actions, onChange }. app.js spreads `actions` into its own and calls onChange(el) first in its change
// handler (true = handled). Everything lives in state.org, which is never saved in the browser. A roster preview (names
// and skills of made-up people) and a join link stay in memory only.
const MAX_ROSTER = 1_048_576
const SEARCH_MIN = 2

// Category C or D: signed in → the organisation screen; otherwise the access screen with a note.
export const orgEntry = (state) => (state?.account?.status === 'in' ? { screen: 'org', note: null } : { screen: 'access', note: 'ogNeedAccount' })

const fresh = () => ({ status: 'loading', tab: 'setup', view: 'current', scenario: 'moderate', page: 0, sel: null, data: null, team: null, teamError: false, message: null, titles: {} })
const field = (id) => globalThis.document?.getElementById(id)?.value ?? ''

export function createOrgActions({ state, render, api, t, go = () => {} }) {
  let teamRun = 0
  const org = () => (state.org ??= fresh())
  const say = (kind, text) => { org().message = { kind, text } }
  const errText = (code) => (t(`ogErr_${code}`) === `ogErr_${code}` ? t('ogErr_other') : t(`ogErr_${code}`))
  const fail = (out) => { say('bad', errText(out.code)); render() }

  // a group, plan or join-link choice that no longer exists falls back to the first group
  function syncGroups() {
    const o = org()
    const ids = (o.team?.groups ?? o.data?.groups ?? []).map((g) => g.id)
    for (const key of ['planGroup', 'sdgGroup', 'inviteGroup']) if (!ids.includes(o[key])) o[key] = ids[0] ?? null
  }

  async function loadTeam() {
    const o = org()
    const run = ++teamRun
    const out = await api.team(o.view, o.scenario)
    if (run !== teamRun) return
    if (out.ok) {
      o.team = out.data
      o.view = out.data.view === 'target' ? 'target' : 'current'
      o.teamError = false
      syncGroups()
    } else {
      o.teamError = true
    }
    render()
  }

  // The organisation and its groups first (shown at once), then the team numbers.
  async function load() {
    const o = org()
    const out = await api.getOrg()
    if (!out.ok) {
      if (out.code === 'no_organisation') Object.assign(o, { status: 'none', data: null, team: null, tab: 'setup' })
      else if (out.code === 'accounts_unavailable') o.status = 'off'
      else if (out.code === 'not_signed_in') {
        state.account = { status: 'none', user: null }
        state.accessNote = 'ogNeedAccount'
        state.org = null
        return go('access')
      } else Object.assign(o, { status: 'error', code: out.code })
      return render()
    }
    o.status = 'ready'
    o.data = out.data
    syncGroups()
    render()
    await loadTeam()
  }

  const confirmed = (text) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(text) : true)

  async function previewFrom(text, name) {
    const o = org()
    if (text.length > MAX_ROSTER) {
      say('bad', errText('too_large'))
      return render()
    }
    const out = await api.previewRoster(text)
    if (!out.ok) {
      o.preview = null
      return fail(out)
    }
    o.preview = { ...out.data, name }
    o.message = null
    render()
  }

  async function setStatus(itemKey, status) {
    const o = org()
    const groupId = o.planGroup
    const plan = o.team?.plans?.[groupId]
    const step = plan?.steps?.find((s) => s.key === itemKey)
    if (!plan?.roleCode || !step) return
    const before = step.status
    step.status = status
    render()
    const out = await api.setPlanStep({ groupId, roleCode: plan.roleCode, itemKey, status })
    if (!out.ok) {
      step.status = before
      fail(out)
    }
  }

  async function searchRoles(forKey, term) {
    const o = org()
    if (term.length < SEARCH_MIN) return
    o.roleSearch = { for: forKey, term, busy: true }
    render()
    const out = await api.searchRoles(term)
    if (o.roleSearch?.term !== term || o.roleSearch?.for !== forKey) return
    o.roleSearch = out.ok ? { for: forKey, term, results: out.data } : { for: forKey, term, failed: true }
    render()
  }

  const actions = {
    // Called by every render of #org: signed-in users load their organisation once; others are sent to sign in.
    orgEnsure: async () => {
      if (state.screen !== 'org') return
      const status = state.account?.status
      if (status === 'off') {
        state.org = { status: 'off' }
        return
      }
      if (status === 'none') {
        state.accessNote = 'ogNeedAccount'
        await Promise.resolve()
        return go('access')
      }
      if (status !== 'in' || state.org) return
      org()
      await load()
    },
    orgRetry: async () => {
      state.org = fresh()
      render()
      await load()
    },
    orgTab: (tab) => {
      const o = org()
      o.tab = ['setup', 'people', 'heat', 'plan', 'outlook'].includes(tab) ? tab : 'setup'
      o.message = null
      o.link = null
      render()
      globalThis.scrollTo?.(0, 0)
      if (o.teamError) return loadTeam()
    },
    orgView: (view) => {
      const o = org()
      o.view = view === 'target' ? 'target' : 'current'
      o.sel = null
      o.page = 0
      return loadTeam()
    },
    // The scenario changes only the outlook parts: the team is asked again with it.
    orgScenario: (scenario) => {
      org().scenario = scenario === 'rapid' ? 'rapid' : 'moderate'
      return loadTeam()
    },
    orgPage: (n) => {
      org().page = Math.max(0, Number(n) || 0)
      render()
    },
    orgCell: (arg) => {
      const at = String(arg ?? '').indexOf('|')
      if (at < 1) return
      org().sel = { groupId: arg.slice(0, at), key: arg.slice(at + 1) }
      render()
    },
    orgToPlan: (groupId) => {
      const o = org()
      o.planGroup = groupId
      o.tab = 'plan'
      render()
      globalThis.scrollTo?.(0, 0)
    },

    // ---- setup
    orgDraftType: (type) => {
      const o = org()
      o.draftName = field('ogName') || o.draftName || ''
      o.draftType = type === 'centre' ? 'centre' : 'hr'
      render()
    },
    orgCreate: async () => {
      const o = org()
      const name = field('ogName').trim()
      if (!name) return
      const out = await api.createOrg(name, o.draftType === 'centre' ? 'centre' : 'hr')
      if (!out.ok) return fail(out)
      o.draftName = ''
      o.tab = 'setup'
      await load()
    },
    orgRename: async () => {
      const name = field('ogName').trim()
      if (!name) return
      const out = await api.renameOrg(name)
      if (!out.ok) return fail(out)
      say('ok', t('ogSaved'))
      await load()
    },
    orgDeleteOrg: async () => {
      if (!confirmed(t('ogDeleteOrgConfirm'))) return
      const out = await api.deleteOrg()
      if (!out.ok) return fail(out)
      state.org = { ...fresh(), status: 'none' }
      render()
    },
    orgAddGroup: async () => {
      const name = field('ogNewGroup').trim()
      if (!name) return
      const out = await api.addGroup(name)
      if (!out.ok) return fail(out)
      org().message = null
      await load()
    },
    orgDelGroup: async (id) => {
      const out = await api.deleteGroup(id)
      if (!out.ok) return fail(out)
      org().message = null
      await load()
    },
    orgClearTarget: async (id) => {
      const out = await api.updateGroup(id, { targetCode: null })
      if (!out.ok) return fail(out)
      await load()
    },
    orgRoleOpen: (forKey) => {
      org().roleSearch = { for: forKey, term: '' }
      render()
      globalThis.document?.getElementById('ogRoleQ')?.focus()
    },
    orgRoleClose: () => {
      org().roleSearch = null
      render()
    },
    orgRolePick: async (i) => {
      const o = org()
      const rs = o.roleSearch
      const pick = rs?.results?.[Number(i)]
      if (!pick) return
      o.titles = { ...o.titles, [pick.code]: pick.title }
      o.roleSearch = null
      if (rs.for === 'invite') {
        o.inviteCode = pick.code
        return render()
      }
      const out = await api.updateGroup(rs.for.replace(/^g:/, ''), { targetCode: pick.code })
      if (!out.ok) return fail(out)
      await load()
    },
    orgInviteRoleClear: () => {
      org().inviteCode = null
      render()
    },

    // ---- people
    orgChooseFile: () => globalThis.document?.getElementById('ogFile')?.click(),
    orgSample: async () => {
      const o = org()
      const out = await api.sampleRoster(o.data?.org?.type ?? 'hr')
      if (!out.ok) return fail(out)
      await previewFrom(out.data, 'sample-roster-hr.csv')
    },
    orgImport: async () => {
      const o = org()
      if (!o.preview?.previewId) return
      const out = await api.importRoster(o.preview.previewId)
      o.preview = null
      if (!out.ok) return fail(out)
      say('ok', t('ogImported', { people: out.data.added ?? 0 }))
      await load()
    },
    orgCancelImport: () => {
      const o = org()
      o.preview = null
      say('ok', t('ogNothingSavedMsg'))
      render()
    },
    orgDelPerson: async (id) => {
      const o = org()
      const person = (o.team?.people ?? o.data?.people ?? []).find((p) => p.id === id)
      if (!confirmed(`${t('ogRemovePerson', { name: person?.displayName ?? '' })}?`)) return
      const out = await api.deletePerson(id)
      if (!out.ok) return fail(out)
      await load()
    },
    orgInvite: async () => {
      const o = org()
      const groupId = field('ogInviteGroup') || o.inviteGroup
      if (!groupId) return
      o.inviteGroup = groupId
      const out = await api.invite(groupId, o.data?.org?.type === 'hr' ? o.inviteCode ?? null : null)
      if (!out.ok) return fail(out)
      o.link = { url: `${globalThis.location?.origin ?? ''}${out.data.url}`, expiresAt: out.data.expiresAt }
      o.message = null
      render()
    },
    orgCopy: async () => {
      const o = org()
      try {
        await globalThis.navigator.clipboard.writeText(o.link?.url ?? '')
        say('ok', t('ogCopied'))
      } catch {
        say('bad', t('ogCopyFail'))
      }
      render()
    },
  }

  // Form controls of these screens. true = handled here (app.js stops), false = not ours.
  function onChange(el) {
    const d = el?.dataset ?? {}
    if (d.orgStatus !== undefined) {
      setStatus(d.orgStatus, el.value)
      return true
    }
    if (d.orgRole !== undefined) {
      searchRoles(d.orgRole, String(el.value ?? '').trim())
      return true
    }
    if (d.orgMove !== undefined) {
      api.updatePerson(d.orgMove, { groupId: el.value }).then((out) => (out.ok ? load() : fail(out)))
      return true
    }
    if (el?.id === 'ogFile') {
      const file = el.files?.[0]
      if (file) {
        if (file.size > MAX_ROSTER) {
          say('bad', errText('too_large'))
          render()
        } else {
          file.text().then((text) => previewFrom(text, file.name))
        }
        try { el.value = '' } catch { /* some browsers refuse; the next pick still fires */ }
      }
      return true
    }
    if (el?.id === 'ogPlanGroup' || el?.id === 'ogSdgGroup' || el?.id === 'ogInviteGroup') {
      const key = { ogPlanGroup: 'planGroup', ogSdgGroup: 'sdgGroup', ogInviteGroup: 'inviteGroup' }[el.id]
      org()[key] = el.value
      if (el.id !== 'ogInviteGroup') render()
      return true
    }
    return false
  }

  return { actions, onChange }
}
