import { describe, expect, it } from 'vitest'
import { afterGetStarted, screenToSave, startScreen } from '../shared/guestStore.js'

const saved = { screen: 'form', profile: { skills: [] } }

describe('landing page first', () => {
  it('opening the site address always shows the landing page, even with a saved session', () => {
    expect(startScreen(saved, '')).toBe('welcome')
    expect(startScreen(null, '')).toBe('welcome')
  })

  it('a link to a screen keeps the old behaviour (saved session asks first)', () => {
    expect(startScreen(saved, '#review')).toBe('returning')
    expect(startScreen(null, '#source')).toBe('source')
  })

  it('Get started brings back the saved session through the Welcome back choice', () => {
    expect(afterGetStarted('form')).toBe('returning')
    expect(afterGetStarted(null)).toBe('access')
  })

  it('the saved place is kept while the landing or Welcome back screen is shown', () => {
    expect(screenToSave('welcome', 'form')).toBe('form')
    expect(screenToSave('returning', 'form')).toBe('form')
    expect(screenToSave('source', 'form')).toBe('source')
    expect(screenToSave('welcome', null)).toBe('welcome')
  })
})
