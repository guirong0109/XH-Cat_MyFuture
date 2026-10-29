import { describe, expect, it } from 'vitest'
import { emptyProfile, makeSkill } from '../shared/profileSchema.js'
import { confirmProfile } from '../shared/profileState.js'
import { afterConfirm } from '../shared/flow.js'

describe('after confirm', () => {
  it('afterConfirm goes to the summary and reports usable false without an identified skill', () => {
    const p = confirmProfile({ ...emptyProfile(), skills: [makeSkill({ name: 'Basket weaving', source: 'user_input' })] })
    expect(afterConfirm(p)).toEqual({ screen: 'summary', usable: false })
  })

  it('afterConfirm reports usable true with one', () => {
    const p = confirmProfile({ ...emptyProfile(), skills: [makeSkill({ name: 'Python', canonicalId: 'onet:tech:python', source: 'user_input' })] })
    expect(afterConfirm(p)).toEqual({ screen: 'summary', usable: true })
  })

  it('a draft profile stays on the review', () => {
    expect(afterConfirm(emptyProfile())).toEqual({ screen: 'review', usable: false })
  })
})
