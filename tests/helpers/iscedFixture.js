// A small ISCED-F snapshot for tests: the same three files and columns as data/isced, with a real manifest.
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const FILES = {
  'fields.tsv': [
    'code\ttitle\tbroad_code\tbroad_title',
    '0588\tInter-disciplinary programmes and qualifications involving natural sciences, mathematics and statistics\t05\tNatural sciences, mathematics and statistics',
    '0613\tSoftware and applications development and analysis\t06\tInformation and Communication Technologies (ICTs)',
    '0912\tMedicine\t09\tHealth and welfare',
    '0913\tNursing and midwifery\t09\tHealth and welfare',
    '1013\tHotel, restaurants and catering\t10\tServices',
  ].join('\n') + '\n',
  'isced_cip.tsv': [
    'isced_code\tisced_title\tcip_code\tcip_title\tpartial\tnote',
    '0588\tInter-disciplinary programmes and qualifications involving natural sciences, mathematics and statistics\t30.0801\tMathematics and computer science\tN\t',
    '0613\tSoftware and applications development and analysis\t11.0701\tComputer science\tN\t',
    '0913\tNursing and midwifery\t51.3801\tRegistered nursing/registered nurse\tN\t',
    '0912\tMedicine\t51.3801\tRegistered nursing/registered nurse\tY\tOnly the clinical part',
    '1013\tHotel, restaurants and catering\t12.0504\tRestaurant, culinary and catering management/manager\tN\t',
  ].join('\n') + '\n',
  'cip_onet.tsv': [
    'cip_code\tcip_title\tcode\ttitle',
    '11.0701\tComputer Science\t15-1252.00\tSoftware Developers',
    '11.0701\tComputer Science\t15-2051.00\tData Scientists',
    '51.3801\tRegistered Nursing/Registered Nurse\t43-9021.00\tData Entry Keyers',
  ].join('\n') + '\n',
}

export async function writeIsced(directory, { damage = null } = {}) {
  const files = {}
  for (const [name, text] of Object.entries(FILES)) {
    await writeFile(path.join(directory, name), damage === name ? text + '9999\tchanged\t99\tx\n' : text)
    files[name] = createHash('sha256').update(text).digest('hex')
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 'ISCED-F 2013', downloadedAt: '2026-10-30', files }))
}
