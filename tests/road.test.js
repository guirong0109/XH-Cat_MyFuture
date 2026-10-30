import { describe, expect, it } from 'vitest'
import { STOPS, VIEW, grid, road, roadWidth } from '../public/js/components/road.js'
import welcome, { STAGES } from '../public/js/screens/welcome.js'
import { t as translate } from '../shared/i18n.js'

const page = (lang = 'en') => welcome({ t: (key, vars) => translate(lang, key, vars), state: { lang } })
const howSection = (lang) => { const html = page(lang); return html.slice(html.indexOf('id="how"'), html.indexOf('id="data"')) }

describe('3D roadmap geometry', () => {
  it('has a stop for each stage still to come, each further right and further away than the one before', () => {
    expect(STOPS).toHaveLength(STAGES.filter((stage) => !stage.live).length)
    for (let i = 1; i < STOPS.length; i += 1) {
      expect(STOPS[i][0]).toBeGreaterThan(STOPS[i - 1][0])
      expect(STOPS[i][1]).toBeLessThan(STOPS[i - 1][1])
    }
  })

  it('the road narrows with distance and passes through every stop', () => {
    expect(roadWidth(STOPS.at(-1)[1])).toBeLessThan(roadWidth(STOPS[0][1]))
    const { centre, left, right } = road()
    for (const [x, y] of STOPS) expect(centre).toContain(`${x} ${y}`)
    expect(left.split(' ').length).toBe(right.split(' ').length)
  })

  it('the ground grid stays below the horizon', () => {
    for (const [, y1, , y2] of grid()) {
      expect(y1).toBeGreaterThan(VIEW.horizon)
      expect(y2).toBeGreaterThan(VIEW.horizon)
    }
  })
})

describe('how it works: the white card, then the roadmap', () => {
  it('keeps the working stage card and puts the five next stages on the road as signs', () => {
    const how = howSection('en')
    expect(how).toContain('class="lp-stage lp-stage-live"')
    expect(how.match(/class="lp-sign"/g)).toHaveLength(STOPS.length)
    expect(how).toContain('class="lp-road-scene"')
    for (const stage of STAGES) expect(how).toContain(translate('en', stage.title))
    expect(how.indexOf('lp-stage-live')).toBeLessThan(how.indexOf('lp-road'))
  })
})
