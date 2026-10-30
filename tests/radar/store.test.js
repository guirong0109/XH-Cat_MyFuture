import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '../../server/radar/store/memory.js'
import { createFileStore } from '../../server/radar/store/file.js'
import { createR2RadarStore } from '../../server/radar/store/r2.js'
import { scopedStore } from '../../server/radar/store/scoped.js'
import { createR2 } from '../../server/store/r2.js'

describe('memory store', () => {
  it('etags change on every put; get returns bytes and etag; missing is null', async () => {
    const s = createMemoryStore()
    expect(await s.get('a')).toBe(null)
    const first = await s.put('a', Buffer.from('1'))
    const second = await s.put('a', Buffer.from('2'))
    expect(first.etag).not.toBe(second.etag)
    expect(await s.get('a')).toEqual({ bytes: Buffer.from('2'), etag: second.etag })
  })

  it('ifNoneMatch * on an existing key fails; on a new key succeeds', async () => {
    const s = createMemoryStore()
    await s.put('a', Buffer.from('1'), { ifNoneMatch: '*' })
    await expect(s.put('a', Buffer.from('2'), { ifNoneMatch: '*' })).rejects.toMatchObject({ code: 'precondition_failed' })
  })

  it('ifMatch with an old etag fails; with the current etag succeeds', async () => {
    const s = createMemoryStore()
    const { etag: old } = await s.put('a', Buffer.from('1'))
    const { etag } = await s.put('a', Buffer.from('2'))
    await expect(s.put('a', Buffer.from('3'), { ifMatch: old })).rejects.toMatchObject({ code: 'precondition_failed' })
    await expect(s.put('a', Buffer.from('3'), { ifMatch: etag })).resolves.toHaveProperty('etag')
    await expect(s.put('missing', Buffer.from('3'), { ifMatch: etag })).rejects.toMatchObject({ code: 'precondition_failed' })
  })

  it('lists by prefix and deletes', async () => {
    const s = createMemoryStore()
    await s.put('demo/s1/a', Buffer.from('1'))
    await s.put('demo/s1/b', Buffer.from('1'))
    await s.put('prod/c', Buffer.from('1'))
    expect(await s.list('demo/s1/')).toEqual(['demo/s1/a', 'demo/s1/b'])
    await s.delete('demo/s1/a')
    expect(await s.list('demo/')).toEqual(['demo/s1/b'])
  })
})

describe('file store', () => {
  it('reads and lists a folder; refuses writes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'radar-file-'))
    await mkdir(path.join(dir, 'prod'), { recursive: true })
    await writeFile(path.join(dir, 'prod', 'active.json'), '{"a":1}')
    const s = createFileStore(dir)
    expect((await s.get('prod/active.json')).bytes.toString()).toBe('{"a":1}')
    expect(await s.get('prod/nope.json')).toBe(null)
    expect(await s.list('prod/')).toEqual(['prod/active.json'])
    await expect(s.put('prod/x', Buffer.from('x'))).rejects.toMatchObject({ code: 'read_only' })
    await expect(s.delete('prod/active.json')).rejects.toMatchObject({ code: 'read_only' })
    await expect(s.get('../outside')).rejects.toMatchObject({ code: 'not_allowed' })
  })
})

describe('scoped store (Test plan 23)', () => {
  it('allows keys under the prefix and refuses everything else', async () => {
    const inner = createMemoryStore()
    await inner.put('prod/active.json', Buffer.from('p'))
    const s = scopedStore(inner, 'demo/s1/')
    await s.put('demo/s1/x', Buffer.from('1'))
    expect((await s.get('demo/s1/x')).bytes.toString()).toBe('1')
    expect(await s.list('demo/s1/')).toEqual(['demo/s1/x'])
    for (const bad of ['prod/active.json', 'demo/other/x', 'demo/s1/../../prod/x', '/demo/s1/x', 'demo/s1/..\\x']) {
      await expect(s.get(bad)).rejects.toMatchObject({ code: 'not_allowed' })
      await expect(s.put(bad, Buffer.from('x'))).rejects.toMatchObject({ code: 'not_allowed' })
      await expect(s.delete(bad)).rejects.toMatchObject({ code: 'not_allowed' })
      await expect(s.list(bad)).rejects.toMatchObject({ code: 'not_allowed' })
    }
    expect((await inner.get('prod/active.json')).bytes.toString()).toBe('p')
  })
})

describe('R2 client additions', () => {
  const r2 = (fetchImpl) => createR2({ accountId: 'acc', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'SK', fetchImpl, now: () => new Date('2026-10-30T10:00:00Z') })

  it('conditional put signs if-match / if-none-match and returns the etag', async () => {
    const calls = []
    const client = r2(async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 200, headers: { etag: '"e1"' } }) })
    expect(await client.put('k', Buffer.from('x'), 'text/plain', { ifMatch: '"old"' })).toEqual({ etag: '"e1"' })
    expect(calls[0].init.headers['if-match']).toBe('"old"')
    expect(calls[0].init.headers.authorization).toContain('SignedHeaders=content-type;host;if-match;x-amz-content-sha256;x-amz-date')
    await client.put('k', Buffer.from('x'), 'text/plain', { ifNoneMatch: '*' })
    expect(calls[1].init.headers['if-none-match']).toBe('*')
    expect(calls[1].init.headers.authorization).toContain('if-none-match;x-amz-content-sha256')
  })

  it('412 maps to precondition_failed; 5xx to store_unavailable', async () => {
    await expect(r2(async () => new Response('', { status: 412 })).put('k', Buffer.from('x'), 'text/plain', { ifNoneMatch: '*' })).rejects.toMatchObject({ code: 'precondition_failed' })
    await expect(r2(async () => new Response('', { status: 503 })).put('k', Buffer.from('x'), 'text/plain', { ifMatch: '"a"' })).rejects.toMatchObject({ code: 'store_unavailable' })
    await expect(r2(async () => new Response('', { status: 500 })).list('p/')).rejects.toMatchObject({ code: 'store_unavailable' })
  })

  it('get includes the etag', async () => {
    const client = r2(async () => new Response('x', { status: 200, headers: { etag: '"e2"', 'content-type': 'text/plain' } }))
    expect(await client.get('k')).toEqual({ buffer: Buffer.from('x'), contentType: 'text/plain', etag: '"e2"' })
  })

  it('list signs list-type=2&prefix= on the bucket and follows continuation tokens', async () => {
    const calls = []
    const pages = [
      '<ListBucketResult><Key>p/a</Key><Key>p/b&amp;c</Key><IsTruncated>true</IsTruncated><NextContinuationToken>tok/1+=</NextContinuationToken></ListBucketResult>',
      '<ListBucketResult><Key>p/d</Key><IsTruncated>false</IsTruncated></ListBucketResult>',
    ]
    const client = r2(async (url, init) => { calls.push({ url, init }); return new Response(pages[calls.length - 1], { status: 200 }) })
    expect(await client.list('p/')).toEqual(['p/a', 'p/b&c', 'p/d'])
    expect(calls[0].url).toBe('https://acc.r2.cloudflarestorage.com/b?list-type=2&prefix=p%2F')
    expect(calls[1].url).toBe('https://acc.r2.cloudflarestorage.com/b?continuation-token=tok%2F1%2B%3D&list-type=2&prefix=p%2F')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/)
    expect(calls[0].init.headers.authorization).not.toBe(calls[1].init.headers.authorization)
  })

  it('R2 radar store maps get/put/list/delete onto the client', async () => {
    const seen = []
    const fake = {
      get: async (k) => (k === 'k' ? { buffer: Buffer.from('v'), contentType: 'x', etag: '"e"' } : null),
      put: async (...args) => { seen.push(args); return { etag: '"n"' } },
      list: async (p) => [`${p}a`],
      delete: async (k) => { seen.push(['del', k]); return true },
    }
    const s = createR2RadarStore(fake)
    expect(await s.get('k')).toEqual({ bytes: Buffer.from('v'), etag: '"e"' })
    expect(await s.get('z')).toBe(null)
    expect(await s.put('k', Buffer.from('b'), { contentType: 'application/json', ifMatch: '"e"' })).toEqual({ etag: '"n"' })
    expect(seen[0]).toEqual(['k', Buffer.from('b'), 'application/json', { ifMatch: '"e"', ifNoneMatch: undefined }])
    expect(await s.list('p/')).toEqual(['p/a'])
    await s.delete('k')
    expect(seen[1]).toEqual(['del', 'k'])
  })
})
