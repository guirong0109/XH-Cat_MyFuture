// DeepSeek Search API client for the AI news (spec §1 N1, §5-§6). Paid per successful search; the key comes from the
// server's secret settings and is never put in an error, a log line or a reply. No DeepSeek chat model is used.
export const NEWS_SEARCH_URL = 'https://api.deepseek.com/v1/tools/search'

export class NewsSearchError extends Error {
  constructor(code) {
    super(code)
    this.name = 'NewsSearchError'
    this.code = code
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const retryable = (code) => code === 'network' || code === 'timeout' || code === 'http_408' || code === 'http_429' || /^http_5\d\d$/.test(code)

export function createDeepseekSearch({ apiKey, fetchImpl = fetch, timeoutMs = 20000, retryDelayMs = 30000, sleep = defaultSleep }) {
  async function once(query) {
    let response
    try {
      response = await fetchImpl(NEWS_SEARCH_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query, count: 50, need_content: false }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new NewsSearchError(error?.name === 'TimeoutError' ? 'timeout' : 'network')
    }
    if (!response.ok) throw new NewsSearchError(`http_${response.status}`)
    const data = await response.json().catch(() => null)
    if (!Array.isArray(data?.results)) throw new NewsSearchError('bad_reply')
    return data.results
  }

  return {
    // The results of one query; one retry after 30 s for a network error, a timeout, 408, 429 or 5xx.
    async search(query) {
      try {
        return await once(query)
      } catch (error) {
        if (!retryable(error.code)) throw error
        await sleep(retryDelayMs)
        return once(query)
      }
    },
  }
}
