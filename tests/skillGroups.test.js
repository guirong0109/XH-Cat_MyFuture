import { describe, expect, it } from 'vitest'
import form, { NOT_ASKED, dropNotAsked } from '../public/js/screens/form.js'
import { confirmGroup, groupsOf, linkSkill, renamePlace, unlinkPlace, unlinkSkill } from '../public/js/screens/skillGroups.js'
import { emptyProfile, makeSkill, validateProfile } from '../shared/profileSchema.js'
import { t as translate } from '../shared/i18n.js'
import { mergeDraft } from '../shared/profileState.js'

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
const q = (text) => text.replace(/"/g, '&quot;')
const skill = (name, usedIn = [], extra = {}) => ({ ...makeSkill({ name, canonicalId: `onet:tech:${name.toLowerCase()}`, source: 'cv_rules', usedIn }), ...extra })
const job = { kind: 'job', title: 'Data Analyst Intern' }
const flood = { kind: 'project', title: 'Flood Risk Prediction Model' }
const fromCv = () => ({
  ...emptyProfile({ inputMethod: 'cv' }),
  employment: { ...emptyProfile().employment, records: [{ jobTitle: 'Data Analyst Intern', employer: 'Retail company', period: 'Jun 2025 - Dec 2025', years: null, description: 'Cleaned weekly sales data in SQL', userConfirmed: false, extraction: { evidence: 'Data Analyst Intern, Retail company, Jun 2025 - Dec 2025' } }] },
  projects: [{ title: 'Flood Risk Prediction Model', description: 'Trained an ML model in Python', userConfirmed: false, extraction: { evidence: 'Flood Risk Prediction Model' } }],
  skills: [
    skill('SQL', [job]),
    skill('Python', [job, flood]),
    { ...makeSkill({ name: 'LangGraph', source: 'cv_rules', usedIn: [flood] }) },
    skill('Microsoft Excel'),
    skill('Teamwork', [{ kind: 'job', title: 'A job that was removed' }]),
  ],
})
const page = (profile, extra = {}) => form({ t, state: { section: 2, profile, occ: {}, pick: {}, ...extra } })

describe('groupsOf: skills listed under the job or project they were used in, the rest under Others', () => {
  it('jobs first, then projects, then Others; a skill used in two places shows in both', () => {
    const groups = groupsOf(fromCv())
    expect(groups.map((g) => [g.kind, g.title])).toEqual([['job', 'Data Analyst Intern'], ['project', 'Flood Risk Prediction Model'], ['other', '']])
    expect(groups.map((g) => g.skills.map(({ skill: s }) => s.name))).toEqual([['SQL', 'Python'], ['Python', 'LangGraph'], ['Microsoft Excel', 'Teamwork']])
  })

  it('a link to a job or project that is no longer there puts the skill under Others, so nothing is lost', () => {
    expect(groupsOf(fromCv()).at(-1).skills.map(({ skill: s }) => s.name)).toContain('Teamwork')
  })

  it('a group needs checking while its record or a skill in it came from the CV unconfirmed', () => {
    expect(groupsOf(fromCv()).map((g) => g.needsCheck)).toEqual([true, true, true])
    const done = confirmGroup(fromCv(), 'job|0')
    expect(groupsOf(done).map((g) => g.needsCheck)).toEqual([false, true, true])
  })
})

describe('changing the groups', () => {
  it('"Looks right" confirms the record and every skill in it, and nothing else', () => {
    const out = confirmGroup(fromCv(), 'project|0')
    expect(out.projects[0].userConfirmed).toBe(true)
    expect(out.skills.filter((s) => s.userConfirmed).map((s) => s.name)).toEqual(['Python', 'LangGraph'])
    expect(out.employment.records[0].userConfirmed).toBe(false)
    expect(confirmGroup(fromCv(), 'other').skills.filter((s) => s.userConfirmed).map((s) => s.name)).toEqual(['Microsoft Excel', 'Teamwork'])
  })

  it('removing a skill from a group drops that link; a skill used nowhere else is removed', () => {
    const once = unlinkSkill(fromCv(), 1, flood)
    expect(once.skills.find((s) => s.name === 'Python').usedIn).toEqual([job])
    const gone = unlinkSkill(fromCv(), 0, job)
    expect(gone.skills.map((s) => s.name)).not.toContain('SQL')
  })

  it('adding a skill to a group links it at Good (from your projects); the same skill is not added twice', () => {
    const added = linkSkill(fromCv(), { name: 'Pandas', canonicalId: 'onet:tech:pandas', category: null }, flood)
    expect(added.skills.at(-1)).toMatchObject({ name: 'Pandas', source: 'user_input', usedIn: [flood], proficiency: 'good', proficiencyStatus: 'from_projects' })
    expect(linkSkill(fromCv(), { name: 'Tableau', canonicalId: 'onet:tech:tableau' }, null).skills.at(-1)).toMatchObject({ proficiency: null, proficiencyStatus: 'not_assessed' })
    const linked = linkSkill(fromCv(), { name: 'Microsoft Excel', canonicalId: 'onet:tech:microsoft excel' }, job)
    expect(linked.skills).toHaveLength(5)
    expect(linked.skills.find((s) => s.name === 'Microsoft Excel')).toMatchObject({ usedIn: [job], proficiency: 'good', proficiencyStatus: 'from_projects' })
    const rated = fromCv()
    rated.skills[3] = { ...rated.skills[3], proficiency: 'basic', proficiencyStatus: 'self_reported' }
    expect(linkSkill(rated, { name: 'Microsoft Excel', canonicalId: 'onet:tech:microsoft excel' }, job).skills[3]).toMatchObject({ proficiency: 'basic', proficiencyStatus: 'self_reported' })
  })

  it('renaming a job or project keeps its skills; removing one moves its skills to Others', () => {
    const renamed = renamePlace(fromCv(), 'job', 'Data Analyst Intern', 'Junior Data Analyst')
    expect(renamed.skills.find((s) => s.name === 'SQL').usedIn).toEqual([{ kind: 'job', title: 'Junior Data Analyst' }])
    const removed = unlinkPlace(fromCv(), 'project', 'Flood Risk Prediction Model')
    expect(removed.skills.find((s) => s.name === 'LangGraph').usedIn).toEqual([])
    expect(removed.skills.map((s) => s.name)).toContain('LangGraph')
    const auto = linkSkill(fromCv(), { name: 'Pandas', canonicalId: 'onet:tech:pandas' }, flood)
    expect(unlinkPlace(auto, 'project', flood.title).skills.at(-1)).toMatchObject({ proficiency: null, proficiencyStatus: 'not_assessed' })
  })

  it('the profile still validates', () => {
    expect(validateProfile(confirmGroup(fromCv(), 'job|0'))).toEqual({ ok: true, errors: [] })
  })
})

describe('the Skills and proficiency page', () => {
  it('the CV summary on top counts what was found and offers one button for all groups to check', () => {
    const html = page(fromCv())
    expect(html).toContain('tagFromCv')
    expect(html).toContain(q(t('cvFound', { list: `nJob, nProject, ${t('nOther', { n: 2 })}` })))
    expect(html).toContain('data-act="groupOkAll"')
    expect(html).toContain(q(t('confirmAllN', { n: 3 })))
  })

  it('each job and project is a card with its kind, title, details, the CV words, its skills and two buttons', () => {
    const html = page(fromCv())
    expect(html).toMatch(/class="kind">grpJob<\/span>/)
    expect(html).toContain('Data Analyst Intern · Retail company')
    expect(html).toContain('Jun 2025 - Dec 2025')
    expect(html).toContain('Cleaned weekly sales data in SQL')
    expect(html).toContain('data-act="groupOk" data-arg="job|0"')
    expect(html).toContain('data-act="groupEdit" data-arg="project|0"')
    expect(html).toContain('data-act="groupAdd" data-arg="project|0"')
  })

  it('a skill not in the O*NET list is marked; one written differently in the CV says what was written', () => {
    const profile = fromCv()
    profile.skills[1] = { ...profile.skills[1], originalText: 'python3' }
    const html = page(profile)
    expect(html).toMatch(/class="sk unk"[^>]*>\? LangGraph <small>notInList<\/small>/)
    expect(html).toContain(q(t('fromText', { text: 'python3' })))
  })

  it('a level from a job or project shows on its chip and, in Edit, with the tag "From your projects"', () => {
    const profile = linkSkill(fromCv(), { name: 'Pandas', canonicalId: 'onet:tech:pandas' }, flood)
    expect(page(profile)).toContain('<em>good</em>')
    expect(page(profile, { groupEdit: 'project|0' })).toContain('tagFromProjects')
    expect(page(profile)).toContain('grpLevelNote')
  })

  it('Other skills is folded: the search shows, the chips only after "Show"', () => {
    const closed = page(fromCv())
    expect(closed).toContain('data-search="skill|skill"')
    expect(closed).toContain(`data-act="otherFold" aria-expanded="false">${q(t('otherShow', { n: 2 }))}`)
    expect(closed).not.toContain('Microsoft Excel')
    const open = page(fromCv(), { otherOpen: true })
    expect(open).toContain('aria-expanded="true">otherHide')
    expect(open).toContain('Microsoft Excel')
  })

  it('the level toggle bar is in the Edit view of a group', () => {
    expect(page(fromCv())).not.toContain('data-act="level"')
    const html = page(fromCv(), { groupEdit: 'job|0' })
    expect(html).toContain('data-act="level" data-arg="0|good"')
    expect(html).toContain('data-act="level" data-arg="1|good"')
    expect(html).not.toContain('data-act="level" data-arg="3|good"')
    expect(html).toContain('data-act="unlinkSkill" data-arg="0|job|0"')
  })

  it('"+ add skill" opens a skill search for that group', () => {
    expect(page(fromCv(), { groupAdd: 'project|0' })).toContain('data-search="skill|gskill|project|0"')
  })

  it('a project is edited in place; a job points to Employment background', () => {
    const project = page(fromCv(), { groupEdit: 'project|0' })
    expect(project).toContain('data-rec="projects|0|title"')
    expect(project).toContain('data-rec="projects|0|description"')
    expect(project).toContain('data-act="delRec" data-arg="projects|0"')
    expect(page(fromCv(), { groupEdit: 'job|0' })).toContain('data-act="section" data-arg="1"')
  })

  it('without a CV there is no summary; Others has the skill search; a project can be added', () => {
    const html = page(emptyProfile())
    expect(html).not.toContain('groupOkAll')
    expect(html).toContain('data-search="skill|skill"')
    expect(html).toContain('data-act="addRec" data-arg="projects"')
  })
})

describe('projects are back in the profile (owner, 31 Oct); certificates and training stay out', () => {
  it('a CV project is kept', () => {
    expect(NOT_ASKED).toEqual(['certifications', 'training'])
    expect(dropNotAsked(fromCv()).projects).toHaveLength(1)
  })

  it('the new wording exists in every language', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      for (const key of ['grpJob', 'grpProject', 'grpOther', 'grpOtherSub', 'cvFound', 'nJob', 'nJobs', 'nProject', 'nProjects', 'nOther', 'cvConfirmEach', 'confirmAllN', 'looksRight', 'grpConfirmed', 'grpDone', 'addSkillChip', 'notInList', 'fromText', 'removeHere', 'editJobThere', 'grpAddLabel', 'grpAsWritten', 'grpLegend', 'tagFromProjects', 'grpLevelNote', 'otherShow', 'otherHide']) {
        expect(translate(lang, key), `${lang} ${key}`).not.toBe(key)
      }
    }
  })
})

describe('AI tags on skills and job cards', () => {
  const real = (key, vars) => translate('en', key, vars)
  const cvPage = (profile) => form({ t: real, state: { section: 2, profile, occ: {}, pick: {} } })
  it('a skill found only by the AI carries Found by AI; a rules skill does not', () => {
    const p = fromCv()
    p.skills = [skill('SQL', [job], { source: 'cv_ai' }), skill('Python', [job])]
    const html = cvPage(p)
    const chips = html.match(/<span class="sk ok">.*?<\/span>/g)
    expect(chips.find((c) => c.includes('SQL'))).toContain('Found by AI')
    expect(chips.find((c) => c.includes('Python'))).not.toContain('Found by AI')
  })
  it('a job found only by the AI shows the tag on its card', () => {
    const p = fromCv()
    p.employment.records[0].extraction = { method: 'ai', evidence: 'Data Analyst Intern' }
    const html = cvPage(p)
    const head = html.match(/<div class="grp-head">.*?<\/div>\s*<div class="row">/s)[0]
    expect(head).toContain('Found by AI')
    const rules = cvPage(fromCv()).match(/<div class="grp-head">.*?<\/div>\s*<div class="row">/s)[0]
    expect(rules).not.toContain('Found by AI')
  })
  it('a job the user typed before the upload keeps its title and gets no AI tag when the AI draft has the same job', () => {
    const typed = emptyProfile()
    typed.employment.records = [{ jobTitle: 'Data Analyst Intern', employer: 'Retail company', userConfirmed: true }]
    const draft = fromCv()
    draft.employment.records[0].extraction = { method: 'ai', evidence: 'Data Analyst Intern' }
    const merged = mergeDraft(typed, draft)
    expect(merged.employment.records).toHaveLength(1)
    expect(merged.employment.records[0].extraction).toBeUndefined()
    expect(cvPage(merged)).not.toContain('Found by AI')
  })
})
