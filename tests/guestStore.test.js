import { describe, expect, it } from 'vitest'
import { createGuestStore, resumeChoice } from '../shared/guestStore.js'

function memoryStorage() {
  const data = new Map()
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data }
}

describe('guest store', () => {
  it('guest store saves and loads', () => {
    const storage = memoryStorage()
    const store = createGuestStore(storage)
    expect(store.save({ screen: 'form', lang: 'ms', profile: { skills: [] } })).toBe(true)
    expect(store.load()).toEqual({ screen: 'form', lang: 'ms', profile: { skills: [] } })
    store.clear()
    expect(store.load()).toBe(null)
  })

  it('saves only what the minimize function keeps of the profile', () => {
    const storage = memoryStorage()
    const store = createGuestStore(storage, (profile) => ({ ...profile, secret: undefined }))
    store.save({ screen: 'form', profile: { secret: 'cv line', skills: [] } })
    expect(storage.data.get('futureready-profile-v1')).not.toContain('cv line')
  })

  it('guest store works when localStorage throws', () => {
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('denied') } }
    const store = createGuestStore(broken)
    expect(store.save({ screen: 'form' })).toBe(false)
    expect(store.load()).toBe(null)
    expect(() => store.clear()).not.toThrow()
    expect(createGuestStore(undefined).load()).toBe(null)
  })

  it('bad JSON loads as null', () => {
    const storage = memoryStorage()
    storage.setItem('futureready-profile-v1', '{not json')
    expect(createGuestStore(storage).load()).toBe(null)
  })

  it('resumeChoice asks only when saved progress is past welcome', () => {
    expect(resumeChoice(null)).toBe('fresh')
    expect(resumeChoice({ screen: 'welcome' })).toBe('fresh')
    expect(resumeChoice({ screen: 'access' })).toBe('fresh')
    expect(resumeChoice({ screen: 'form' })).toBe('ask')
  })
})
