import { describe, it, expect } from 'vitest'
import { keepSuggestion } from '../../public/js/cvSuggest.js'
import { fitFor, profileLevels } from '../../shared/matching/fit.js'

describe('a kept CV suggestion counts in Skill Match', () => {
  const python = {
    name: 'Python', originalText: 'Python', canonicalId: 'onet:tech:python', category: 'Programming language', source: 'cv_rules',
    userConfirmed: false, proficiency: 'good', proficiencyStatus: 'from_projects', extraction: null,
    usedIn: [{ kind: 'job', title: 'Data Analyst' }],
    aiSuggestion: { id: 'onet:el:2.B.3.e', name: 'Programming', evidence: 'Built models in Python' },
  }
  const profile = { skills: [python] }
  const needs = [{ key: 'el:2.B.3.e', elementId: '2.B.3.e', kind: 'el', name: 'Programming', importance: 4, needed: 3.5 }]

  it('before keeping, the tool skill gives Matching nothing', () => {
    expect(profileLevels(profile).size).toBe(0)
    expect(fitFor(needs, profileLevels(profile)).rows[0].status).toBe('missing')
  })

  it('after keeping, Programming is Good (4 points) and meets 3.5', () => {
    const kept = keepSuggestion(profile, 0)
    const levels = profileLevels(kept)
    expect(levels.get('el:2.B.3.e')).toEqual({ points: 4, notAssessed: false })
    const fit = fitFor(needs, levels)
    expect(fit.rows[0].status).toBe('met')
    expect(fit.percent).toBe(100)
  })
})
