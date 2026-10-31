// Words and patterns the CV rules (L1, L2) look for, in English, Bahasa Melayu and Chinese.

export const SECTION_WORDS = {
  education: ['education', 'academic background', 'qualifications', 'pendidikan', 'kelayakan akademik', '教育', '教育背景', '学历'],
  experience: ['experience', 'work experience', 'employment', 'employment history', 'work history', 'pengalaman', 'pengalaman kerja', '工作经验', '工作经历'],
  skills: ['skills', 'technical skills', 'key skills', 'professional skills', 'kemahiran', '技能', '专业技能'],
  certifications: ['certifications', 'certificates', 'licences', 'licenses', 'sijil', 'pensijilan', '证书'],
  projects: ['projects', 'projek', '项目', '项目经验'],
  training: ['training', 'courses', 'latihan', 'kursus', '培训'],
  objective: ['objective', 'career objective', 'summary', 'profile', 'objektif', 'ringkasan', '求职目标', '个人简介'],
}

// Most specific first. The label is what the profile shows. 'Certificate' only counts inside an Education section.
export const QUALIFICATIONS = [
  [/ijazah sarjana muda/i, 'Bachelor degree'],
  [/ijazah sarjana(?! muda)/i, 'Master degree'],
  [/\bsarjana muda\b/i, 'Bachelor degree'],
  [/\b(?:ph\.?\s?d|doctor of philosophy|doktor falsafah)\b|博士/i, 'PhD'],
  [/\bmaster'?s?\b(?:\s+(?:of|in)\b(?:\s+(?:science|arts|business administration)\b)?)?|\bm\.?sc\b|\bmba\b|硕士/i, 'Master degree'],
  [/\bbachelor'?s?\b(?:\s+(?:degree\s+)?(?:of|in)\b(?:\s+(?:science|arts|engineering)\b(?:\s+in\b)?)?)?|\bdegree\b|\bijazah\b|\bb\.?sc\b|学士/i, 'Bachelor degree'],
  [/\bdiploma\b|文凭|大专/i, 'Diploma'],
  [/\bstpm\b/i, 'STPM'],
  [/\bspm\b|sijil pelajaran malaysia/i, 'SPM'],
  [/\bcertificate\b|\bsijil\b|证书/i, 'Certificate'],
]
// The profile's qualification level (the form's dropdown) for each label above.
const LEVELS = { SPM: 'spm', STPM: 'stpm', Certificate: 'certificate', Diploma: 'diploma', 'Bachelor degree': 'bachelor', 'Master degree': 'master', PhD: 'phd' }
export const levelOfLabel = (label) => LEVELS[label] ?? ''
// The level of a qualification written in words (e.g. by the AI re-read), or '' when none of the patterns fits.
export const levelOf = (text) => levelOfLabel(QUALIFICATIONS.find(([re]) => re.test(String(text ?? '')))?.[1])

const MONTHS = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, mac: 3, apr: 4, april: 4,
  may: 5, mei: 5, jun: 6, june: 6, jul: 7, july: 7, julai: 7, aug: 8, august: 8, ogos: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, disember: 12,
}
const MONTH = `(?:${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')})`
const DATE = `(?:(${MONTH})\\.?\\s+)?((?:19|20)\\d{2})`
const NOW = '(present|current|now|kini|sekarang|至今|现在)'
export const DATE_RANGE = new RegExp(`${DATE}\\s*(?:-|–|—|to|hingga|sehingga|至)\\s*(?:${DATE}|${NOW})`, 'i')

// Months covered by a date range, both end months counted. A year without a month: January to December.
export function rangeMonths(match, now) {
  const [, startMonth, startYear, endMonth, endYear, present] = match
  const start = Number(startYear) * 12 + (startMonth ? MONTHS[startMonth.toLowerCase()] : 1)
  const end = present ? now.getUTCFullYear() * 12 + now.getUTCMonth() + 1 : Number(endYear) * 12 + (endMonth ? MONTHS[endMonth.toLowerCase()] : 12)
  return Math.max(0, end - start + 1)
}

// Lines about protected or identity details are skipped completely: they never reach the profile.
export const PERSONAL_LINE = /\b(?:age|umur|gender|jantina|sex|religion|agama|race|bangsa|marital|perkahwinan|nric|mykad|ic\s*no|no\.?\s*k\/p|date of birth|tarikh lahir)\b|\d{6}-\d{2}-\d{4}|性别|年龄|宗教|身份证/i
