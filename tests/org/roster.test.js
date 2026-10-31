// Tests for the roster CSV reader and checker of the organisation view.
import { describe, it, expect } from 'vitest'
import { parseCsv } from '../../server/org/csv.js'
import { checkRoster, RosterError } from '../../server/org/roster.js'

const HEADER = 'name,group,current_role_code,skill,level'
const MAP = {
  mathematics: { name: 'Mathematics', canonicalId: 'onet:kn:2.C.4.a' },
  'active listening': { name: 'Active Listening', canonicalId: 'onet:el:2.A.1.b' },
  excel: { name: 'Microsoft Excel', canonicalId: 'onet:tech:Microsoft Excel' }
}
const normalizeSkill = async (text) =>
  MAP[String(text).trim().toLowerCase()] || { name: text, canonicalId: null }

const run = (text, extra = {}) =>
  checkRoster({
    bytes: Buffer.from(text, 'utf8'),
    type: 'hr',
    groups: ['Sales'],
    roleCodes: new Set(['2411', '3115']),
    normalizeSkill,
    ...extra
  })

describe('parseCsv', () => {
  it('reads quotes, commas and doubled quotes', () => {
    expect(parseCsv('a,"b,c","d ""q"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['1', '2', '3']
    ])
  })
  it('gives no row for a trailing empty line', () => {
    expect(parseCsv('a,b\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('throws not_csv on an unclosed quote', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(RosterError)
    try { parseCsv('a,"b') } catch (e) { expect(e.code).toBe('not_csv') }
  })
})

describe('checkRoster', () => {
  const good = [
    HEADER,
    'Aisha,Sales,2411,Mathematics,good',
    'Aisha,Sales,2411,Excel,expert',
    'Ben,Sales,3115,Active Listening,basic',
    'Cara,Ops,2411,,'
  ].join('\n')

  it('accepts a good file and groups people', async () => {
    const r = await run(good)
    expect(r.accepted).toBe(4)
    expect(r.rejected).toEqual([])
    expect(r.unrecognised).toEqual([{ row: 3, skill: 'Excel' }])
    expect(r.people).toHaveLength(3)
    expect(r.people[0]).toEqual({
      name: 'Aisha',
      group: 'Sales',
      currentCode: '2411',
      skills: [{ key: 'kn:2.C.4.a', name: 'Mathematics', level: 'good' }]
    })
    expect(r.people[2].skills).toEqual([])
    expect(r.newGroups).toEqual(['Ops'])
  })

  it('parses BOM + CRLF the same as the plain file', async () => {
    const plain = await run(good)
    const bom = await run('﻿' + good.replace(/\n/g, '\r\n') + '\r\n')
    expect(bom).toEqual(plain)
  })

  it('rejects with exact reasons and row numbers', async () => {
    const r = await run([
      HEADER,
      ',Sales,2411,Mathematics,good',
      'Dan,Sales,9999,Mathematics,good',
      'Eve,Sales,2411,Mathematics,great',
      'Fay,Sales,2411,Mathematics,good',
      'Fay,Ops,2411,Mathematics,good',
      'Gus,Sales,3115,Mathematics,Not Assessed'
    ].join('\n'))
    expect(r.rejected).toEqual([
      { row: 2, reason: 'name is empty' },
      { row: 3, reason: 'role code 9999 is not in eMASCO' },
      { row: 4, reason: "level 'great' is not basic / good / expert / not assessed" },
      { row: 6, reason: 'same person with a different group or role' }
    ])
    expect(r.accepted).toBe(2)
    expect(r.people.find((p) => p.name === 'Gus').skills[0].level).toBe('not_assessed')
  })

  it('rejects a role code for career centres, accepts none', async () => {
    const r = await run([
      HEADER,
      'Hana,Cohort A,2411,Mathematics,good',
      'Ian,Cohort A,,Mathematics,good'
    ].join('\n'), { type: 'centre' })
    expect(r.rejected).toEqual([{ row: 2, reason: 'career centres have no current role' }])
    expect(r.people).toHaveLength(1)
    expect(r.people[0].currentCode).toBeNull()
    expect(r.accepted).toBe(1)
  })

  it('throws not_utf8, too_large and bad_header', async () => {
    await expect(checkRoster({ bytes: Buffer.from([0x4e, 0xe9]), type: 'hr', groups: [], roleCodes: new Set(), normalizeSkill }))
      .rejects.toMatchObject({ code: 'not_utf8' })
    await expect(checkRoster({ bytes: Buffer.alloc(1_048_577, 97), type: 'hr', groups: [], roleCodes: new Set(), normalizeSkill }))
      .rejects.toMatchObject({ code: 'too_large' })
    await expect(run('Name;Group\nA;B')).rejects.toMatchObject({ code: 'bad_header' })
    await expect(run('')).rejects.toMatchObject({ code: 'bad_header' })
  })

  it('keeps the higher level for a repeated skill, with a note', async () => {
    const r = await run([
      HEADER,
      'Jo,Sales,2411,Mathematics,basic',
      'Jo,Sales,2411,Mathematics,expert',
      'Jo,Sales,2411,Active Listening,expert',
      'Jo,Sales,2411,Active Listening,not assessed'
    ].join('\n'))
    expect(r.people[0].skills).toEqual([
      { key: 'kn:2.C.4.a', name: 'Mathematics', level: 'expert' },
      { key: 'el:2.A.1.b', name: 'Active Listening', level: 'expert' }
    ])
    expect(r.notes).toEqual([
      { row: 3, note: 'skill listed twice; the higher level is kept' },
      { row: 5, note: 'skill listed twice; the higher level is kept' }
    ])
  })

  it('accepts a centre row with an empty code', async () => {
    const r = await run(`${HEADER}\nKai,Cohort,,Mathematics,good`, { type: 'centre' })
    expect(r.people[0].currentCode).toBeNull()
  })
})
