import { describe, expect, it } from 'vitest'
import { loadTheme, saveTheme, toggleTheme } from '../shared/theme.js'

function memoryStorage() {
  const data = new Map()
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data }
}

describe('theme', () => {
  it('starts in light mode when nothing is saved', () => {
    expect(loadTheme(memoryStorage())).toBe('light')
    expect(loadTheme(null)).toBe('light')
  })

  it('switches between light and dark', () => {
    expect(toggleTheme('light')).toBe('dark')
    expect(toggleTheme('dark')).toBe('light')
  })

  it('remembers the chosen theme', () => {
    const storage = memoryStorage()
    saveTheme(storage, 'dark')
    expect(loadTheme(storage)).toBe('dark')
  })

  it('ignores unknown saved values and broken storage', () => {
    const storage = memoryStorage()
    storage.setItem('futureready-theme', 'purple')
    expect(loadTheme(storage)).toBe('light')
    const broken = { getItem() { throw new Error('SecurityError') }, setItem() { throw new Error('SecurityError') } }
    expect(loadTheme(broken)).toBe('light')
    expect(() => saveTheme(broken, 'dark')).not.toThrow()
  })
})
