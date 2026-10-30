// SDG links with owner decisions (Task 12): only approved links count; a decision applies to the exact link text.
import { describe, expect, it } from 'vitest'
import { approvedLinks, goalsOfRole, itemLinks, linkStatuses, pathContribution, roleLinks, shownLinks } from '../../shared/matching/sdg.js'

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

const reason = (en) => ({ en, ms: `${en} (ms)`, zh: `${en} (zh)` })
const LINKS = [
  { id: 'g25-9.c', kind: 'masco_submajor', code: '25', name: null, target: '9.c', reason: reason('ICT'), hash: 'h1' },
  { id: 'g25-4.4', kind: 'masco_submajor', code: '25', name: null, target: '4.4', reason: reason('skills'), hash: 'h2' },
  { id: 'g21-9.5', kind: 'masco_submajor', code: '21', name: null, target: '9.5', reason: reason('research'), hash: 'h3' },
  { id: 'el:2.A.1.a-4.6', kind: 'onet_element', code: 'el:2.A.1.a', name: 'Reading Comprehension', target: '4.6', reason: reason('read'), hash: 'h4' },
  { id: 'kn:2.C.4.a-4.4', kind: 'onet_element', code: 'kn:2.C.4.a', name: 'Mathematics', target: '4.4', reason: reason('maths'), hash: 'h5' },
  { id: 'kn:2.C.7.a-16.10', kind: 'onet_element', code: 'kn:2.C.7.a', name: 'Law', target: '16.10', reason: reason('law'), hash: 'h6' },
]

let n = 0
const review = (target, decision, observationHash, reviewedAt = '2026-10-30T00:00:00.000Z') => ({
  reviewId: `review-${++n}`,
  kind: 'sdg_link',
  target,
  decision,
  note: '',
  evidence: [],
  reviewer: 'owner',
  reviewedAt,
  version: n,
  appliesTo: { sourceId: 'sdg-links', period: null, observationHash },
})

const approveAll = () => LINKS.map((l) => review(l.id, 'approved', l.hash))

describe('approvedLinks', () => {
  it('only approved links count', () => {
    const reviews = [
      review('g25-9.c', 'approved', 'h1'),
      review('g25-4.4', 'rejected', 'h2'),
      review('g21-9.5', 'revise', 'h3'),
      review('kn:2.C.4.a-4.4', 'approved', 'h5'),
      { ...review('kn:2.C.7.a-16.10', 'approved', 'h6'), kind: 'field_topic' },
    ]
    expect(approvedLinks(LINKS, reviews).map((l) => l.id)).toEqual(['g25-9.c', 'kn:2.C.4.a-4.4'])
    expect(approvedLinks(LINKS, [])).toEqual([])
  })

  it('the newest decision wins', () => {
    const reviews = [
      review('g25-9.c', 'approved', 'h1', '2026-10-30T00:00:00.000Z'),
      review('g25-9.c', 'rejected', 'h1', '2026-10-30T01:00:00.000Z'),
      review('g25-4.4', 'rejected', 'h2', '2026-10-30T00:00:00.000Z'),
      review('g25-4.4', 'approved', 'h2', '2026-10-30T01:00:00.000Z'),
    ]
    expect(approvedLinks(LINKS, [...reviews].reverse()).map((l) => l.id)).toEqual(['g25-4.4'])
  })

  it('a changed reason needs a new decision', () => {
    const changed = LINKS.map((l) => (l.id === 'g25-9.c' ? { ...l, reason: reason('new text'), hash: 'h1-new' } : l))
    const reviews = [review('g25-9.c', 'approved', 'h1')]
    expect(approvedLinks(changed, reviews)).toEqual([])
    const status = linkStatuses(changed, reviews).find((l) => l.id === 'g25-9.c')
    expect(status.status).toBe('pending')
    expect(status.reviewedAt).toBeNull()
  })

  it('statuses: approved, rejected, revise = pending, none = pending', () => {
    const reviews = [review('g25-9.c', 'approved', 'h1', '2026-10-30T02:00:00.000Z'), review('g25-4.4', 'rejected', 'h2'), review('g21-9.5', 'revise', 'h3')]
    const byId = Object.fromEntries(linkStatuses(LINKS, reviews).map((l) => [l.id, l]))
    expect(byId['g25-9.c']).toMatchObject({ status: 'approved', reviewedAt: '2026-10-30T02:00:00.000Z', reviewedBy: 'owner' })
    expect(byId['g25-4.4'].status).toBe('rejected')
    expect(byId['g21-9.5'].status).toBe('pending')
    expect(byId['kn:2.C.4.a-4.4']).toMatchObject({ status: 'pending', reviewedAt: null })
  })
})

describe('role and item links', () => {
  const approved = approvedLinks(LINKS, approveAll())

  it('role inherits its 2-digit group links', () => {
    expect(roleLinks(approved, '2512.01').map((l) => l.id)).toEqual(['g25-9.c', 'g25-4.4'])
    expect(roleLinks(approved, '2111').map((l) => l.id)).toEqual(['g21-9.5'])
    expect(roleLinks(approved, '9999')).toEqual([])
    expect(roleLinks(approved, null)).toEqual([])
  })

  it('item links by key; goals of a role ascending', () => {
    expect(itemLinks(approved, 'kn:2.C.4.a').map((l) => l.id)).toEqual(['kn:2.C.4.a-4.4'])
    expect(itemLinks(approved, 'el:9.9.9')).toEqual([])
    expect(goalsOfRole(approved, '2512')).toEqual([4, 9])
  })

  it('path counts role links plus links of gap items', () => {
    const out = pathContribution(approved, '2512', ['kn:2.C.4.a', 'kn:2.C.7.a', 'kn:2.C.4.a', 'el:none'])
    expect(out.total).toBe(4)
    expect(out.goals.map((g) => g.goal)).toEqual([4, 9, 16])
    const g4 = out.goals.find((g) => g.goal === 4)
    expect(g4.count).toBe(2)
    expect(g4.links).toEqual([
      { target: '4.4', reason: reason('skills'), approvedAt: null, via: { kind: 'role', code: '25', name: null } },
      { target: '4.4', reason: reason('maths'), approvedAt: null, via: { kind: 'item', code: 'kn:2.C.4.a', name: 'Mathematics' } },
    ])
    expect(out.goals.find((g) => g.goal === 16).links[0].via).toEqual({ kind: 'item', code: 'kn:2.C.7.a', name: 'Law' })
  })

  it('each path link carries the date the owner approved it, for role and item links', () => {
    const dated = approved.map((l, i) => ({ ...l, approvedAt: `2026-10-3${i % 2}T00:00:00.000Z` }))
    const out = pathContribution(dated, '2512', ['kn:2.C.4.a'])
    const all = out.goals.flatMap((g) => g.links)
    const item = all.find((l) => l.via.kind === 'item')
    expect(item.approvedAt).toBe(dated.find((l) => l.code === 'kn:2.C.4.a').approvedAt)
    for (const l of all) expect(l.approvedAt).toMatch(/^2026-10-3[01]T/)
  })

  it('a path with nothing approved is empty', () => {
    expect(pathContribution([], '2512', ['kn:2.C.4.a'])).toEqual({ goals: [], total: 0 })
  })

  it('M16 shownLinks: every team-draft link but the rejected ones; approvedAt only on approved links (revise = not reviewed)', () => {
    const reviews = [
      review('g25-9.c', 'approved', 'h1', '2026-10-31T02:00:00.000Z'),
      review('g25-4.4', 'rejected', 'h2'),
      review('g21-9.5', 'revise', 'h3'),
      review('el:2.A.1.a-4.6', 'approved', 'old-hash'),
    ]
    const shown = shownLinks(LINKS, reviews)
    expect(shown.map((l) => l.id)).toEqual(['g25-9.c', 'g21-9.5', 'el:2.A.1.a-4.6', 'kn:2.C.4.a-4.4', 'kn:2.C.7.a-16.10'])
    const byId = Object.fromEntries(shown.map((l) => [l.id, l]))
    expect(byId['g25-9.c'].approvedAt).toBe('2026-10-31T02:00:00.000Z')
    expect(byId['g21-9.5'].approvedAt).toBeNull()
    // a decision made on older link text does not apply
    expect(byId['el:2.A.1.a-4.6'].approvedAt).toBeNull()
    expect(byId['kn:2.C.4.a-4.4'].approvedAt).toBeNull()
    expect(shown.every((l) => !('reviewId' in l) && !('reviewedBy' in l))).toBe(true)
    expect(shownLinks(LINKS, []).length).toBe(LINKS.length)
    // the path counts every shown link
    expect(pathContribution(shown, '2512', ['kn:2.C.4.a']).total).toBe(2)
  })

  it('no returned key suggests a score, weight, rank or opportunity', () => {
    const outputs = [approved, linkStatuses(LINKS, approveAll()), roleLinks(approved, '25'), itemLinks(approved, 'kn:2.C.4.a'), pathContribution(approved, '2512', ['kn:2.C.4.a'])]
    for (const out of outputs) expect(keysDeep(out).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([])
  })
})
