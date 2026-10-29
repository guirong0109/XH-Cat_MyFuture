import { describe, expect, it } from 'vitest'
import { createWindowLimiter } from '../server/rateLimit.js'

describe('createWindowLimiter', () => {
  it('allows the limit per key within the window, then refuses until the window has passed', () => {
    const clock = { t: 0 }
    const limiter = createWindowLimiter({ limit: 2, windowMs: 1000, now: () => clock.t })
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a'), limiter.hit('b')]).toEqual([true, true, false, true])
    clock.t = 1001
    expect(limiter.hit('a')).toBe(true)
  })

  it('forgets keys whose window has passed, so memory does not grow forever', () => {
    const clock = { t: 0 }
    const limiter = createWindowLimiter({ limit: 5, windowMs: 1000, now: () => clock.t, maxKeys: 3 })
    for (const key of ['a', 'b', 'c']) limiter.hit(key)
    expect(limiter.size()).toBe(3)
    clock.t = 2000
    limiter.hit('d')
    expect(limiter.size()).toBe(1)
  })
})
