import { describe, expect, it } from 'vitest'
import { readText } from '../server/cv/readText.js'
import { detectLanguage } from '../server/cv/detectLanguage.js'
import { SAMPLE_LINES, makeDocx, makePdf } from './helpers/cvFixtures.js'

describe('readText', () => {
  it('pdf lines in reading order', async () => {
    const out = await readText(makePdf(SAMPLE_LINES), 'pdf')
    expect(out.ok).toBe(true)
    expect(out.lines).toEqual(SAMPLE_LINES)
  })

  it('docx paragraphs with heading indexes', async () => {
    const out = await readText(makeDocx([{ text: 'Education', heading: true }, '• Diploma in IT & Business', '', 'Skills: SQL']), 'docx')
    expect(out).toEqual({ ok: true, lines: ['Education', 'Diploma in IT & Business', 'Skills: SQL'], headings: [0] })
  })

  it('keeps two-character Chinese headings such as 技能 and 证书', async () => {
    const out = await readText(makeDocx(['陈美玲（虚构）', '技能', 'Python, Microsoft Excel, 沟通', '证书', 'Microsoft Office Specialist, 2021', 'ab']), 'docx')
    expect(out.lines).toEqual(['陈美玲（虚构）', '技能', 'Python, Microsoft Excel, 沟通', '证书', 'Microsoft Office Specialist, 2021'])
  })

  it('image-only pdf is scanned_no_ocr', async () => {
    expect(await readText(makePdf([]), 'pdf')).toEqual({ ok: false, code: 'scanned_no_ocr' })
  })

  it('empty docx is no_text', async () => {
    expect(await readText(makeDocx([]), 'docx')).toEqual({ ok: false, code: 'no_text' })
  })

  it('keeps at most 300 lines', async () => {
    const out = await readText(makeDocx(Array.from({ length: 400 }, (_, i) => `Line number ${i}`)), 'docx')
    expect(out.lines).toHaveLength(300)
  })
})

const EN = ['Experience', 'IT Support Executive at Acme Sdn Bhd from 2022 to present', 'Responsible for the help desk and for training new staff in the team',
  'Managed user accounts and developed reports using SQL and Excel', 'Education', 'Diploma in Information Technology with a focus on networks and the web']
const MS = ['Pengalaman Kerja', 'Eksekutif Sokongan IT di Acme Sdn Bhd dari 2022 sehingga kini', 'Bertanggungjawab untuk meja bantuan dan melatih kakitangan baharu dalam pasukan',
  'Menguruskan akaun pengguna dan menyediakan laporan dengan SQL dan Excel', 'Pendidikan', 'Diploma Teknologi Maklumat dengan tumpuan pada rangkaian dan laman web']
const ZH = ['工作经验', '2022年至今在Acme公司担任IT支持主管', '负责帮助台和培训新员工', '教育背景', '信息技术文凭，主修网络与网站开发']

describe('detectLanguage', () => {
  it('english cv', () => expect(detectLanguage(EN).language).toBe('en'))
  it('malay cv', () => expect(detectLanguage(MS).language).toBe('ms'))
  it('chinese cv', () => expect(detectLanguage(ZH).language).toBe('zh'))
  it('mixed english and chinese cv', () => expect(detectLanguage([...EN, ...ZH, ...ZH]).language).toBe('mixed'))
  it('three words is uncertain', () => expect(detectLanguage(['Aina Binti Ahmad']).language).toBe('uncertain'))
})
