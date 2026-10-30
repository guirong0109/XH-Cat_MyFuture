import { describe, expect, it } from 'vitest'
import { ICONS, LOCK, SPRITE, pixelArt, pixelDigits } from '../public/js/components/pixel.js'
import welcome, { STAGES } from '../public/js/screens/welcome.js'
import { t as translate } from '../shared/i18n.js'

const page = (lang = 'en') => welcome({ t: (key, vars) => translate(lang, key, vars), state: { lang } })
const howSection = (lang) => { const html = page(lang); return html.slice(html.indexOf('id="how"'), html.indexOf('id="data"')) }

describe('pixel art', () => {
  it('every stage still to come has a 12 × 12 icon drawn with # and .', () => {
    for (const stage of STAGES.filter((one) => !one.live)) {
      const rows = ICONS[stage.id]
      expect(rows, stage.id).toHaveLength(12)
      for (const row of rows) expect(row).toMatch(/^[#.]{12}$/)
    }
    for (const rows of [LOCK, SPRITE]) for (const row of rows) expect(row).toMatch(/^[#.]+$/)
  })

  it('draws each run of filled squares as one crisp rectangle', () => {
    const svg = pixelArt(['##.#', '....'], 'x')
    expect(svg).toContain('viewBox="0 0 4 2"')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('M0 0h2v1h-2z')
    expect(svg).toContain('M3 0h1v1h-1z')
    expect(svg.match(/M\d/g)).toHaveLength(2)
  })

  it('writes numbers in a 3 × 5 pixel face, one column apart, with the plain number for screen readers', () => {
    const html = pixelDigits('01')
    expect(html).toContain('<span class="lp-sr">01</span>')
    expect(html).toContain('viewBox="0 0 7 5"')
  })
})

describe('how it works, pixel layer', () => {
  it('each stage card shows its pixel icon and pixel number; the five next modules show a lock', () => {
    const how = howSection('en')
    expect(how.match(/class="px px-icon"/g)).toHaveLength(STAGES.length - 1)
    expect(how.match(/<span class="lp-sr">0\d<\/span>/g)).toHaveLength(STAGES.length)
    expect(how.split(translate('en', 'ldNext')).length - 1).toBe(STAGES.length - 1)
  })

  it('the working card shows the six-block path with the player on the built stage, in every language', () => {
    for (const lang of ['en', 'ms', 'zh']) {
      const how = howSection(lang)
      const built = translate(lang, 'ldBuilt', { n: 1, total: STAGES.length })
      expect(how).toContain(built)
      expect(how.match(/class="lp-quest-step[ "]/g)).toHaveLength(STAGES.length)
      expect(how.match(/class="lp-quest-step on"/g)).toHaveLength(STAGES.filter((stage) => stage.live).length)
      expect(how).toContain('class="px px-sprite"')
    }
  })
})
