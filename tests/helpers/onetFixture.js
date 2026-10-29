// A small O*NET-shaped snapshot for tests: the same four files and columns as data/onet, with a real manifest.
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const FILES = {
  'skills.tsv': 'element_id\telement\tcode\timportance\n2.A.1.a\tReading Comprehension\t15-2051.00\t4.00\n2.A.1.a\tReading Comprehension\t43-9021.00\t3.00\n',
  'software.tsv': [
    'example\telement_id\telement\tcode',
    'Python\t2.E.5.c\tDevelopment environment software\t15-2051.00',
    'Microsoft Excel\t2.E.1.b\tSpreadsheet software\t43-9021.00',
    'Structured query language SQL\t2.E.5.a\tDatabase software\t15-2051.00',
    'Microsoft SQL Server\t2.E.5.a\tDatabase software\t15-1243.00',
    'Microsoft SQL Server\t2.E.5.a\tDatabase software\t15-2051.00',
    'Oracle Java\t2.E.5.c\tDevelopment environment software\t15-1252.00',
    'Python\t2.E.5.c\tDevelopment environment software\t15-1252.00',
  ].join('\n') + '\n',
  'occupations.tsv': 'code\ttitle\tdescription\n15-2051.00\tData Scientists\tDevelop methods.\n15-2051.01\tBusiness Intelligence Analysts\tProduce reports.\n43-9021.00\tData Entry Keyers\tEnter data.\n',
  'job_titles.tsv': 'code\ttitle\n15-2051.00\tData Analyst\n43-9021.00\tData Analyst\n43-9021.00\tData Entry Clerk\n',
}

export async function writeCatalogue(directory, { damage = null } = {}) {
  const files = {}
  for (const [name, text] of Object.entries(FILES)) {
    await writeFile(path.join(directory, name), damage === name ? text + 'x\tchanged\n' : text)
    files[name] = createHash('sha256').update(text).digest('hex')
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: '31.0', downloadedAt: '2026-10-29', sourceUrl: 'https://www.onetcenter.org/', files }))
}

export const EMASCO = {
  source: 'eMASCO (MASCO 2020), English pages',
  fetchedAt: '2026-10-23',
  roles: [
    { code: '2524-02', title: 'Data Analyst', url: 'https://emasco.mohr.gov.my/masco/2524-02' },
    { code: '4132-01', title: 'Data Entry Clerk', url: 'https://emasco.mohr.gov.my/masco/4132-01' },
  ],
}
