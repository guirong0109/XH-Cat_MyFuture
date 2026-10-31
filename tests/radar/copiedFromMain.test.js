import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const record = JSON.parse(readFileSync('data/radar/copied-from-main.json', 'utf8'))

describe('files copied unchanged from main (D32)', () => {
  it('records the source commit', () => {
    expect(record.fromBranch).toBe('main')
    expect(record.fromCommit).toBe('d4286d6')
  })

  it('every recorded file exists with its recorded SHA-256', () => {
    const entries = Object.entries(record.files)
    expect(entries.length).toBeGreaterThan(0)
    for (const [path, hash] of entries) {
      expect(existsSync(path), path).toBe(true)
      expect(sha(path), path).toBe(hash)
    }
  })

  it('pins the AI and task data to the values in main manifests', () => {
    expect(sha('data/onet/tasks.tsv')).toBe('5a8d44e15262c3bc8eb606b4b86a7af61eca4305955bb845cb677178aacdca4e')
    expect(sha('data/ai/ilo_wp140.tsv')).toBe('0f954dbbf77b4f93d0299b0785cd9841decef56c16a6e7afdb56c33c82d17422')
    const manifest = JSON.parse(readFileSync('data/ai/manifest.json', 'utf8'))
    expect(JSON.stringify(manifest)).toContain(sha('data/ai/aei_tasks.tsv'))
  })

  it('SOURCES.md names the copied data', () => {
    const text = readFileSync('data/SOURCES.md', 'utf8')
    for (const s of ['ai/aei_tasks.tsv', 'ai/ilo_wp140.tsv', 'onet/tasks.tsv', 'copied-from-main.json']) {
      expect(text).toContain(s)
    }
  })
})
