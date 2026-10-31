// Accounts on the owner's computer (owner, 1 Nov 2026: host on this computer, no Cloudflare R2 / D1): a SQLite file
// through Node's built-in node:sqlite, with the same query / migrate interface as the Cloudflare D1 client
// (server/store/d1.js), so the rest of the app does not change. Only parameterised SQL, as for D1.
// The tables of migrations.sql are created on first use; "IF NOT EXISTS" leaves existing data alone.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { StoreError, createD1FromEnv, migrationStatements } from './d1.js'

export function createLocalD1(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')

  function run(sql, params) {
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

  async function migrate() {
    for (const statement of await migrationStatements()) run(statement, [])
  }
  let ready = null
  const once = () => (ready ??= migrate().catch((error) => {
    ready = null
    throw error
  }))

  return {
    // → { rows, changes }, like D1
    async query(sql, params = []) {
      await once()
      return run(sql, params)
    },
    migrate: once,
    close: () => db.close(),
  }
}

// D1 settings win (Cloudflare); else ACCOUNTS_DB=local gives the local file (ACCOUNTS_DB_FILE, default
// <dataDir>/cache/accounts/accounts.db, which git ignores); else null (accounts say "not available on this server").
export function accountsDbFromEnv(env = process.env, { dataDir }) {
  const d1 = createD1FromEnv(env)
  if (d1) return d1
  if (String(env.ACCOUNTS_DB ?? '').trim().toLowerCase() !== 'local') return null
  return createLocalD1(env.ACCOUNTS_DB_FILE || path.join(dataDir, 'cache', 'accounts', 'accounts.db'))
}
