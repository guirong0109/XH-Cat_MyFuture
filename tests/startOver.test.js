import { describe, expect, it } from 'vitest'
import { startOver } from '../shared/guestStore.js'

describe('startOver', () => {
  const blank = { screen: 'welcome', lang: 'en', profile: null }

  it('keeps the sign-in answer, so the account box does not wait forever', () => {
    const before = { screen: 'form', lang: 'ms', profile: { a: 1 }, account: { status: 'none', user: null } }
    expect(startOver(before, blank)).toEqual({ screen: 'welcome', lang: 'ms', profile: null, account: { status: 'none', user: null } })
  })

  it('keeps a signed-in user signed in', () => {
    const user = { id: 'u1', email: 'test@example.test' }
    expect(startOver({ lang: 'zh', account: { status: 'in', user } }, blank).account).toEqual({ status: 'in', user })
  })

  it('leaves the account out while the first check is still running', () => {
    expect('account' in startOver({ lang: 'en' }, blank)).toBe(false)
  })
})
