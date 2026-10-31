// Study Pathway picks (Task 5): file checks, owner review statuses, search links and coverage.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PICK_KIND, PICKS_SOURCE, checkPicks, checkSites, coverage, pickStatuses, searchLinks, searchWordFor, shownPicks } from '../../shared/pathway/picks.js'

const SITES_FILE = JSON.parse(readFileSync(new URL('../../data/pathway/sites.json', import.meta.url), 'utf8'))
const FORBIDDEN_KEY = /score|weight|rank|opportunit/i
function keysDeep(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      keysDeep(v, out)
    }
  }
  return out
}

const sites = checkSites(SITES_FILE)
const CTX = { itemKeys: new Set(['el:2.A.1.a', 'kn:2.C.1.a']), fieldCodes: new Set(['0611', '0714']) }

const course = (o = {}) => ({ id: 'c1', for: 'el:2.A.1.a', site: 'coursera', name: 'Reading skills', link: 'https://www.coursera.org/learn/reading', checkedAt: '2026-10-31', ...o })
const accredited = (o = {}) => ({ id: 'p1', field: '0611', kind: 'accredited', name: 'BSc Computer Science', institution: 'Uni A', mqrRef: 'MQR/1', link: 'https://example.edu.my/cs', checkedAt: '2026-10-31', ...o })
const professional = (o = {}) => ({ id: 'p2', field: '0714', kind: 'professional', name: 'Certified Technician', body: 'Body B', link: 'https://body.example.org/cert', checkedAt: '2026-10-31', ...o })
const word = (o = {}) => ({ id: 'w1', for: 'kn:2.C.1.a', word: 'customer service', checkedAt: '2026-10-31', ...o })
const file = (o = {}) => ({ schemaVersion: 'pathway-picks/v1', status: 'team draft', courses: [course()], programmes: [accredited(), professional()], searchWords: [word()], ...o })

describe('constants', () => {
  it('names the review kind and source', () => {
    expect(PICK_KIND).toBe('pathway_pick')
    expect(PICKS_SOURCE).toBe('pathway-picks')
  })
})

describe('checkSites', () => {
  it('accepts the real sites.json and keeps file order', () => {
    expect(sites.map((s) => s.id).slice(0, 3)).toEqual(['elatih', 'coursera', 'edx'])
    expect(sites).toHaveLength(SITES_FILE.sites.length)
  })
  const bad = (patch) => ({ ...SITES_FILE, sites: [{ ...SITES_FILE.sites[1], ...patch }] })
  it('throws naming sites.json and the site id', () => {
    for (const patch of [{ home: 'http://www.coursera.org/' }, { hosts: [] }, { search: 'https://www.coursera.org/search' }, { search: 'http://www.coursera.org/s?q=<q>' }, { name: '' }, { searchCheckedAt: null },
      { group: 'other' }, { group: undefined }, { terms: 'http://www.coursera.org/about/terms' }, { terms: undefined }, { search: 'https://www.coursera.org/search?query=<q>&again=<q>' }]) {
      expect(() => checkSites(bad(patch))).toThrow(/sites\.json.*coursera/)
    }
  })
  it('throws on a duplicate site id', () => {
    const s = SITES_FILE.sites[1]
    expect(() => checkSites({ ...SITES_FILE, sites: [s, s] })).toThrow(/sites\.json.*coursera/)
  })
})

describe('checkPicks', () => {
  it('passes a valid file and returns one flat list with types', () => {
    const out = checkPicks(file(), sites, CTX)
    expect(out.map((p) => [p.id, p.type, p.for])).toEqual([
      ['c1', 'course', 'el:2.A.1.a'],
      ['p1', 'programme', 'field:0611'],
      ['p2', 'programme', 'field:0714'],
      ['w1', 'searchWord', 'kn:2.C.1.a']
    ])
    expect(out[1]).toMatchObject({ institution: 'Uni A', mqrRef: 'MQR/1', kind: 'accredited', field: '0611' })
    expect(out[2]).toMatchObject({ body: 'Body B' })
    expect(out[3]).not.toHaveProperty('link')
  })
  it('accepts an empty file, a field: course, a null mqrRef and an e-LATiH course link', () => {
    expect(checkPicks({ courses: [], programmes: [], searchWords: [] }, sites, CTX)).toEqual([])
    const ok = file({
      courses: [course({ for: 'field:0611' }), course({ id: 'c2', site: 'elatih', link: 'https://elatih.hrdcorp.gov.my/courses-details/123' })],
      programmes: [accredited({ mqrRef: null })]
    })
    expect(checkPicks(ok, sites, CTX)).toHaveLength(4)
  })
  const cases = {
    'non-https link': [file({ courses: [course({ link: 'http://www.coursera.org/learn/x' })] }), /c1/],
    'unparseable link': [file({ courses: [course({ link: 'https://' })] }), /c1/],
    'unknown site': [file({ courses: [course({ site: 'nosuch' })] }), /c1/],
    'host not in site hosts': [file({ courses: [course({ link: 'https://evil.example.com/x' })] }), /c1/],
    'e-LATiH link not under courses-details': [file({ courses: [course({ site: 'elatih', link: 'https://elatih.hrdcorp.gov.my/courses?course=x' })] }), /c1/],
    'course for unknown item': [file({ courses: [course({ for: 'el:9.9' })] }), /c1/],
    'course for unknown field': [file({ courses: [course({ for: 'field:9999' })] }), /c1/],
    'searchWord for unknown item': [file({ searchWords: [word({ for: 'kn:nope' })] }), /w1/],
    'programme field unknown': [file({ programmes: [accredited({ field: '9999' })] }), /p1/],
    'programme kind invalid': [file({ programmes: [accredited({ kind: 'diploma' })] }), /p1/],
    'programme link non-https': [file({ programmes: [accredited({ link: 'http://example.edu.my/cs' })] }), /p1/],
    'duplicate id': [file({ courses: [course(), course({ name: 'Other' })] }), /c1/],
    'duplicate id across types': [file({ searchWords: [word({ id: 'c1' })] }), /c1/],
    'course missing name': [file({ courses: [course({ name: '' })] }), /c1/],
    'course missing link': [file({ courses: [course({ link: undefined })] }), /c1/],
    'course missing checkedAt': [file({ courses: [course({ checkedAt: undefined })] }), /c1/],
    'course bad checkedAt': [file({ courses: [course({ checkedAt: '31/10/2026' })] }), /c1/],
    'programme missing name': [file({ programmes: [accredited({ name: undefined })] }), /p1/],
    'programme missing link': [file({ programmes: [accredited({ link: '' })] }), /p1/],
    'programme missing checkedAt': [file({ programmes: [accredited({ checkedAt: undefined })] }), /p1/],
    'searchWord missing word': [file({ searchWords: [word({ word: '' })] }), /w1/],
    'searchWord missing checkedAt': [file({ searchWords: [word({ checkedAt: undefined })] }), /w1/],
    'missing id': [file({ courses: [course({ id: undefined })] }), /courses\[0\]/],
    'course with an extra key': [file({ courses: [course({ institution: 'Uni A' })] }), /c1.*institution/],
    'accredited programme with an extra key': [file({ programmes: [accredited({ notes: 'x' })] }), /p1.*notes/],
    'accredited programme with a body': [file({ programmes: [accredited({ body: 'Body B' })] }), /p1.*body/],
    'professional pick with an institution': [file({ programmes: [professional({ institution: 'Uni A' })] }), /p2.*institution/],
    'professional pick with an MQA reference': [file({ programmes: [professional({ mqrRef: 'MQR/1' })] }), /p2.*mqrRef/],
    'searchWord with an extra key': [file({ searchWords: [word({ link: 'https://example.org/' })] }), /w1.*link/],
    'accredited programme with no institution': [file({ programmes: [accredited({ institution: undefined })] }), /p1.*institution/],
    'accredited programme with an empty institution': [file({ programmes: [accredited({ institution: '' })] }), /p1.*institution/],
    'professional pick with no body': [file({ programmes: [professional({ body: undefined })] }), /p2.*body/]
  }
  for (const [name, [input, idRe]] of Object.entries(cases)) {
    it(`throws on ${name}, naming picks.json and the pick`, () => {
      let msg = ''
      try {
        checkPicks(input, sites, CTX)
      } catch (e) {
        msg = e.message
      }
      expect(msg).toMatch(/picks\.json/)
      expect(msg).toMatch(idRe)
    })
  }
  it('has no forbidden keys', () => {
    expect(keysDeep(checkPicks(file(), sites, CTX)).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })
})

const PICKS = [
  { id: 'c1', type: 'course', for: 'el:2.A.1.a', name: 'A', hash: 'h-c1' },
  { id: 'c2', type: 'course', for: 'el:2.A.1.a', name: 'B', hash: 'h-c2' },
  { id: 'w1', type: 'searchWord', for: 'kn:2.C.1.a', word: 'customer service', hash: 'h-w1' },
  { id: 'p1', type: 'programme', for: 'field:0611', name: 'C', hash: 'h-p1' }
]
const rev = (target, decision, hash, reviewedAt, extra = {}) => ({ reviewId: `${target}-${reviewedAt}`, kind: 'pathway_pick', target, decision, appliesTo: { observationHash: hash }, reviewedAt, reviewer: 'owner', version: 1, ...extra })

describe('pickStatuses', () => {
  it('is pending when there is no review', () => {
    const out = pickStatuses(PICKS, [])
    expect(out.map((p) => p.status)).toEqual(['pending', 'pending', 'pending', 'pending'])
    expect(out[0]).toMatchObject({ reviewedAt: null, reviewedBy: null, reviewId: null, id: 'c1' })
  })
  it('reads approved and rejected, keeping the reviewer and review id', () => {
    const out = pickStatuses(PICKS, [rev('c1', 'approved', 'h-c1', '2026-10-31'), rev('c2', 'rejected', 'h-c2', '2026-10-30')])
    expect(out[0]).toMatchObject({ status: 'approved', reviewedAt: '2026-10-31', reviewedBy: 'owner', reviewId: 'c1-2026-10-31' })
    expect(out[1].status).toBe('rejected')
  })
  it('counts revise as pending and uses the newest review', () => {
    expect(pickStatuses(PICKS, [rev('c1', 'revise', 'h-c1', '2026-10-31')])[0].status).toBe('pending')
    const out = pickStatuses(PICKS, [rev('c1', 'rejected', 'h-c1', '2026-10-30'), rev('c1', 'approved', 'h-c1', '2026-10-31')])
    expect(out[0].status).toBe('approved')
    const back = pickStatuses(PICKS, [rev('c1', 'approved', 'h-c1', '2026-10-30'), rev('c1', 'revise', 'h-c1', '2026-10-31')])
    expect(back[0].status).toBe('pending')
  })
  it('ignores a decision on an old hash, another kind and an unknown decision', () => {
    const out = pickStatuses(PICKS, [rev('c1', 'approved', 'old-hash', '2026-10-31'), rev('c2', 'approved', 'h-c2', '2026-10-31', { kind: 'sdg_link' }), rev('w1', 'maybe', 'h-w1', '2026-10-31')])
    expect(out.map((p) => p.status)).toEqual(['pending', 'pending', 'pending', 'pending'])
  })
  it('does not fail on missing inputs', () => {
    expect(pickStatuses(undefined, undefined)).toEqual([])
  })
})

describe('shownPicks', () => {
  it('hides rejected, dates approved, null for not yet reviewed and revise', () => {
    const out = shownPicks(PICKS, [rev('c1', 'approved', 'h-c1', '2026-10-31'), rev('c2', 'rejected', 'h-c2', '2026-10-31'), rev('w1', 'revise', 'h-w1', '2026-10-31')])
    expect(out.map((p) => [p.id, p.approvedAt])).toEqual([['c1', '2026-10-31'], ['w1', null], ['p1', null]])
    expect(out[0]).not.toHaveProperty('status')
    expect(out[0]).not.toHaveProperty('reviewId')
    expect(out[0].hash).toBe('h-c1')
  })
  it('shows a rejection made on an old hash', () => {
    expect(shownPicks(PICKS, [rev('c2', 'rejected', 'old', '2026-10-31')]).map((p) => p.id)).toContain('c2')
  })
  it('has no forbidden keys', () => {
    expect(keysDeep([pickStatuses(PICKS, []), shownPicks(PICKS, [])]).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })
})

describe('searchWordFor', () => {
  it('returns the shown search word for the key, else the default name', () => {
    expect(searchWordFor('kn:2.C.1.a', PICKS, 'Customer and Personal Service')).toBe('customer service')
    expect(searchWordFor('kn:other', PICKS, 'Default Name')).toBe('Default Name')
    expect(searchWordFor('el:2.A.1.a', PICKS, 'Reading')).toBe('Reading')
    expect(searchWordFor('kn:x', undefined, 'D')).toBe('D')
  })
})

describe('searchLinks', () => {
  it('encodes C++ and keeps file order, skipping sites without a search', () => {
    const out = searchLinks('C++', sites)
    expect(out.map((l) => l.site)).toEqual(['elatih', 'coursera', 'edx', 'khan', 'mslearn', 'googleskills'])
    expect(out[0].url.endsWith('&course=C%2B%2B')).toBe(true)
    expect(out[0].url.startsWith('https://elatih.hrdcorp.gov.my/courses?order=None')).toBe(true)
    expect(out[1]).toEqual({ site: 'coursera', name: 'Coursera', url: 'https://www.coursera.org/search?query=C%2B%2B', checkedAt: '2026-10-31' })
    expect(out.every((l) => !l.url.includes('<q>'))).toBe(true)
  })
  it('encodes spaces as %20', () => {
    const out = searchLinks('Customer and Personal Service', sites)
    expect(out[1].url).toBe('https://www.coursera.org/search?query=Customer%20and%20Personal%20Service')
  })
  it('does not treat $ patterns in the word as replacement syntax', () => {
    expect(searchLinks("$& $1", [{ id: 'x', name: 'X', search: 'https://x.test/?q=<q>', searchCheckedAt: '2026-10-31' }])[0].url).toBe('https://x.test/?q=%24%26%20%241')
  })
  it('has no forbidden keys', () => {
    expect(keysDeep(searchLinks('x', sites)).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })
})

describe('coverage', () => {
  const keys = ['el:2.A.1.a', 'kn:2.C.1.a', 'el:other']
  const codes = ['0611', '0714']
  const picks = [
    { id: 'c1', type: 'course', for: 'el:2.A.1.a' },
    { id: 'p1', type: 'programme', kind: 'accredited', for: 'field:0611' },
    { id: 'p2', type: 'programme', kind: 'professional', for: 'field:0714' },
    { id: 'w1', type: 'searchWord', for: 'kn:2.C.1.a' }
  ]
  it('lists exactly the uncovered keys: courses for items, accredited programmes for fields', () => {
    expect(coverage(picks, keys, codes, new Set()).missing).toEqual(['kn:2.C.1.a', 'el:other', 'field:0714'])
  })
  it('drops reported keys', () => {
    expect(coverage(picks, keys, codes, new Set(['el:other', 'field:0714'])).missing).toEqual(['kn:2.C.1.a'])
  })
  it('lists everything when there are no picks, and nothing when all covered', () => {
    expect(coverage([], ['el:a'], ['0611'], new Set()).missing).toEqual(['el:a', 'field:0611'])
    expect(coverage(picks, ['el:2.A.1.a'], ['0611'], new Set()).missing).toEqual([])
  })
})
