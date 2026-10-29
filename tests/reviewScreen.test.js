import { describe, expect, it } from 'vitest'
import { profileTable } from '../public/js/screens/review.js'
import { emptyProfile } from '../shared/profileSchema.js'

const t = (key) => key

describe('review screen', () => {
  it('an occupation mapping without a chosen occupation does not break the page', () => {
    const profile = { ...emptyProfile(), occupationMappings: [{ term: 'Barista', kind: 'job', chosen: null, candidatesShown: 0 }] }
    expect(() => profileTable(t, profile)).not.toThrow()
    expect(profileTable(t, profile)).toContain('Barista')
  })
})
