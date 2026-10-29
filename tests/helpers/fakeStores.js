// Stand-ins for D1 and R2: node:sqlite with the real migrations.sql, and an in-memory file store.
// Same interfaces as server/store/d1.js and r2.js. Used by tests and scripts/serve-local-accounts.mjs, never for real users.
import { DatabaseSync } from 'node:sqlite'
import { StoreError, migrationStatements } from '../../server/store/d1.js'

export function createFakeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  async function query(sql, params = []) {
    if (sql.includes('${')) throw new StoreError('store_error')
    try {
      const statement = db.prepare(sql)
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { rows: statement.all(...params).map((row) => ({ ...row })), changes: 0 }
      const { changes } = statement.run(...params)
      return { rows: [], changes: Number(changes) }
    } catch {
      throw new StoreError('store_error')
    }
  }
  return {
    query,
    async migrate() {
      for (const statement of await migrationStatements()) await query(statement)
    },
  }
}

export function createFakeTempStore() {
  const files = new Map()
  return {
    files,
    async put(key, buffer, contentType) {
      files.set(key, { buffer: Buffer.from(buffer), contentType })
    },
    async get(key) {
      return files.get(key) ?? null
    },
    async delete(key) {
      files.delete(key)
      return true
    },
  }
}
