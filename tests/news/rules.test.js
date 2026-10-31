// AI news rules (spec §5, plan Task 1): the query, the usable check, repeats, merge and the For-you fields. Pure code.
import { describe, expect, it } from 'vitest'
import { LANGUAGE, MAX_AGE_DAYS, MAX_ITEMS, QUERY_MAX, buildQuery, forYouFields, mergeItems, newItems, usableItem } from '../../shared/news/rules.js'

const runAt = new Date('2026-10-31T06:00:00Z')
const raw = (o = {}) => ({ title: 'AI tutors in schools', url: 'https://news.example.com/a', site_name: 'Example News', date: '2026-10-30T00:00:00+00:00', snippet: 'Short text', rerank_score: 2, ...o })
const CODES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']

describe('news rules', () => {
  it('has the spec values', () => {
    expect({ MAX_ITEMS, MAX_AGE_DAYS, QUERY_MAX, LANGUAGE }).toEqual({ MAX_ITEMS: 25, MAX_AGE_DAYS: 30, QUERY_MAX: 128, LANGUAGE: 'en' })
  })

  it('buildQuery adds the 30-day date and language', () => {
    expect(buildQuery('education teaching schools', runAt)).toBe('"artificial intelligence" education teaching schools after:2026-10-01 lang:en')
  })

  it('buildQuery refuses more than 128 characters', () => {
    expect(() => buildQuery('x'.repeat(120), runAt)).toThrow(RangeError)
  })

  it('usableItem keeps only the five display fields', () => {
    expect(usableItem(raw(), runAt)).toEqual({ title: 'AI tutors in schools', url: 'https://news.example.com/a', site: 'Example News', date: '2026-10-30T00:00:00+00:00', snippet: 'Short text' })
  })

  it('usableItem falls back to the host for the site', () => {
    expect(usableItem(raw({ site_name: null }), runAt).site).toBe('news.example.com')
  })

  it('usableItem gives an empty snippet when there is none', () => {
    expect(usableItem(raw({ snippet: undefined }), runAt).snippet).toBe('')
  })

  it.each([
    ['no title', { title: '  ' }],
    ['title not text', { title: 42 }],
    ['javascript link', { url: 'javascript:alert(1)' }],
    ['no host', { url: 'https://' }],
    ['link not text', { url: null }],
    ['no date', { date: null }],
    ['bad date', { date: '2026-13-45' }],
    ['future date', { date: '2026-10-31T07:00:00Z' }],
    ['older than 30 days', { date: '2026-09-30T05:59:59Z' }],
  ])('usableItem drops %s', (_, o) => {
    expect(usableItem(raw(o), runAt)).toBeNull()
  })

  it('usableItem drops a result that is not an object', () => {
    expect(usableItem(null, runAt)).toBeNull()
    expect(usableItem('x', runAt)).toBeNull()
  })

  it('mergeItems drops repeats by link (host case, trailing slash, utm_*) and by headline, earlier kept wins', () => {
    const kept = [{ ...usableItem(raw(), runAt), foundAt: '2026-10-30T00:00:00.000Z' }]
    const fresh = [
      usableItem(raw({ url: 'https://NEWS.example.com/a/?utm_source=x', title: 'Other' }), runAt),
      usableItem(raw({ url: 'https://b.example.com/z', title: 'AI Tutors, in schools!' }), runAt),
    ]
    const out = mergeItems(kept, fresh, runAt)
    expect(out).toHaveLength(1)
    expect(out[0].foundAt).toBe('2026-10-30T00:00:00.000Z')
  })

  it('mergeItems keeps links that differ in other query parameters', () => {
    const fresh = [usableItem(raw({ url: 'https://e.com/p?id=1', title: 'One' }), runAt), usableItem(raw({ url: 'https://e.com/p?id=2', title: 'Two' }), runAt)]
    expect(mergeItems([], fresh, runAt)).toHaveLength(2)
  })

  it('mergeItems sorts newest first, ties by url, caps at 25, re-applies the age rule', () => {
    const fresh = Array.from({ length: 30 }, (_, i) => usableItem(raw({ url: `https://e.com/${String(i).padStart(2, '0')}`, title: `T${i}`, date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T12:00:00Z` }), runAt))
    const out = mergeItems([{ ...fresh[0], url: 'https://old.com/x', title: 'Old', date: '2026-09-01T00:00:00Z', foundAt: '2026-09-01T00:00:00.000Z' }], fresh, runAt)
    expect(out).toHaveLength(25)
    expect(out.some((i) => i.title === 'Old')).toBe(false)
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].date >= out[i].date).toBe(true)
      if (out[i - 1].date === out[i].date) expect(out[i - 1].url < out[i].url).toBe(true)
    }
    expect(out.every((i) => i.foundAt === runAt.toISOString())).toBe(true)
  })

  describe('Amendment 1: a trailing site name does not make a new headline', () => {
    const base = 'AI is coming to construction sites. But does it make workers safer?'
    const two = (a, b) => mergeItems([], [usableItem(raw({ title: a, url: 'https://a.com/1' }), runAt), usableItem(raw({ title: b, url: 'https://b.com/2' }), runAt)], runAt)

    it.each([' | News', ' - CNBC', ' – Site', ' — The Star'])('"%s" at the end is the same story', (suffix) => {
      const out = two(base, base + suffix)
      expect(out).toHaveLength(1)
      expect(out[0].title).toBe(base)
    })

    it('an ending longer than 40 characters is kept as part of the headline', () => {
      expect(two('Big news', 'Big news - ' + 'x'.repeat(41))).toHaveLength(2)
    })

    it('a short headline before the separator is not a site-name ending (final review)', () => {
      expect(two('Rust', 'Rust - the language')).toHaveLength(2)
    })

    it.each([
      ['Opinion | Why AI will change the law', 'Opinion | Teachers should embrace AI tutors'],
      ['Interview - Jane Doe', 'Interview - John Smith'],
      ['AI in schools: 5 things to know - Part 1', 'AI in schools: 5 things to know - Part 2'],
      ['Live updates - OpenAI DevDay', 'Live updates - Google I/O'],
      ['AI - The future of farming', 'AI - What it means for nurses'],
      ['Podcast | Episode 12: AI and jobs', 'Podcast | Episode 13: AI and jobs'],
    ])('different articles "%s" and "%s" are both kept (final review)', (a, b) => {
      expect(two(a, b)).toHaveLength(2)
    })
  })

  it('newItems gives the found items that repeat neither a kept item nor an earlier found one', () => {
    const kept = [{ ...usableItem(raw(), runAt), checked: true }]
    const repeat = usableItem(raw({ url: 'https://other.com/x', title: 'AI tutors in schools | Daily' }), runAt)
    const fresh = usableItem(raw({ url: 'https://n.com/1', title: 'New story' }), runAt)
    const copy = usableItem(raw({ url: 'https://n.com/1?utm_medium=y', title: 'Other words' }), runAt)
    expect(newItems(kept, [repeat, fresh, copy], runAt)).toEqual([fresh])
  })

  it('forYouFields gives each broad field once in profile order, ignoring 00, 99 and junk', () => {
    const profile = { education: { records: [{ field: { code: '0613' } }, { field: { code: '0011' } }, { field: null }, { field: { code: '0912' } }, { field: { code: '0688' } }, { field: { code: '99' } }, { field: { code: 'ab' } }, {}] } }
    expect(forYouFields(profile, CODES)).toEqual(['06', '09'])
  })

  it('forYouFields gives nothing without a profile or records', () => {
    expect(forYouFields(null, CODES)).toEqual([])
    expect(forYouFields({ education: {} }, CODES)).toEqual([])
  })

  it('reply keys never use the forbidden names', () => {
    expect(JSON.stringify(mergeItems([], [usableItem(raw(), runAt)], runAt))).not.toMatch(/score|weight|rank/i)
  })
})
