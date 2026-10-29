import { describe, expect, it } from 'vitest'
import { fieldSuggestions, linkedFields } from '../public/js/components/fieldSuggestions.js'
import { emptyProfile, makeSkill } from '../shared/profileSchema.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const nursing = { source: 'isced', code: '0913', title: 'Nursing and midwifery', version: 'ISCED-F 2013' }

function profileWith(fields, skills = []) {
  const profile = emptyProfile()
  profile.education.records = fields.map((field) => ({ qualification: 'Degree', fieldOfStudy: field?.title ?? 'x', institution: '', year: '', field }))
  profile.skills = skills
  return profile
}

const tool = (i) => ({ id: `onet:tech:tool${i}`, name: `Tool ${i}`, category: 'Software', kind: 'software', inField: 11, fieldJobs: 26, allCount: 20, allJobs: 1016 })
const answer = (suggestions) => ({ field: { code: '0913', title: 'Nursing and midwifery' }, jobs: 26, isced: 'ISCED-F 2013', onet: '31.0', suggestions })

describe('skills suggested from the field of study', () => {
  it('only linked fields get suggestions, each once', () => {
    expect(linkedFields(profileWith([nursing, null, nursing]))).toEqual([{ code: '0913', title: 'Nursing and midwifery' }])
  })

  it('shows nothing without a linked field of study', () => {
    expect(fieldSuggestions({ t, profile: profileWith([null]), state: {} })).toBe('')
  })

  it('lists suggestions as tick boxes with the reason, and one button to add the ticked ones', () => {
    const skill = { id: 'onet:el:2.B.1.e', name: 'Service Orientation', category: 'O*NET skill', kind: 'skill', fieldImportance: 3.77, allImportance: 2.94 }
    const html = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': answer([skill, tool(1)]) } } })
    expect(html).toContain('suggestTitle:{&quot;field&quot;:&quot;Nursing and midwifery&quot;}')
    expect(html).toContain('type="checkbox" data-sugg="0913|onet:el:2.B.1.e"')
    expect(html).toContain('suggestWhySkill:{&quot;field&quot;:3.77,&quot;all&quot;:2.94}')
    expect(html).toContain('suggestWhyTool:{&quot;n&quot;:11,&quot;total&quot;:26,&quot;all&quot;:2}')
    expect(html).toContain('data-act="addSuggested" data-arg="0913"')
    expect(html).not.toMatch(/checked/)
  })

  it('keeps ticks when the list is drawn again (e.g. after "Show more")', () => {
    const state = { suggest: { '0913': answer([tool(1), tool(2)]) }, suggestTicked: new Set(['0913|onet:tech:tool2']) }
    const html = fieldSuggestions({ t, profile: profileWith([nursing]), state })
    expect(html).toContain('data-sugg="0913|onet:tech:tool2" checked')
    expect(html).not.toContain('data-sugg="0913|onet:tech:tool1" checked')
  })

  it('leaves out skills already in the profile', () => {
    const have = makeSkill({ name: 'Tool 1', canonicalId: 'onet:tech:tool1', source: 'user_input' })
    const html = fieldSuggestions({ t, profile: profileWith([nursing], [have]), state: { suggest: { '0913': answer([tool(1), tool(2)]) } } })
    expect(html).not.toContain('onet:tech:tool1')
    expect(html).toContain('onet:tech:tool2')
  })

  it('shows 10 at first, and the rest after "Show more"', () => {
    const many = answer(Array.from({ length: 14 }, (_, i) => tool(i)))
    const first = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': many } } })
    expect(first.match(/data-sugg=/g)).toHaveLength(10)
    expect(first).toContain('data-act="suggestMore" data-arg="0913"')
    const all = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': many }, suggestMore: { '0913': true } } })
    expect(all.match(/data-sugg=/g)).toHaveLength(14)
  })

  it('says when the field leads to no O*NET job, while loading, and when loading failed', () => {
    const none = { ...answer([]), jobs: 0 }
    expect(fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': none } } })).toContain('suggestNone')
    expect(fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': 'loading' } } })).toContain('occSearching')
    expect(fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': { failed: true } } } })).toContain('pickFailed')
  })
})
