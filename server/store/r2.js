// Cloudflare R2 through its S3-compatible API, signed with AWS Signature V4 (region 'auto', service 's3').
// Used only for the temporary CV file (cv-temp/<extractionId>), deleted after use.
import { createHash, createHmac } from 'node:crypto'
import { StoreError } from './d1.js'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const encodePath = (path) => path.split('/').map((part) => encodeURIComponent(part)).join('/')

// headers: every header to sign (lower-case names), including host and x-amz-date.
export function signV4({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region, service, amzDate }) {
  const { pathname, searchParams } = new URL(url)
  const names = Object.keys(headers).map((name) => name.toLowerCase()).sort()
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]))
  const signedHeaders = names.join(';')
  const query = [...searchParams].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&')
  const canonical = [method, pathname || '/', query, names.map((n) => `${n}:${lower[n]}\n`).join(''), signedHeaders, payloadHash].join('\n')
  const day = amzDate.slice(0, 8)
  const scope = `${day}/${region}/${service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return { signature, signedHeaders, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` }
}

export function createR2({ accountId, bucket, accessKeyId, secretAccessKey, fetchImpl = fetch, now = () => new Date(), timeoutMs = 15000 }) {
  const host = `${accountId}.r2.cloudflarestorage.com`

  // extra: more headers to sign and send (conditional writes). query: a ready-made canonical query string.
  // bucketLevel: address the bucket itself (ListObjectsV2) instead of an object.
  async function send(method, key, body = null, contentType = null, { extra = {}, query = '', bucketLevel = false } = {}) {
    const url = `https://${host}/${bucket}${bucketLevel ? '' : '/' + encodePath(key)}${query ? '?' + query : ''}`
    const amzDate = now().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const payloadHash = sha256(body ?? '')
    const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...(contentType ? { 'content-type': contentType } : {}), ...extra }
    const { authorization } = signV4({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region: 'auto', service: 's3', amzDate })
    const { host: _host, ...sent } = headers
    try {
      return await fetchImpl(url, { method, headers: { ...sent, authorization }, body, signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      throw new StoreError('store_unavailable')
    }
  }
  const check = (response) => {
    if (!response.ok) throw new StoreError(response.status >= 500 ? 'store_unavailable' : 'store_error')
  }

  return {
    // Optional conditional write: ifMatch -> If-Match, ifNoneMatch -> If-None-Match; 412 -> precondition_failed.
    async put(key, buffer, contentType, { ifMatch, ifNoneMatch } = {}) {
      const extra = {}
      if (ifMatch) extra['if-match'] = ifMatch
      if (ifNoneMatch) extra['if-none-match'] = ifNoneMatch
      const response = await send('PUT', key, buffer, contentType, { extra })
      if (response.status === 412) throw new StoreError('precondition_failed')
      check(response)
      return { etag: response.headers.get('etag') ?? undefined }
    },
    // ListObjectsV2 for a prefix, following continuation tokens. Returns the keys.
    async list(prefix) {
      const keys = []
      let token = null
      do {
        const params = [['list-type', '2'], ['prefix', prefix]]
        if (token) params.push(['continuation-token', token])
        const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&')
        const response = await send('GET', '', null, null, { query, bucketLevel: true })
        check(response)
        const xml = await response.text()
        for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(decodeXml(m[1]))
        const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)
        token = next ? decodeXml(next[1]) : null
      } while (token)
      return keys
    },
    async get(key) {
      const response = await send('GET', key)
      if (response.status === 404) return null
      check(response)
      return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type'), etag: response.headers.get('etag') ?? undefined }
    },
    async delete(key) {
      const response = await send('DELETE', key)
      if (response.status !== 404) check(response)
      return true
    },
  }
}

// R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. Not set → null (no temporary CV copy).
export function createR2FromEnv(env = process.env) {
  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null
  return createR2({ accountId: env.R2_ACCOUNT_ID, bucket: env.R2_BUCKET, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY })
}
