// The CV's language: en, ms, zh, mixed or uncertain. Independent of the interface language, which it never changes;
// the screen only offers a switch. Chinese counts Han characters as words (about 1.5 characters per word); English
// and Malay are told apart by common words.
const EN_WORDS = new Set(`and the of to in for with on at a an as by from is was my i experience education skills
university degree bachelor responsible managed developed using years present project company team work worked
helped led built created support training staff new reports users customer`.split(/\s+/))
const MS_WORDS = new Set(`dan di yang untuk dengan dalam pada ke dari ini itu sebagai adalah saya kerja pengalaman
pendidikan kemahiran ijazah sarjana muda sijil universiti syarikat tahun bulan projek latihan pengurusan perniagaan
maklumat teknologi pembangunan menguruskan membantu menyediakan bertanggungjawab sehingga kini baharu pasukan
kakitangan melatih pengguna laporan akaun bantuan meja tumpuan rangkaian laman`.split(/\s+/))

const MIN_WORDS = 30
const WIN = 0.7
const PART = 0.2
const HAN_PER_WORD = 1.5

export function detectLanguage(lines) {
  const text = lines.join(' ')
  const hanWords = (text.match(/\p{Script=Han}/gu)?.length ?? 0) / HAN_PER_WORD
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  let en = 0
  let ms = 0
  for (const word of words) {
    if (EN_WORDS.has(word)) en++
    if (MS_WORDS.has(word)) ms++
  }
  const zh = hanWords + words.length ? hanWords / (hanWords + words.length) : 0
  const latin = 1 - zh
  const hits = en + ms
  const shares = { en: hits ? (latin * en) / hits : 0, ms: hits ? (latin * ms) / hits : 0, zh }
  if (!hanWords && words.length < MIN_WORDS) return { language: 'uncertain', shares }
  const winner = Object.entries(shares).find(([, share]) => share >= WIN)
  if (winner) return { language: winner[0], shares }
  if (Object.values(shares).filter((share) => share >= PART).length >= 2) return { language: 'mixed', shares }
  return { language: 'uncertain', shares }
}
