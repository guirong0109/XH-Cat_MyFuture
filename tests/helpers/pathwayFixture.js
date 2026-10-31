// A small data dir for the pathway API tests: the matching fixture (tests/helpers/matchingFixture.js) plus the files
// the pathway reads, with the same headers as data/ and manifests holding real SHA-256.
//
//   onet/education.tsv   job 15-1243.00: category 6 = 55%, category 7 = 45%
//   isced/*.tsv          CIP 11.0802 -> O*NET 15-1243.00 (and 15-1242.00, as in data/); ISCED-F 0613 (full link) and 0611 (partial link) -> 11.0802
//   pathway/sites.json   elatih + coursera (both searchable)
//   pathway/picks.json   one course for kn:2.C.3.a, one accredited programme and one professional pick for field 0613
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { makeMatchingFixture } from './matchingFixture.js'

const sha = (text) => createHash('sha256').update(text).digest('hex')
const tsv = (header, rows) => [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n') + '\n'

export const PATHWAY = {
  course: 'c-kn-2.C.3.a-elatih',
  accredited: 'p-0613-um',
  professional: 'p-0613-mbot',
  mqrUrl: 'https://www2.mqa.gov.my/mqr/english/ecarianakr.cfm',
}

export const SITES = {
  schemaVersion: 'pathway-sites/v1',
  sites: [
    {
      id: 'elatih', name: 'e-LATiH (HRD Corp)', group: 'malaysian', home: 'https://elatih.hrdcorp.gov.my/', terms: 'https://elatih.hrdcorp.gov.my/pages/terms-of-use',
      search: 'https://elatih.hrdcorp.gov.my/courses?course=<q>', searchCheckedAt: '2026-10-31', hosts: ['elatih.hrdcorp.gov.my'],
    },
    {
      id: 'coursera', name: 'Coursera', group: 'global', home: 'https://www.coursera.org/', terms: 'https://www.coursera.org/about/terms',
      search: 'https://www.coursera.org/search?query=<q>', searchCheckedAt: '2026-10-31', hosts: ['www.coursera.org'],
    },
  ],
}

export const PICKS = {
  schemaVersion: 'pathway-picks/v1',
  status: 'team draft',
  courses: [
    { id: PATHWAY.course, for: 'kn:2.C.3.a', site: 'elatih', name: 'Computer Fundamentals', link: 'https://elatih.hrdcorp.gov.my/courses-details/1234', checkedAt: '2026-10-31' },
  ],
  programmes: [
    {
      id: PATHWAY.accredited, field: '0613', kind: 'accredited', name: 'Bachelor of Computer Science (Software Engineering)', link: 'https://www.um.edu.my/programmes/bcs-se',
      checkedAt: '2026-10-31', institution: 'Universiti Malaya', mqrRef: 'MQA/FA1234',
    },
    { id: PATHWAY.professional, field: '0613', kind: 'professional', name: 'Professional Technologist (Ts.)', link: 'https://www.mbot.org.my/', checkedAt: '2026-10-31', body: 'MBOT' },
  ],
  searchWords: [],
}

const EDUCATION = [
  ['15-1243.00', '6', "Bachelor's Degree", '55.00', 'N'],
  ['15-1243.00', '7', 'Post-Baccalaureate Certificate', '45.00', 'N'],
]
const FIELDS = [
  ['0611', 'Computer use', '06', 'Information and Communication Technologies (ICTs)'],
  ['0613', 'Software and applications development and analysis', '06', 'Information and Communication Technologies (ICTs)'],
]
const ISCED_CIP = [
  ['0611', 'Computer use', '11.0802', 'Data modelling/warehousing and database administration', 'Y', 'Only the computer use part'],
  ['0613', 'Software and applications development and analysis', '11.0802', 'Data modelling/warehousing and database administration', 'N', ''],
]
const CIP_ONET = [
  ['11.0802', 'Data Modeling/Warehousing and Database Administration', '15-1242.00', 'Database Administrators'],
  ['11.0802', 'Data Modeling/Warehousing and Database Administration', '15-1243.00', 'Database Architects'],
]

// Writes the fixture dir; returns {dir, cleanup}. `picks` replaces the picks file content (the manifest follows it).
export async function makePathwayFixture({ picks = PICKS, sites = SITES } = {}) {
  const fixture = await makeMatchingFixture()
  const files = {
    'onet/education.tsv': tsv(['code', 'category', 'label', 'percent', 'suppress'], EDUCATION),
    'isced/fields.tsv': tsv(['code', 'title', 'broad_code', 'broad_title'], FIELDS),
    'isced/isced_cip.tsv': tsv(['isced_code', 'isced_title', 'cip_code', 'cip_title', 'partial', 'note'], ISCED_CIP),
    'isced/cip_onet.tsv': tsv(['cip_code', 'cip_title', 'code', 'title'], CIP_ONET),
    'pathway/sites.json': JSON.stringify(sites, null, 2) + '\n',
    'pathway/picks.json': JSON.stringify(picks, null, 2) + '\n',
  }
  const onetManifest = JSON.parse(await readFile(path.join(fixture.dir, 'onet', 'manifest.json'), 'utf8'))
  onetManifest.files['education.tsv'] = sha(files['onet/education.tsv'])
  files['onet/manifest.json'] = JSON.stringify(onetManifest)
  files['isced/manifest.json'] = JSON.stringify({
    source: 'ISCED-F 2013 fields of education and training, with a CIP bridge to O*NET',
    version: 'ISCED-F 2013',
    sources: [
      { what: 'ISCED-F 2013 to CIP Canada 2016 concordance', by: 'Statistics Canada', url: 'https://www.statcan.gc.ca/sites/default/files/documents/isced-f-2013-cip2016-eng.csv', licence: 'Statistics Canada Open Licence' },
      { what: '2020 CIP to O*NET-SOC 2019 crosswalk', by: 'O*NET Resource Center (USDOL/ETA)', url: 'https://www.onetcenter.org/crosswalks/cip/Education_CIP_to_ONET_SOC.xlsx', licence: 'CC BY 4.0' },
    ],
    downloadedAt: '2026-10-30',
    files: Object.fromEntries(['fields.tsv', 'isced_cip.tsv', 'cip_onet.tsv'].map((n) => [n, sha(files[`isced/${n}`])])),
  })
  files['pathway/manifest.json'] = JSON.stringify({
    files: { 'sites.json': sha(files['pathway/sites.json']), 'picks.json': sha(files['pathway/picks.json']) },
    builtAt: '2026-10-31',
  })
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(fixture.dir, name)), { recursive: true })
    await writeFile(path.join(fixture.dir, name), text)
  }
  return fixture
}
