// Employee share screen: the join link is read once and kept only in memory, the screen shows exactly what HR will
// see, the actions call join / dry run / share / stop in order. No browser here: fake api, state and document.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t as translate } from '../../shared/i18n.js'
import en from '../../shared/strings/en.js'
import ms from '../../shared/strings/ms.js'
import zh from '../../shared/strings/zh.js'
import shareScreen from '../../public/js/screens/orgShare.js'
import { consumeJoinHash, createOrgActions, takeJoinToken } from '../../public/js/orgActions.js'

const t = (key, vars) => translate('en', key, vars)
const EXPIRED = 'This link has expired or was already used. Ask HR for a new one.'
const NOT_ONET = 'not an O*NET skill or knowledge item'

const base = (extra = {}) => ({
  status: 'ready',
  join: { orgName: 'Sample Logistics', groupName: 'Finance', willShare: ['skill names and levels', 'group', 'role', 'display name'] },
  joinError: null,
  existing: null,
  profiles: [{ id: 'pr1', updatedAt: '2026-10-30T08:00:00Z' }, { id: 'pr2', updatedAt: '2026-10-01T08:00:00Z' }],
  profileId: 'pr1',
  displayName: '',
  preview: {
    shared: [{ key: 'kn:2.C.4.a', name: 'Economics and Accounting', level: 'good' }, { key: 'el:2.A.1.a', name: 'Critical Thinking', level: 'not_assessed' }],
    notShared: [{ name: 'Team <b>leadership</b>', reason: NOT_ONET }],
  },
  message: null,
  ...extra,
})

describe('the join link stays out of the address bar', () => {
  it('takeJoinToken reads only #join=<token>', () => {
    expect(takeJoinToken('#join=abc_DEF-123')).toBe('abc_DEF-123')
    expect(takeJoinToken('#org')).toBeNull()
    expect(takeJoinToken('')).toBeNull()
    expect(takeJoinToken('#join=')).toBeNull()
    expect(takeJoinToken('#join=a b')).toBeNull()
  })

  it('consumeJoinHash returns the token and leaves no token in location.hash', () => {
    const location = { hash: '#join=tok123', pathname: '/', search: '?x=1' }
    const history = { replaceState: vi.fn((_s, _t, url) => { location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '' }) }
    expect(consumeJoinHash(location, history)).toBe('tok123')
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?x=1')
    expect(location.hash).toBe('')
    expect(JSON.stringify(history.replaceState.mock.calls)).not.toContain('tok123')
  })

  it('consumeJoinHash leaves other hashes alone', () => {
    const history = { replaceState: vi.fn() }
    expect(consumeJoinHash({ hash: '#org', pathname: '/', search: '' }, history)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })
})

describe('share screen', () => {
  it('lists exactly the skills HR will see, with levels, and the not shared ones with the reason', () => {
    const html = shareScreen(t, base())
    expect(html).toContain('Share my skills with Sample Logistics')
    expect(html).toContain('Economics and Accounting')
    expect(html).toContain('Critical Thinking')
    expect(html.match(/<tr>/g)?.length ?? 0).toBe(3) // header + 2 skills
    expect(html).toContain('good')
    expect(html).toContain('Not assessed yet')
    expect(html).toContain('Not shared')
    expect(html).toContain('Team &lt;b&gt;leadership&lt;/b&gt;')
    expect(html).not.toContain('<b>leadership')
    expect(html).toContain(t('shNotOnet'))
    expect(html).toContain('This helps plan training. It does not make hiring decisions.')
    expect(html).toContain('Finance')
  })

  it('shows its source with the profile date', () => {
    const html = shareScreen(t, base())
    expect(html).toContain(t('ogSource'))
    expect(html).toContain('2026-10-30')
  })

  it('first share: Share my skills, no Update or Stop', () => {
    const html = shareScreen(t, base())
    expect(html).toContain('data-act="shareDo"')
    expect(html).toContain('Share my skills</button>')
    expect(html).not.toContain('Update shared skills')
    expect(html).not.toContain('data-act="shareStop"')
    expect(html).toContain('id="shName"')
  })

  it('once shared: Update shared skills and Stop sharing', () => {
    const html = shareScreen(t, base({ existing: { orgName: 'Sample Logistics', groupName: 'Finance', displayName: 'Aisyah R.', skills: [] }, displayName: 'Aisyah R.' }))
    expect(html).toContain('Update shared skills')
    expect(html).toContain('data-act="shareStop"')
    expect(html).toContain('value="Aisyah R."')
  })

  it('the display name is escaped', () => {
    const html = shareScreen(t, base({ displayName: '"><script>x</script>' }))
    expect(html).not.toContain('<script>')
  })

  it('the profile chooser lists the saved profiles', () => {
    const html = shareScreen(t, base())
    expect(html).toContain('id="shProfile"')
    expect(html).toContain('value="pr1"')
    expect(html).toContain('value="pr2"')
  })

  it('no saved profile: a link to build one, nothing to share', () => {
    const html = shareScreen(t, base({ profiles: [], profileId: null, preview: null }))
    expect(html).toContain(t('shNoProfile'))
    expect(html).toContain('data-go="source"')
    expect(html).not.toContain('data-act="shareDo"')
  })

  it('an expired link shows the exact message', () => {
    const html = shareScreen(t, base({ join: null, joinError: 'link_expired', preview: null }))
    expect(html).toContain(EXPIRED)
    expect(html).not.toContain('data-act="shareDo"')
  })

  it('a profile with no O*NET skills says so and cannot be shared', () => {
    const html = shareScreen(t, base({ preview: { shared: [], notShared: [{ name: 'Cooking', reason: NOT_ONET }] } }))
    expect(html).toContain(t('shNoSkills'))
    expect(html).not.toContain('data-act="shareDo"')
  })

  it('loading, off, no link and no state', () => {
    expect(shareScreen(t, null)).toContain('spin')
    expect(shareScreen(t, { status: 'loading' })).toContain('spin')
    expect(shareScreen(t, { status: 'off' })).toContain(t('ogOff'))
    expect(shareScreen(t, base({ join: null, joinError: null, existing: null, preview: null }))).toContain(t('shNoLink'))
  })

  it('a share with no link open still offers update and stop', () => {
    const html = shareScreen(t, base({ join: null, existing: { orgName: 'Sample Logistics', groupName: 'Finance', displayName: 'Aisyah R.', skills: [] } }))
    expect(html).toContain('data-act="shareStop"')
    expect(html).toContain('Sample Logistics')
  })

  it('messages are escaped', () => {
    const html = shareScreen(t, base({ message: { kind: 'bad', text: '<i>x</i>' } }))
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;')
  })
})

describe('strings', () => {
  it('every sh and shErr key exists in all three languages', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('sh'))
    expect(keys.length).toBeGreaterThan(10)
    for (const k of keys) {
      expect(ms[k], `ms ${k}`).toBeTruthy()
      expect(zh[k], `zh ${k}`).toBeTruthy()
    }
    expect(en.shErr_link_expired).toBe(EXPIRED)
  })
})

describe('share actions', () => {
  afterEach(() => { delete globalThis.document; delete globalThis.confirm })

  function setup({ account = { status: 'in', user: { id: 'u1' } }, api = {}, token = 'tok' } = {}) {
    const state = { screen: 'share', account, share: null }
    const render = vi.fn()
    const go = vi.fn()
    const fakeApi = {
      joinOrg: vi.fn(async () => ({ ok: true, data: { orgName: 'Sample Logistics', groupName: 'Finance', willShare: [] } })),
      listProfiles: vi.fn(async () => ({ ok: true, data: { profiles: [{ id: 'pr1', updatedAt: '2026-10-30T08:00:00Z' }] } })),
      getShare: vi.fn(async () => ({ ok: true, data: null })),
      previewShare: vi.fn(async () => ({ ok: true, data: { shared: [{ key: 'kn:1', name: 'Biology', level: 'good' }], notShared: [] } })),
      putShare: vi.fn(async () => ({ ok: true, data: { shared: [{ key: 'kn:1', name: 'Biology', level: 'good' }], notShared: [] } })),
      stopShare: vi.fn(async () => ({ ok: true, data: { stopped: true } })),
      ...api,
    }
    const value = { shName: 'Aini', shProfile: 'pr1' }
    globalThis.document = { getElementById: (id) => (id in value ? { value: value[id] } : null) }
    const built = createOrgActions({ state, render, api: fakeApi, t, go })
    if (token) built.startJoin(token)
    return { state, render, go, api: fakeApi, ...built, value }
  }

  it('signed in with a link: joins, lists saved profiles, runs the dry run', async () => {
    const s = setup()
    await s.actions.shareEnsure()
    expect(s.api.joinOrg).toHaveBeenCalledWith('tok')
    expect(s.api.previewShare).toHaveBeenCalledWith({ profileId: 'pr1' })
    expect(s.state.share.status).toBe('ready')
    expect(s.state.share.join.orgName).toBe('Sample Logistics')
    expect(s.state.share.preview.shared).toHaveLength(1)
    expect(JSON.stringify(s.state.share)).not.toContain('tok"')
  })

  it('not signed in: sends to the access screen with a note, and the link stays pending', async () => {
    const s = setup({ account: { status: 'none', user: null } })
    await s.actions.shareEnsure()
    expect(s.state.accessNote).toBe('shNeedAccount')
    expect(s.go).toHaveBeenCalledWith('access')
    expect(s.api.joinOrg).not.toHaveBeenCalled()
    expect(s.joinPending()).toBe(true)
  })

  it('account state not known yet: does nothing', async () => {
    const s = setup({ account: {} })
    await s.actions.shareEnsure()
    expect(s.go).not.toHaveBeenCalled()
    expect(s.api.joinOrg).not.toHaveBeenCalled()
  })

  it('an expired link: joinError link_expired, no dry run', async () => {
    const s = setup({ api: { joinOrg: vi.fn(async () => ({ ok: false, code: 'link_expired', retryable: false })) } })
    await s.actions.shareEnsure()
    expect(s.state.share.joinError).toBe('link_expired')
    expect(s.api.previewShare).not.toHaveBeenCalled()
    expect(shareScreen(t, s.state.share)).toContain(EXPIRED)
  })

  it('share sends the token and name, then forgets the token', async () => {
    const s = setup({ api: { getShare: vi.fn().mockResolvedValueOnce({ ok: true, data: null }).mockResolvedValue({ ok: true, data: { orgName: 'Sample Logistics', groupName: 'Finance', displayName: 'Aini', skills: [] } }) } })
    await s.actions.shareEnsure()
    await s.actions.shareDo()
    expect(s.api.putShare).toHaveBeenCalledWith({ token: 'tok', displayName: 'Aini', profileId: 'pr1' })
    expect(s.joinPending()).toBe(false)
    expect(s.state.share.existing.displayName).toBe('Aini')
    expect(s.state.share.message.kind).toBe('ok')
  })

  it('share without a name asks for one and calls nothing', async () => {
    const s = setup()
    await s.actions.shareEnsure()
    s.value.shName = '  '
    await s.actions.shareDo()
    expect(s.api.putShare).not.toHaveBeenCalled()
    expect(s.state.share.message.kind).toBe('bad')
  })

  it('an expired link at share time shows the message and keeps the screen', async () => {
    const s = setup({ api: { putShare: vi.fn(async () => ({ ok: false, code: 'link_expired', retryable: false })) } })
    await s.actions.shareEnsure()
    await s.actions.shareDo()
    expect(s.state.share.message.text).toBe(EXPIRED)
  })

  it('stop sharing clears the share', async () => {
    globalThis.confirm = () => true
    const s = setup({ token: null, api: { getShare: vi.fn(async () => ({ ok: true, data: { orgName: 'Sample Logistics', groupName: 'Finance', displayName: 'Aini', skills: [] } })) } })
    await s.actions.shareEnsure()
    expect(s.state.share.existing.displayName).toBe('Aini')
    await s.actions.shareStop()
    expect(s.api.stopShare).toHaveBeenCalled()
    expect(s.state.share.existing).toBeNull()
  })

  it('changing the profile runs the dry run again', async () => {
    const s = setup()
    await s.actions.shareEnsure()
    s.api.previewShare.mockClear()
    s.value.shProfile = 'pr9'
    expect(s.onChange({ id: 'shProfile', value: 'pr9' })).toBe(true)
    await Promise.resolve()
    expect(s.api.previewShare).toHaveBeenCalledWith({ profileId: 'pr9' })
  })
})
