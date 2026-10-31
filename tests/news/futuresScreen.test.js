// Compare futures → AI news screen (spec §8, plan Task 5). Render functions on a hand-made /api/news reply.
import { describe, expect, it } from 'vitest'
import { futuresView, myt } from '../../public/js/screens/futures.js'
import { t as translate } from '../../shared/i18n.js'
import en from '../../shared/strings/en.js'
import ms from '../../shared/strings/ms.js'
import zh from '../../shared/strings/zh.js'

const t = (key, vars) => translate('en', key, vars)
const TITLES = ['Education', 'Arts and humanities', 'Social sciences, journalism and information', 'Business, administration and law', 'Natural sciences, mathematics and statistics', 'Information and Communication Technologies (ICTs)', 'Engineering, manufacturing and construction', 'Agriculture, forestry, fisheries and veterinary', 'Health and welfare', 'Services']
const ITEMS = [
  { title: 'AI finds bugs', url: 'https://a.example.com/1', site: 'A News', date: '2026-10-30T00:00:00Z', snippet: 'A short text.', foundAt: '2026-10-31T06:00:00.000Z' },
  { title: 'Second story', url: 'https://b.example.com/2', site: 'B Daily', date: '2026-10-29T00:00:00Z', snippet: 'More.', foundAt: '2026-10-31T06:00:00.000Z' },
]
const reply = (change = {}) => ({
  enabled: true, source: 'DeepSeek Search', refreshEveryHours: 3, nextRunAt: '2026-10-31T09:00:00.000Z', rules: { maxItems: 25, maxAgeDays: 30, language: 'en' },
  fields: TITLES.map((title, i) => {
    const code = String(i + 1).padStart(2, '0')
    return { code, title, query: `"artificial intelligence" words${code} after:2026-10-01 lang:en`, searchedAt: '2026-10-31T06:00:00.000Z', lastAttemptAt: '2026-10-31T06:00:00.000Z', lastOutcome: code === '06' ? 'ok' : 'no_results', items: code === '06' ? ITEMS : [], ...(change[code] ?? {}) }
  }),
  ...(change.top ?? {}),
})
const ict = { education: { records: [{ field: { code: '0613', title: 'Software' } }] } }
const view = (news, profile = ict) => futuresView({ t, state: { lang: 'en', profile, news } })

describe('futures screen', () => {
  it('myt shows Malaysia time', () => {
    expect(myt('2026-10-31T07:00:00Z')).toBe('2026-10-31 15:00 MYT')
  })

  it('For you shows the profile field list with links, site, date, snippet and the source line', () => {
    const html = view({ tab: 'you', field: null, data: reply(), loading: false, failed: false })
    expect(html).toContain(TITLES[5])
    expect(html).toContain('<a href="https://a.example.com/1" target="_blank" rel="noopener noreferrer">AI finds bugs</a>')
    expect(html).toContain('A News')
    expect(html).toContain('Published 2026-10-30 08:00 MYT')
    expect(html).toContain('A short text.')
    expect(html).toContain('Found by DeepSeek Search for “&quot;artificial intelligence&quot; words06 after:2026-10-01 lang:en”')
    expect(html).toContain('updated 2026-10-31 14:00 MYT')
    expect(html).toContain('next refresh about 2026-10-31 17:00 MYT')
    expect(html).toContain('the last 30 days; repeats removed; newest 25.')
    expect(html).not.toContain(TITLES[0])
  })

  it('For you shows one list per profile field, in profile order', () => {
    const profile = { education: { records: [{ field: { code: '0912' } }, { field: { code: '0613' } }] } }
    const html = view({ tab: 'you', field: null, data: reply(), loading: false, failed: false }, profile)
    expect(html.indexOf(TITLES[8])).toBeGreaterThan(-1)
    expect(html.indexOf(TITLES[8])).toBeLessThan(html.indexOf(TITLES[5]))
  })

  it('For you without a study field asks for one and offers Explore all', () => {
    const html = view({ tab: 'you', field: null, data: reply(), loading: false, failed: false }, { education: { records: [] } })
    expect(html).toContain(en.nwNoField)
    expect(html).toContain('data-go="form"')
    expect(html).toContain('data-act="newsTab" data-arg="all"')
  })

  it('Explore all has a picker of the 10 fields, marks the own field and shows one list', () => {
    const html = view({ tab: 'all', field: '06', data: reply(), loading: false, failed: false })
    expect(html.match(/data-act="newsField"/g)).toHaveLength(10)
    expect(html).toMatch(/data-arg="06"[^>]*>[^<]*Information and Communication Technologies \(ICTs\)<small>your field<\/small>/)
    expect(html.match(/class="nw-list"/g)).toHaveLength(1)
  })

  it('Explore all starts on the first own field, else 01', () => {
    expect(view({ tab: 'all', field: null, data: reply(), loading: false, failed: false })).toContain('AI finds bugs')
    expect(view({ tab: 'all', field: null, data: reply(), loading: false, failed: false }, null)).toContain('words01')
  })

  it('a failed refresh keeps the list and says so with both times', () => {
    const html = view({ tab: 'you', field: null, data: reply({ '06': { lastOutcome: 'failed', lastAttemptAt: '2026-10-31T09:00:00.000Z' } }), loading: false, failed: false })
    expect(html).toContain("Couldn&#39;t refresh at 2026-10-31 17:00 MYT; showing the list from 2026-10-31 14:00 MYT.")
    expect(html).toContain('AI finds bugs')
  })

  it('a field with no items says no news yet; a field never searched says not yet', () => {
    const html = view({ tab: 'all', field: '01', data: reply({ '01': { searchedAt: null, lastAttemptAt: null, lastOutcome: null } }), loading: false, failed: false })
    expect(html).toContain(en.nwEmpty)
    expect(html).toContain('updated not yet')
  })

  it('news off shows only the off line', () => {
    const html = view({ tab: 'you', field: null, data: reply({ top: { enabled: false, nextRunAt: null } }), loading: false, failed: false })
    expect(html).toContain(en.nwOff)
    expect(html).not.toContain('AI finds bugs')
  })

  it('loading and load failure', () => {
    expect(view({ tab: 'you', field: null, data: null, loading: true, failed: false })).toContain(en.nwLoading)
    const failed = view({ tab: 'you', field: null, data: null, loading: false, failed: true })
    expect(failed).toContain(en.nwLoadFailed.replace("'", '&#39;'))
    expect(failed).toContain('data-act="newsRetry"')
  })

  it('DeepSeek text is escaped and a non-web link gives no link', () => {
    const bad = [{ ...ITEMS[0], title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', snippet: '<script>x</script>' }]
    const html = view({ tab: 'you', field: null, data: reply({ '06': { items: bad } }), loading: false, failed: false })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('javascript:')
  })

  describe('Amendment 1: English only and how results were checked', () => {
    const one = (top, field06 = {}) => view({ tab: 'you', field: null, data: reply({ top, '06': field06 }), loading: false, failed: false })

    it('every list says English articles only', () => {
      expect(one({})).toContain('Kept: English articles only; a title, a link and a publish date in the last 30 days; repeats removed; newest 25.')
    })

    it('shows the check line with the dropped count', () => {
      expect(one({ checkedBy: 'deepseek-flash' }, { dropped: 7 })).toContain('Checked by DeepSeek (deepseek-flash) as news about AI in this field · 7 results dropped as not news.')
    })

    it('leaves the dropped part out when nothing was dropped', () => {
      const html = one({ checkedBy: 'deepseek-flash' }, { dropped: 0 })
      expect(html).toContain('Checked by DeepSeek (deepseek-flash) as news about AI in this field')
      expect(html).not.toContain('dropped as not news')
    })

    it('an older reply without checkedBy has no check line', () => {
      expect(one({})).not.toContain('Checked by DeepSeek')
    })

    it('the model name is escaped', () => {
      expect(one({ checkedBy: '<b>x</b>' })).toContain('&lt;b&gt;x&lt;/b&gt;')
    })

    it('BM and Chinese say the articles are in English', () => {
      expect(ms.nwRules).toMatch(/Inggeris/)
      expect(zh.nwRules).toMatch(/英文/)
    })
  })

  it('every nw string exists in English, BM and Chinese', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('nw'))
    expect(keys.length).toBeGreaterThanOrEqual(19)
    for (const k of keys) {
      expect(ms[k]).toBeTruthy()
      expect(zh[k]).toBeTruthy()
    }
  })
})
