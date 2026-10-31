// Organisation view actions (HR and career centres). Keeps app.js small: createOrgActions({ state, render, api, t, go })
// returns { actions, onChange }. app.js spreads `actions` into its own and calls onChange(el) first in its change
// handler (true = handled). Everything lives in state.org, which is never saved in the browser. A roster preview (names
// and skills of made-up people) and a join link stay in memory only.
import { roleList } from './screens/orgParts.js'

const MAX_ROSTER = 1_048_576
const SEARCH_MIN = 2
// The pause after the last keystroke before the role suggestions are searched (same as the profile pickers).
const SEARCH_DELAY_MS = 250

// Category C or D: signed in → the organisation screen; otherwise the access screen with a note.
export const orgEntry = (state) => (state?.account?.status === 'in' ? { screen: 'org', note: null } : { screen: 'access', note: 'ogNeedAccount' })

// The join link: `#join=<token>`. The token is read once at load, kept in memory only (never in the saved state, never
// logged) and removed from the address bar at once.
const JOIN_HASH = /^#join=([A-Za-z0-9_-]{1,200})$/
export const takeJoinToken = (hash) => JOIN_HASH.exec(String(hash ?? ''))?.[1] ?? null
export function consumeJoinHash(location, history) {
  const token = takeJoinToken(location?.hash)
  if (token) history.replaceState(null, '', `${location.pathname ?? '/'}${location.search ?? ''}`)
  return token
}

const fresh = () => ({ status: 'loading', tab: 'setup', view: 'current', scenario: 'moderate', page: 0, sel: null, data: null, team: null, teamError: false, message: null, titles: {} })
const field = (id) => globalThis.document?.getElementById(id)?.value ?? ''

export function createOrgActions({ state, render, api, t, go = () => {} }) {
  let teamRun = 0
  let previewRun = 0
  let joinToken = null // employee join link: memory only
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

  const groupName = (id) => (org().team?.groups ?? org().data?.groups ?? []).find((g) => g.id === id)?.name ?? ''
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

  // listOnly (while typing): redraw only the suggestions under the box, so its text, caret and focus stay.
  const refreshRoles = () => {
    const el = globalThis.document?.getElementById('og-role-list')
    if (el) el.innerHTML = roleList(t, org())
  }
  async function searchRoles(forKey, term, { listOnly = false } = {}) {
    const o = org()
    const show = listOnly ? refreshRoles : render
    if (term.length < SEARCH_MIN) {
      if (listOnly) {
        o.roleSearch = { for: forKey, term }
        show()
      }
      return
    }
    o.roleSearch = { for: forKey, term, busy: true }
    show()
    const out = await api.searchRoles(term)
    if (o.roleSearch?.term !== term || o.roleSearch?.for !== forKey) return
    o.roleSearch = out.ok ? { for: forKey, term, results: out.data } : { for: forKey, term, failed: true }
    show()
  }
  let roleTimer = null


  // ---- employee: join link and sharing (state.share, never saved in the browser)
  const sh = () => (state.share ??= { status: 'loading', join: null, joinError: null, existing: null, profiles: null, profileId: null, displayName: '', preview: null, message: null })
  const shErr = (code) => (t(`shErr_${code}`) === `shErr_${code}` ? errText(code) : t(`shErr_${code}`))
  const shSay = (kind, text) => { sh().message = { kind, text } }

  async function previewShare() {
    const s = sh()
    if (!s.profileId) return
    const run = ++previewRun
    s.preview = null
    render()
    const out = await api.previewShare({ profileId: s.profileId })
    if (run !== previewRun) return
    if (out.ok) {
      s.preview = out.data
      if (s.message?.kind === 'bad') s.message = null
    } else {
      shSay('bad', shErr(out.code))
    }
    render()
  }

  async function loadShare() {
    const s = sh()
    const [joined, profiles, mine] = await Promise.all([joinToken ? api.joinOrg(joinToken) : null, api.listProfiles(), api.getShare()])
    if ([joined, profiles, mine].some((out) => out && !out.ok && out.code === 'not_signed_in')) {
      state.account = { status: 'none', user: null }
      state.accessNote = 'shNeedAccount'
      state.share = null
      return go('access')
    }
    if ([joined, profiles, mine].some((out) => out && !out.ok && out.code === 'accounts_unavailable')) {
      state.share = { status: 'off' }
      return render()
    }
    s.join = joined?.ok ? joined.data : null
    s.joinError = joined && !joined.ok ? joined.code : null
    // a link that cannot be used any more is forgotten, so signing in again does not bring it back
    if (s.joinError) joinToken = null
    s.existing = mine?.ok ? mine.data ?? null : null
    s.profiles = profiles?.ok ? profiles.data?.profiles ?? [] : []
    s.profileId = s.profiles[0]?.id ?? null
    s.displayName = s.existing?.displayName ?? ''
    s.status = 'ready'
    render()
    if (s.join || s.existing) await previewShare()
  }

  const actions = {

    // ---- employee share screen
    shareEnsure: async () => {
      if (state.screen !== 'share') return
      const status = state.account?.status
      if (status === 'off') {
        state.share = { status: 'off' }
        return
      }
      if (status === 'none') {
        state.accessNote = 'shNeedAccount'
        await Promise.resolve()
        return go('access')
      }
      if (status !== 'in' || state.share) return
      sh()
      await loadShare()
    },
    shareDo: async () => {
      const s = sh()
      const name = field('shName').trim()
      s.displayName = name
      if (!name) {
        shSay('bad', t('shNameNeeded'))
        return render()
      }
      if (!s.profileId) return
      const out = await api.putShare({ token: joinToken ?? undefined, displayName: name, profileId: s.profileId })
      if (!out.ok) {
        if (out.code === 'link_expired') joinToken = null
        shSay('bad', shErr(out.code))
        return render()
      }
      // a link of another organisation makes a new share (the old one is stopped by the server), not an update
      const updated = Boolean(s.existing) && !s.join?.sharingWith
      joinToken = null // the link is used now
      if (s.join?.sharingWith) {
        const { sharingWith, ...rest } = s.join
        s.join = rest
      }
      s.preview = out.data
      const mine = await api.getShare()
      s.existing = mine.ok ? mine.data ?? null : s.existing
      s.joinError = null
      shSay('ok', t(updated ? 'shUpdated' : 'shDone', { org: s.join?.orgName ?? s.existing?.orgName ?? '' }))
      render()
    },
    shareStop: async () => {
      if (!confirmed(t('shStopConfirm'))) return
      const out = await api.stopShare()
      const s = sh()
      if (!out.ok) {
        shSay('bad', shErr(out.code))
        return render()
      }
      s.existing = null
      s.join = null
      s.preview = null
      shSay('ok', t('shStopped'))
      render()
    },
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
      if (!confirmed(t('ogDelGroupConfirm', { group: groupName(id) }))) return
      const out = await api.deleteGroup(id)
      if (!out.ok) return fail(out)
      org().message = null
      await load()
    },
    orgClearTarget: async (id) => {
      if (!confirmed(t('ogClearTargetConfirm', { group: groupName(id) }))) return
      const out = await api.updateGroup(id, { targetCode: null })
      if (!out.ok) return fail(out)
      await load()
    },
    // A department's box opens with roles matching the department's name; the join-link box opens empty.
    orgRoleOpen: async (forKey) => {
      const o = org()
      const id = typeof forKey === 'string' && forKey.startsWith('g:') ? forKey.slice(2) : null
      const name = id ? String((o.data?.groups ?? []).find((g) => g.id === id)?.name ?? '').trim() : ''
      o.roleSearch = { for: forKey, term: name }
      render()
      const focus = () => globalThis.document?.getElementById('ogRoleQ')?.focus()
      focus()
      if (name.length >= SEARCH_MIN) {
        await searchRoles(forKey, name)
        focus()
      }
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
      const type = o.data?.org?.type === 'centre' ? 'centre' : 'hr'
      const out = await api.sampleRoster(type)
      if (!out.ok) return fail(out)
      await previewFrom(out.data, `sample-roster-${type}.csv`)
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
    if (el?.id === 'shProfile') {
      const s = sh()
      s.displayName = field('shName') || s.displayName
      s.profileId = String(el.value ?? '')
      previewShare()
      return true
    }
    if (el?.id === 'shName') {
      sh().displayName = String(el.value ?? '')
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

  // Typing in the role box: search after a short pause; only the last keystroke counts. true = handled here.
  function onInput(el) {
    const forKey = el?.dataset?.orgRole
    if (forKey === undefined) return false
    const term = String(el.value ?? '').trim()
    clearTimeout(roleTimer)
    roleTimer = setTimeout(() => searchRoles(forKey, term, { listOnly: true }), SEARCH_DELAY_MS)
    return true
  }

  return { actions, onChange, onInput, startJoin: (token) => { joinToken = token },
    // sign-out or reset: the pending link and everything on the share screen are forgotten
    clearJoin: () => { joinToken = null; previewRun++; state.share = null }, joinPending: () => Boolean(joinToken) }
}
