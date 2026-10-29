import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createR2, createR2FromEnv, signV4 } from '../server/store/r2.js'
import { createFakeTempStore } from './helpers/fakeStores.js'

const EMPTY_HASH = createHash('sha256').update('').digest('hex')

describe('AWS Signature V4', () => {
  it('signV4 matches the AWS test-suite get-vanilla case', () => {
    const signed = signV4({
      method: 'GET', url: 'https://example.amazonaws.com/', headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: EMPTY_HASH, accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1', service: 'service', amzDate: '20150830T123600Z',
    })
    expect(signed.signature).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
    expect(signed.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
  })
})

describe('R2 client (S3-compatible)', () => {
  const r2 = (fetchImpl) => createR2({ accountId: 'acc', bucket: 'cvs', accessKeyId: 'AK', secretAccessKey: 'SK', fetchImpl, now: () => new Date('2026-10-29T10:00:00Z') })

  it('put signs content-type;host;x-amz-content-sha256;x-amz-date', async () => {
    const calls = []
    await r2(async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 200 }) }).put('cv-temp/x', Buffer.from('pdf'), 'application/pdf')
    expect(calls[0].url).toBe('https://acc.r2.cloudflarestorage.com/cvs/cv-temp/x')
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/20261029\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/)
    expect(calls[0].init.headers['x-amz-content-sha256']).toBe(createHash('sha256').update('pdf').digest('hex'))
  })

  it('get returns buffer and type; missing → null; delete sends DELETE', async () => {
    const client = r2(async (url, init) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.endsWith('/missing')) return new Response('NoSuchKey', { status: 404 })
      return new Response('pdf', { status: 200, headers: { 'content-type': 'application/pdf' } })
    })
    expect(await client.get('cv-temp/x')).toEqual({ buffer: Buffer.from('pdf'), contentType: 'application/pdf' })
    expect(await client.get('missing')).toBe(null)
    await expect(client.delete('cv-temp/x')).resolves.toBe(true)
  })

  it('a failing R2 → StoreError store_unavailable; no settings → no client', async () => {
    await expect(r2(async () => new Response('x', { status: 500 })).put('k', Buffer.from('a'), 'text/plain')).rejects.toMatchObject({ code: 'store_unavailable' })
    expect(createR2FromEnv({})).toBe(null)
  })

  it('fake temp store keeps, returns and deletes files in memory', async () => {
    const store = createFakeTempStore()
    await store.put('cv-temp/a', Buffer.from('x'), 'application/pdf')
    expect(await store.get('cv-temp/a')).toEqual({ buffer: Buffer.from('x'), contentType: 'application/pdf' })
    await store.delete('cv-temp/a')
    expect(await store.get('cv-temp/a')).toBe(null)
  })
})
