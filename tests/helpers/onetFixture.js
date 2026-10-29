// A small O*NET-shaped catalogue for tests (same files and columns as data/onet).
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function writeCatalogue(directory) {
  await writeFile(path.join(directory, 'skills.tsv'), 'element_id\telement\tcode\timportance\n2.A.1.a\tReading Comprehension\t15-2051.00\t4.00\n2.A.1.a\tReading Comprehension\t43-9021.00\t3.00\n')
  await writeFile(path.join(directory, 'software.tsv'), [
    'example\telement_id\telement\tcode',
    'Python\t2.E.5.c\tDevelopment environment software\t15-2051.00',
    'Microsoft Excel\t2.E.1.b\tSpreadsheet software\t43-9021.00',
    'Structured query language SQL\t2.E.5.a\tDatabase software\t15-2051.00',
    'Microsoft SQL Server\t2.E.5.a\tDatabase software\t15-1243.00',
    'Microsoft SQL Server\t2.E.5.a\tDatabase software\t15-2051.00',
    'Oracle Java\t2.E.5.c\tDevelopment environment software\t15-1252.00',
    'Python\t2.E.5.c\tDevelopment environment software\t15-1252.00',
  ].join('\n') + '\n')
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: '31.0', downloadedAt: '2026-10-29', files: {} }))
}
