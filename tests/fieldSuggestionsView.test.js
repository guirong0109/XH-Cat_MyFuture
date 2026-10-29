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
const skill = (i) => ({ id: `onet:el:2.B.${i}`, name: `Skill ${i}`, category: 'O*NET skill', kind: 'skill', fieldImportance: 3.77, allImportance: 2.94 })
const answer = (suggestions) => ({ field: { code: '0913', title: 'Nursing and midwifery' }, jobs: 26, isced: 'ISCED-F 2013', onet: '31.0', suggestions })
const chips = (html) => html.match(/data-act="addSuggestion"/g) ?? []

describe('skills suggested from the field of study', () => {
  it('only linked fields get suggestions, each once', () => {
    expect(linkedFields(profileWith([nursing, null, nursing]))).toEqual([{ code: '0913', title: 'Nursing and midwifery' }])
  })

  it('shows nothing without a linked field of study', () => {
    expect(fieldSuggestions({ t, profile: profileWith([null]), state: {} })).toBe('')
  })

  it('each suggestion is one button that adds it, with a caption saying so and the reason on hover', () => {
    const html = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': answer([skill(1), tool(1)]) } } })
    expect(html).toContain('suggestTitle:{&quot;field&quot;:&quot;Nursing and midwifery&quot;}')
    expect(html).toContain('suggestClick')
    expect(html).toContain('data-act="addSuggestion" data-arg="0913|onet:el:2.B.1"')
    expect(html).toContain('title="suggestWhySkill:{&quot;field&quot;:3.77,&quot;all&quot;:2.94}"')
    expect(html).toContain('title="suggestWhyTool:{&quot;n&quot;:11,&quot;total&quot;:26,&quot;all&quot;:2}"')
    expect(html).not.toContain('type="checkbox"')
  })

  it('skills and tools are in two short groups', () => {
    const html = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': answer([skill(1), tool(1)]) } } })
    expect(html.indexOf('suggestGroupSkills')).toBeLessThan(html.indexOf('suggestGroupTools'))
  })

  it('leaves out skills already in the profile', () => {
    const have = makeSkill({ name: 'Tool 1', canonicalId: 'onet:tech:tool1', source: 'user_input' })
    const html = fieldSuggestions({ t, profile: profileWith([nursing], [have]), state: { suggest: { '0913': answer([tool(1), tool(2)]) } } })
    expect(html).not.toContain('onet:tech:tool1')
    expect(html).toContain('onet:tech:tool2')
  })

  it('shows at most 8 at first, and the rest after "Show more"', () => {
    const many = answer([...Array.from({ length: 5 }, (_, i) => skill(i)), ...Array.from({ length: 15 }, (_, i) => tool(i))])
    const first = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': many } } })
    expect(chips(first)).toHaveLength(8)
    expect(first).toContain('data-act="suggestMore" data-arg="0913"')
    const all = fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': many }, suggestMore: { '0913': true } } })
    expect(chips(all)).toHaveLength(20)
  })

  it('says when the field leads to no O*NET job, while loading, and when loading failed', () => {
    const none = { ...answer([]), jobs: 0 }
    expect(fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': none } } })).toContain('suggestNone')
    expect(fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': 'loading' } } })).toContain('occSearching')
    expect(fieldSuggestions({ t, profile: profileWith([nursing]), state: { suggest: { '0913': { failed: true } } } })).toContain('pickFailed')
  })
})
