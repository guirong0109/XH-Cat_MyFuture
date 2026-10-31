import { describe, expect, it } from 'vitest'
import welcome from '../public/js/screens/welcome.js'
import category from '../public/js/screens/category.js'
import { t as translate } from '../shared/i18n.js'

const t = (key) => key
const choices = (html) => [...html.matchAll(/data-act="category" data-arg="(\w)"/g)].map(([, k]) => k)

describe('first question: personal or organisation', () => {
  it('the welcome screen asks who it is for, with a choice for myself and one for my organisation', () => {
    const html = welcome({ t })
    expect(html).toContain('useTitle')
    expect(html).toContain('data-act="use" data-arg="personal"')
    expect(html).toContain('data-act="use" data-arg="org"')
    expect(html).not.toContain('>start')
    for (const lang of ['en', 'ms', 'zh']) {
      const page = welcome({ t: (key, vars) => translate(lang, key, vars) })
      for (const key of ['useTitle', 'usePersonal', 'usePersonalText', 'useOrg', 'useOrgText']) expect(page).toContain(translate(lang, key))
    }
  })

  it('"Who are you?" then shows only the matching choices', () => {
    expect(choices(category({ t, state: { use: 'personal' } }))).toEqual(['A', 'B'])
    expect(choices(category({ t, state: { use: 'org' } }))).toEqual(['C', 'D'])
  })

  it('someone who signed in without answering still sees all four', () => {
    expect(choices(category({ t, state: {} }))).toEqual(['A', 'B', 'C', 'D'])
  })
})
