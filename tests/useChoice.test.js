import { describe, expect, it } from 'vitest'
import welcome from '../public/js/screens/welcome.js'
import category from '../public/js/screens/category.js'
import access from '../public/js/screens/access.js'
import { t as translate } from '../shared/i18n.js'

const t = (key) => key
const choices = (html) => [...html.matchAll(/data-act="category" data-arg="(\w+)"/g)].map(([, k]) => k)

describe('first question: personal or organisation', () => {
  it('the landing page leads on to the question: who it is for, for myself or for my organisation', () => {
    expect(welcome({ t, state: { lang: 'en' } })).toContain('data-go="access"')
    const html = access({ t, state: {} })
    expect(html).toContain('useTitle')
    expect(html).toContain('data-act="use" data-arg="personal"')
    expect(html).toContain('data-act="use" data-arg="org"')
    expect(html).not.toContain('data-act="guest"')
    for (const lang of ['en', 'ms', 'zh']) {
      const page = access({ t: (key, vars) => translate(lang, key, vars), state: {} })
      for (const key of ['useTitle', 'usePersonal', 'usePersonalText', 'useOrg', 'useOrgText']) expect(page).toContain(translate(lang, key))
    }
  })

  it('sent to sign in from a join link or the organisation tools, the question is skipped', () => {
    expect(access({ t, state: { accessNote: 'shNeedAccount' } })).toContain('data-act="guest"')
    expect(access({ t, state: { accessNote: 'ogNeedAccount' } })).toContain('accessOrgTitle')
    expect(access({ t, state: { accessNote: 'ogNeedAccount' } })).not.toContain('data-act="use" data-arg="org"')
  })

  it('organisations then choose C or D on "Who are you?"', () => {
    expect(choices(category({ t, state: { use: 'org' } }))).toEqual(['C', 'D'])
  })
})

describe('guest or account, by the answer to the first question', () => {
  it('personal: continue as a guest or sign up for an account', () => {
    const html = access({ t, state: { use: 'personal', account: { status: 'none' } } })
    expect(html).toContain('data-act="guest"')
    expect(html).toContain('data-act="acSignup"')
  })

  it('organisation: an account is needed, so there is no guest option', () => {
    const html = access({ t, state: { use: 'org', account: { status: 'none' } } })
    expect(html).not.toContain('data-act="guest"')
    expect(html).toContain('accessOrgTitle')
    expect(html).toContain('data-act="acSignup"')
    expect(html).toContain('data-act="acLogin"')
  })

  it('organisation on a server without accounts: says so and offers the personal journey, never "continue as guest"', () => {
    const html = access({ t, state: { use: 'org', account: { status: 'off' } } })
    expect(html).not.toContain('data-act="guest"')
    expect(html).not.toContain('acOff')
    expect(html).toContain('acOrgOff')
    expect(html).toContain('data-act="use" data-arg="personal"')
  })
})
