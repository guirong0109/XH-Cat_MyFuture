import { describe, expect, it } from 'vitest'
import { odometer, rollPlan } from '../public/js/components/odometer.js'
import welcome, { DATA_FACTS, GUIDE_FACTS, STAGES } from '../public/js/screens/welcome.js'
import { t as translate } from '../shared/i18n.js'

describe('roller counter plan', () => {
  it('splits a value into digit wheels, printed separators and a suffix', () => {
    const plan = rollPlan('600,000+')
    expect(plan.parts.map((part) => (part.kind === 'digit' ? part.digit : part.char)).join('')).toBe('600,000')
    expect(plan.suffix).toBe('+')
    expect(rollPlan('56%')).toMatchObject({ suffix: '%' })
    expect(rollPlan('1,016').suffix).toBe('')
  })

  it('each wheel stops on its digit, with the next digit below it for the overshoot', () => {
    for (const value of ['56%', '26%', '600,000+', '1,016', '1,766', '124', '41']) {
      for (const wheel of rollPlan(value).parts.filter((part) => part.kind === 'digit')) {
        expect(wheel.cells[wheel.to]).toBe(wheel.digit)
        expect(wheel.cells[wheel.to + 1]).toBe((wheel.digit + 1) % 10)
        expect(wheel.cells[0]).toBe(0)
      }
    }
  })

  it('lower digits travel further and stop later, so they roll faster', () => {
    const wheels = rollPlan('1,766').parts.filter((part) => part.kind === 'digit')
    for (let i = 1; i < wheels.length; i += 1) {
      expect(wheels[i].to).toBeGreaterThan(wheels[i - 1].to)
      expect(wheels[i].ms).toBeGreaterThan(wheels[i - 1].ms)
      expect(wheels[i].to / wheels[i].ms).toBeGreaterThan(wheels[i - 1].to / wheels[i - 1].ms)
    }
  })
})

describe('roller counter markup', () => {
  it('shows the final value without script, and gives screen readers the plain value', () => {
    const html = odometer('600,000+', 'x')
    expect(html).toContain('<span class="lp-sr">600,000+</span>')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-odo="x"')
    const wheel = rollPlan('600,000+').parts[0]
    expect(html).toContain(`style="--to:${wheel.to}" data-to="${wheel.to}" data-ms="${wheel.ms}"`)
  })

  it('each digit is its own window; separators sit between the windows, not inside one', () => {
    const html = odometer('600,000+', 'x')
    expect(html).not.toContain('odo-window')
    expect(html.match(/class="odo-wheel"/g)).toHaveLength(6)
    expect(html).toMatch(/<\/span><\/span><span class="odo-sep">,<\/span><span class="odo-wheel">/)
  })

  it('every number on the landing page is a roller counter', () => {
    const html = welcome({ t: (key, vars) => translate('en', key, vars), state: { lang: 'en' } })
    expect(html.match(/class="odo"/g)).toHaveLength(GUIDE_FACTS.length + DATA_FACTS.length + STAGES.length)
    for (const value of [...GUIDE_FACTS.map((fact) => fact.value), '1,016', '1,766', '124', '41']) {
      expect(html).toContain(`<span class="lp-sr">${value}</span>`)
    }
  })
})
