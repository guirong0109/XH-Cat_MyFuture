import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import welcome, { DATA_FACTS, GUIDE_FACTS, STAGES } from '../public/js/screens/welcome.js'
import { t as translate } from '../shared/i18n.js'

const page = (lang = 'en') => welcome({ t: (key, vars) => translate(lang, key, vars), state: { lang } })
const rows = async (file) => (await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8')).trim().split('\n').slice(1)

describe('landing page', () => {
  it('starts the journey and switches language from the page', () => {
    const html = page()
    expect(html.match(/data-go="access"/g).length).toBeGreaterThanOrEqual(2)
    for (const lang of ['en', 'ms', 'zh']) expect(html).toContain(`data-act="lang" data-arg="${lang}"`)
  })

  it('every figure quoted from the Finalist Guide names its source on screen', () => {
    expect(GUIDE_FACTS.map((fact) => fact.value)).toEqual(['56%', '26%', '600,000+'])
    for (const lang of ['en', 'ms', 'zh']) {
      const html = page(lang)
      for (const fact of GUIDE_FACTS) {
        expect(fact.source).toBeTruthy()
        expect(html).toContain(translate(lang, fact.source).replace(/&/g, '&amp;'))
      }
      expect(html).toContain(translate(lang, 'ldFactVia'))
    }
  })

  it('the data counts on the page match the data files', async () => {
    const count = Object.fromEntries(DATA_FACTS.map((fact) => [fact.id, fact.count]))
    expect(count.onet).toBe((await rows('onet/occupations.tsv')).length)
    const emasco = JSON.parse(await readFile(new URL('../data/emasco/occupations.json', import.meta.url), 'utf8'))
    expect(count.emasco).toBe(emasco.roles.length)
    expect(count.isced).toBe((await rows('isced/fields.tsv')).length)
    expect(count.interests).toBe(new Set((await rows('onet/interest_areas.tsv')).map((row) => row.split('\t')[0])).size)
    const isced = JSON.parse(await readFile(new URL('../data/isced/manifest.json', import.meta.url), 'utf8'))
    expect(DATA_FACTS.find((fact) => fact.id === 'isced').linked).toBe(isced.bridge.fieldsLinkedToOnet)
    for (const fact of DATA_FACTS) expect(page()).toContain(translate('en', fact.source))
  })

  it('shows the six stages of the guide; only the profile works now', () => {
    expect(STAGES).toHaveLength(6)
    expect(STAGES.filter((stage) => stage.live).map((stage) => stage.id)).toEqual(['profile'])
    const html = page()
    expect(html.split(translate('en', 'ldNext')).length - 1).toBe(5)
    for (const stage of STAGES) expect(html).toContain(translate('en', stage.title))
  })

  it('keeps the ATM story marked as draft copy', () => {
    expect(page()).toContain(translate('en', 'atmNote'))
  })

  it('the first section holds the receipt story, the headline and the two buttons together', () => {
    const html = page()
    const first = html.slice(html.indexOf('<section class="lp-atm"'), html.indexOf('</section>', html.indexOf('<section class="lp-atm"')))
    expect(first).toContain(translate('en', 'heroEm'))
    expect(first).toContain('data-go="access"')
    expect(first).toContain('data-act="scrollTo" data-arg="how"')
    for (const key of ['atmTitle', 'atmBody', 'atmNote']) expect(first).toContain(translate('en', key).replace(/"/g, '&quot;'))
    expect(html.indexOf('lp-atm')).toBeLessThan(html.indexOf('id="gap"'))
  })

  it('lists the six stages only once, in How it works (no stage strip under the first section)', () => {
    const html = page()
    expect(html).not.toContain('lp-strip')
    expect(html.split(translate('en', 'ldS2T')).length - 1).toBe(1)
  })

  it('every section of the page keeps its styles in landing.css', async () => {
    const css = await readFile(new URL('../public/landing.css', import.meta.url), 'utf8')
    for (const rule of ['.lp-nav{', '.lp-atm{', '.lp-tally{', '.lp-bento{', '.lp-stage-live{', '.lp-ticks{', '.lp-data{',
      '.lp-principles{', '.lp-list{', '.lp-close{', '.lp-footer{']) expect(css).toContain(rule)
    for (const [, name] of css.matchAll(/^\.(lp-[\w-]+)\{/gm)) expect(css.match(new RegExp(`^\\.${name}\\{`, 'gm'))).toHaveLength(1)
  })

  it('the second section shows the figures side by side: a heading, the counter and a caption each, no bars', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const html = page(lang)
      const gap = html.slice(html.indexOf('id="gap"'), html.indexOf('id="how"'))
      expect(gap).toContain(translate(lang, 'ldFactsTitle'))
      expect(gap.match(/class="lp-tally-col"/g)).toHaveLength(GUIDE_FACTS.length)
      expect(gap.match(/class="odo"/g)).toHaveLength(GUIDE_FACTS.length)
      for (const fact of GUIDE_FACTS) {
        expect(gap).toContain(translate(lang, fact.heading))
        expect(gap).toContain(translate(lang, fact.label))
      }
      expect(gap).toContain(translate(lang, 'ldGap', { n: 30 }))
      expect(gap).not.toContain('lp-track')
    }
  })
})
