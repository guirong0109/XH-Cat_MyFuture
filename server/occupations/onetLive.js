// Step 1 of the occupation lookup: O*NET Web Services (API v2), live.
// Docs (checked 29 Oct 2026): GET only; key in the X-API-Key header; on HTTP 429 wait at least 200 ms before retrying.
const BASE_URL = 'https://api-v2.onetcenter.org'
const KEY_HEADER = 'X-API-Key'
const MIN_RETRY_DELAY_MS = 200

export class OnetLiveError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // rate_limited | timeout | http | network | bad_reply
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// null when no key is configured: the lookup then starts at the cached step.
export function createOnetLiveFromEnv(env = process.env, fetchImpl = fetch) {
  return env.ONET_API_KEY ? createOnetLive({ apiKey: env.ONET_API_KEY, fetchImpl }) : null
}

export function createOnetLive({ apiKey, fetchImpl = fetch, timeoutMs = 8000, retries = 2, perSecond = 5, sleep = defaultSleep }) {
  let nextSlot = 0
  // At most `perSecond` requests per second from this server.
  async function waitTurn() {
    const now = Date.now()
    const wait = Math.max(0, nextSlot - now)
    nextSlot = Math.max(now, nextSlot) + 1000 / perSecond
    if (wait) await sleep(wait)
  }

  async function once(url) {
    await waitTurn()
    let response
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { [KEY_HEADER]: apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      throw new OnetLiveError(error?.name === 'TimeoutError' ? 'timeout' : 'network', 'O*NET Web Services could not be reached')
    }
    if (response.status === 429) throw new OnetLiveError('rate_limited', 'O*NET Web Services asked us to slow down')
    if (!response.ok) throw new OnetLiveError('http', `O*NET Web Services returned HTTP ${response.status}`)
    const body = await response.json().catch(() => null)
    if (!body || (body.occupation !== undefined && !Array.isArray(body.occupation))) throw new OnetLiveError('bad_reply', 'Unexpected O*NET reply')
    return (body.occupation ?? []).filter((o) => o?.code && o?.title).map((o) => ({ code: o.code, title: o.title, via: 'live' }))
  }

  async function search(query) {
    const url = `${BASE_URL}/online/search?keyword=${encodeURIComponent(query)}`
    let lastError
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await sleep(MIN_RETRY_DELAY_MS * 2 ** (attempt - 1))
      try {
        return await once(url)
      } catch (error) {
        lastError = error
        if (error.kind === 'bad_reply' || (error.kind === 'http' && !/HTTP 5/.test(error.message))) break
      }
    }
    throw lastError
  }

  return { search }
}
