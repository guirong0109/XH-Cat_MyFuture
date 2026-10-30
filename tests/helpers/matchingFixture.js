// A small data dir for the matching API tests: the same files and headers as data/, with a BUILT occupation bridge
// (the real BLS steps are still pending, so on real data no role has a Skill Match yet). Manifests hold real SHA-256.
//
// Roles:
//   2521-03  full chain: MASCO 2521 -> ISCO 2521 -> SOC 2010 15-1141 -> SOC 2018 15-1242/15-1243 -> two O*NET jobs.
//            Moderate AI: observed tasks, automation 30% (does not change much); Rapid: ILO G1. DOSM group 2.
//   2512-01  chain stops at SOC 2010 (ISCO 2512 has no BLS row); Rapid: ILO G3 (AI may change much).
//   9999-01  MASCO unit 9999 is not in ISCO-08: chain stops at the first step; no AI data.
//   1113-01  unparsed stub (title null): never listed.
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const sha = (text) => createHash('sha256').update(text).digest('hex')
const tsv = (header, rows) => [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n') + '\n'

export const FIXTURE = {
  fullRole: '2521-03',
  brokenRole: '2512-01',
  noIscoRole: '9999-01',
  stubRole: '1113-01',
  bestJob: '15-1243.00',
  otherJob: '15-1242.00',
}

const ROLES = [
  { code: '1113-01', title: null, pageState: 'unparsed' },
  {
    code: '2512-01', title: 'Fixture Software Developer', description: 'Writes software.', url: 'https://emasco.mohr.gov.my/masco/2512-01',
    group: 'professionals', tags: [], qualification: '', tasks: ['Write code.'], skills: [{ text: 'Programming', type: 'specific' }], pageState: 'full',
  },
  {
    code: '2521-03', title: 'Fixture Database Designer', description: 'Designs databases.', url: 'https://emasco.mohr.gov.my/masco/2521-03',
    group: 'professionals', tags: ['TVET'], qualification: 'Degree', tasks: ['Design schemas.'], skills: [{ text: 'Database design', type: 'specific' }], pageState: 'full',
  },
  {
    code: '9999-01', title: 'Fixture Unknown Unit Role', description: 'No ISCO code.', url: 'https://emasco.mohr.gov.my/masco/9999-01',
    group: 'other', tags: [], qualification: '', tasks: [], skills: [], pageState: 'tasks_only',
  },
]

// kind element_id element code importance level suppress not_relevant
const REQUIREMENTS = [
  ['el', '2.A.1.a', 'Reading Comprehension', '15-1242.00', '4.00', '4.00', 'N', 'N'],
  ['el', '2.B.3.e', 'Programming', '15-1242.00', '3.50', '5.00', 'N', 'N'],
  ['kn', '2.C.3.a', 'Computers and Electronics', '15-1242.00', '4.20', '6.00', 'N', 'N'],
  ['el', '2.A.2.a', 'Critical Thinking', '15-1242.00', '3.50', '3.00', 'Y', 'N'],
  ['kn', '2.C.1.a', 'Administration and Management', '15-1242.00', '2.00', '3.00', 'N', 'N'],
  ['el', '2.A.1.a', 'Reading Comprehension', '15-1243.00', '4.00', '3.00', 'N', 'N'],
  ['kn', '2.C.3.a', 'Computers and Electronics', '15-1243.00', '4.00', '4.00', 'N', 'N'],
  ['el', '2.A.2.a', 'Critical Thinking', '15-1243.00', '3.80', '3.50', 'Y', 'N'],
  ['el', '2.A.1.a', 'Reading Comprehension', '15-1252.00', '4.00', '4.00', 'N', 'N'],
]
const TASKS = [
  ['101', '15-1242.00', 'Design database schemas.'],
  ['102', '15-1242.00', 'Tune queries.'],
  ['103', '15-1242.00', 'Back up data.'],
  ['201', '15-1243.00', 'Model data for reports.'],
  ['202', '15-1243.00', 'Write data dictionaries.'],
  ['202', '15-1243.00', 'Write data dictionaries.'],
  ['203', '15-1243.00', 'Meet users.'],
]
const AEI = [
  ['201', '2.0', '30.0', '70.0'],
  ['202', '1.0', '30.0', '70.0'],
  ['101', '1.0', '90.0', '10.0'],
]
const OCCUPATIONS = [
  ['15-1242.00', 'Database Administrators', 'Administer databases.'],
  ['15-1243.00', 'Database Architects', 'Design databases.'],
  ['15-1252.00', 'Software Developers', 'Develop software.'],
]
const SOFTWARE = [
  ['MySQL', '2.E.6.f', 'Data base user interface and query software', '15-1243.00'],
  ['Oracle Database', '2.E.6.f', 'Data base user interface and query software', '15-1243.00'],
  ['Python', '2.E.7.f', 'Object or component oriented development software', '15-1243.00'],
  ['MySQL', '2.E.6.f', 'Data base user interface and query software', '15-1242.00'],
]
const ILO = [
  ['2512', 'Software developers', '0.62', '0.10', 'G3'],
  ['2521', 'Database designers and administrators', '0.45', '0.12', 'G1'],
]

const SYS = {
  onet: { system: 'O*NET-SOC', version: '2019' }, soc18: { system: 'SOC', version: '2018' },
  soc10: { system: 'SOC', version: '2010' }, isco: { system: 'ISCO-08', version: '2008' }, masco: { system: 'MASCO', version: '2020' },
}
const src = (name) => ({ name, file: `${name}.csv`, url: `https://example.org/${name}`, sha256: 'abc' })
const step = (id, from, to, links, extra = {}) => ({ id, from, to, method: 'crosswalk', status: 'built', source: src(id), pendingReason: null, links, ...extra })

export const BRIDGE = {
  schemaVersion: 'radar-occupation-bridge/v1',
  builtAt: '2026-10-30',
  steps: [
    step('onet_to_soc2018', SYS.onet, SYS.soc18, { '15-1242.00': ['15-1242'], '15-1243.00': ['15-1243'], '15-1252.00': ['15-1252'] }),
    step('soc2018_to_soc2010', SYS.soc18, SYS.soc10, { '15-1242': ['15-1141'], '15-1243': ['15-1141'], '15-1252': ['15-1132'] }),
    step('soc2010_to_isco08', SYS.soc10, SYS.isco, { '15-1141': ['2521'] }),
    step('isco08_to_masco2020_major', SYS.isco, SYS.masco, {}, { status: 'pending', source: null, method: 'major_group_equivalence' }),
    step('masco2020_unit_to_isco08', SYS.masco, SYS.isco, { 2512: ['2512'], 2521: ['2521'] }, {
      method: 'same_code', label: 'code match, not an official table',
      source: { name: 'MASCO 2020 publication (MOHR): developed in accordance with ISCO; owner decision M15, 30 Oct 2026', url: 'https://jtksm.gov.my/x.pdf', file: null, sha256: null },
    }),
  ],
}

export const SDG_LINKS = [
  { id: 'g25-9.c', kind: 'masco_submajor', code: '25', name: null, target: '9.c', reason: { en: 'ICT professionals build access to ICT.', ms: 'ms', zh: 'zh' } },
  { id: 'g25-8.2', kind: 'masco_submajor', code: '25', name: null, target: '8.2', reason: { en: 'Productivity through technology.', ms: 'ms', zh: 'zh' } },
  { id: 'kn:2.C.3.a-4.4', kind: 'onet_element', code: 'kn:2.C.3.a', name: 'Computers and Electronics', target: '4.4', reason: { en: 'Digital skills for work.', ms: 'ms', zh: 'zh' } },
]
const TARGETS = {
  source: 'UN Statistics Division SDG API', url: 'https://unstats.un.org/SDGAPI/v1/sdg/Goal/{n}/Target/List', fetchedAt: '2026-10-30',
  goals: [{ code: '4', title: 'Quality education' }, { code: '8', title: 'Decent work' }, { code: '9', title: 'Industry, innovation and infrastructure' }],
  targets: [
    { code: '4.4', goal: '4', title: 'Increase the number of youth and adults who have relevant skills.' },
    { code: '8.2', goal: '8', title: 'Achieve higher levels of economic productivity.' },
    { code: '9.c', goal: '9', title: 'Increase access to ICT.' },
  ],
}

// Writes the fixture dir; returns {dir, cleanup}. `edit(files)` may change any file text before it is written
// (the manifests are computed after the edit unless `keepManifest` is set).
export async function makeMatchingFixture({ edit = null, keepManifest = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'matching-fixture-'))
  const files = {
    'emasco/role_details.json': JSON.stringify({ schemaVersion: 'emasco-role-details/v1', source: 'eMASCO (MASCO 2020), English pages, https://emasco.mohr.gov.my', fetchedAt: '2026-10-23', roles: ROLES }, null, 2) + '\n',
    'onet/requirements.tsv': tsv(['kind', 'element_id', 'element', 'code', 'importance', 'level', 'suppress', 'not_relevant'], REQUIREMENTS),
    'onet/tasks.tsv': tsv(['task_id', 'code', 'task'], TASKS),
    'onet/occupations.tsv': tsv(['code', 'title', 'description'], OCCUPATIONS),
    'onet/software.tsv': tsv(['example', 'element_id', 'element', 'code'], SOFTWARE),
    'ai/ilo_wp140.tsv': tsv(['isco', 'title', 'mean', 'sd', 'gradient'], ILO),
    'ai/aei_tasks.tsv': tsv(['task_id', 'usage_pct', 'automation_pct', 'augmentation_pct'], AEI),
    'radar/occupation-bridge.json': JSON.stringify(BRIDGE, null, 2) + '\n',
    'sdg/targets.json': JSON.stringify(TARGETS, null, 2) + '\n',
    'sdg/links.json': JSON.stringify({ schemaVersion: 'sdg-links/v1', status: 'team draft', links: SDG_LINKS }, null, 2) + '\n',
  }
  const hashes = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha(v)]))
  if (edit) edit(files)
  const h = (name) => (keepManifest ? hashes[name] : sha(files[name]))
  files['onet/manifest.json'] = JSON.stringify({
    source: 'O*NET Database', version: '31.0', sourceUrl: 'https://www.onetcenter.org/dl_files/database/db_31_0_text.zip', licence: 'CC BY 4.0', downloadedAt: '2026-10-30',
    files: Object.fromEntries(['requirements.tsv', 'tasks.tsv', 'occupations.tsv', 'software.tsv'].map((n) => [n, h(`onet/${n}`)])),
  })
  files['ai/manifest.json'] = JSON.stringify({
    source: 'ILO Working Paper 140, Generative AI and Jobs: A 2025 update (Gmyrek et al.)', paperUrl: 'https://doi.org/10.54394/HETP0387',
    sourceUrl: 'https://example.org/ilo.xlsx', licence: 'CC BY 4.0', downloadedAt: '2026-10-30', files: { 'ilo_wp140.tsv': h('ai/ilo_wp140.tsv') },
    aei: {
      source: 'Anthropic Economic Index, Hugging Face dataset Anthropic/EconomicIndex', release: 'release_2026_06_26', dataPeriod: 'April-May 2026',
      sourceUrl: 'https://example.org/aei.csv', licence: 'CC BY (data)', downloadedAt: '2026-10-30', files: { 'aei_tasks.tsv': h('ai/aei_tasks.tsv') },
    },
  })
  files['emasco/manifest.json'] = JSON.stringify({ files: { 'role_details.json': h('emasco/role_details.json') }, copiedFrom: 'team eMASCO crawl', fetchedAt: '2026-10-23', builtAt: '2026-10-30' })
  for (const [name, text] of Object.entries(files)) {
    if (text === null) continue
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
    await writeFile(path.join(dir, name), text)
  }
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

// References as the Radar gives them (only what matching reads): field of study -> O*NET jobs, O*NET titles.
export const fixtureReferences = {
  fieldJobs: (code) => (code === '0613' ? [{ code: '15-1243.00', title: 'Database Architects' }] : []),
  onetTitle: (code) => OCCUPATIONS.find((o) => o[0] === code)?.[1] ?? null,
}
