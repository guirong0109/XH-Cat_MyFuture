// AI news relevance check (spec Amendment 1, N9 and §5): DeepSeek's chat model deepseek-flash reads each field's new
// items (headline, site, snippet; never a link, never profile data) and answers in JSON which are news about AI in that
// field. Only ids it lists in "keep" are kept; everything else is dropped. It writes nothing shown on screen: its
// reasons are counted. Paid per token; the key is never put in an error, a log line or a reply.
import { NewsSearchError } from './deepseek.js'

export const CHECK_URL = 'https://api.deepseek.com/chat/completions'
export const CHECK_MODEL = 'deepseek-flash'
export const DROP_REASONS = ['paper', 'listing', 'homework', 'event', 'directory', 'shop', 'job', 'off_topic', 'other']

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Like the search, plus a blank or wrong answer (DeepSeek's JSON mode blanks output it cannot make valid).
const retryable = (code) => code === 'bad_reply' || code === 'network' || code === 'timeout' || code === 'http_408' || code === 'http_429' || /^http_5\d\d$/.test(code)

const SYSTEM = [
  'You sort search results for a careers website.',
  'Keep only news or feature articles about artificial intelligence in the given field of study.',
  'Drop research papers and preprint listings (paper, listing), homework or Q&A pages (homework), event and conference notices (event),',
  'book or journal directories (directory), shops and product pages (shop), job ads (job), anything not about AI in this field (off_topic),',
  'and anything else that is not a news or feature article (other).',
  'Answer in json only, in this form: {"keep":[0,3],"drop":[{"id":1,"reason":"paper"}]}',
  `where reason is one of: ${DROP_REASONS.join(', ')}. Use the item numbers given. When unsure, drop.`,
].join(' ')

// The fixed prompt: the field title, then the items numbered from 0 with headline, site and snippet.
export function checkMessages(fieldTitle, items) {
  const lines = items.map((item, i) => `${i}. ${item.title} | ${item.site} | ${item.snippet ?? ''}`)
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Field of study: ${fieldTitle}\nItems:\n${lines.join('\n')}` },
  ]
}

// The ids to keep (whole numbers naming a sent item, each once) and the count per reason of the dropped ones.
export function readAnswer(content, count) {
  let answer = null
  try {
    answer = typeof content === 'string' && content.trim() ? JSON.parse(content) : null
  } catch {
    answer = null
  }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !Array.isArray(answer.keep)) throw new NewsSearchError('bad_reply')
  const isId = (v) => Number.isInteger(v) && v >= 0 && v < count
  const keep = [...new Set(answer.keep.filter(isId))]
  const given = new Map()
  for (const d of Array.isArray(answer.drop) ? answer.drop : []) {
    if (isId(d?.id) && !given.has(d.id)) given.set(d.id, DROP_REASONS.includes(d.reason) ? d.reason : 'other')
  }
  const reasons = {}
  for (let id = 0; id < count; id++) {
    if (keep.includes(id)) continue
    const reason = given.get(id) ?? 'other'
    reasons[reason] = (reasons[reason] ?? 0) + 1
  }
  return { keep, reasons }
}

export function createRelevanceCheck({ apiKey, fetchImpl = fetch, timeoutMs = 30000, retryDelayMs = 30000, sleep = defaultSleep }) {
  async function once(fieldTitle, items) {
    let response
    try {
      response = await fetchImpl(CHECK_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: CHECK_MODEL, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, temperature: 0, max_tokens: 1000, messages: checkMessages(fieldTitle, items) }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new NewsSearchError(error?.name === 'TimeoutError' ? 'timeout' : 'network')
    }
    if (!response.ok) throw new NewsSearchError(`http_${response.status}`)
    const data = await response.json().catch(() => null)
    return readAnswer(data?.choices?.[0]?.message?.content, items.length)
  }

  return {
    // Which of the items to keep, and why the others were dropped; one retry as described above.
    async check(fieldTitle, items) {
      try {
        return await once(fieldTitle, items)
      } catch (error) {
        if (!retryable(error.code)) throw error
        await sleep(retryDelayMs)
        return once(fieldTitle, items)
      }
    },
  }
}
