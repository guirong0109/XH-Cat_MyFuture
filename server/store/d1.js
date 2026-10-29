// Cloudflare D1 through its REST query API. Only parameterised SQL: values always go in params, never in the text.
import { readFile } from 'node:fs/promises'

export class StoreError extends Error {
  constructor(code) {
    super(code)
    this.name = 'StoreError'
    this.code = code
  }
}

const MIGRATIONS = new URL('./migrations.sql', import.meta.url)

// The statements of migrations.sql, without comments.
export async function migrationStatements() {
  const text = (await readFile(MIGRATIONS, 'utf8')).replace(/--.*$/gm, '')
  return text.split(';').map((s) => s.trim()).filter(Boolean)
}

export function createD1({ accountId, databaseId, token, fetchImpl = fetch, timeoutMs = 8000 }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`

  // → { rows, changes }
  async function query(sql, params = []) {
    if (sql.includes('${')) throw new StoreError('store_error')
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new StoreError('store_unavailable')
    }
    if (response.status >= 500 || response.status === 429) throw new StoreError('store_unavailable')
    const body = await response.json().catch(() => null)
    const result = body?.result?.[0]
    if (!response.ok || !body?.success || !result?.success) throw new StoreError('store_error')
    return { rows: result.results ?? [], changes: result.meta?.changes ?? 0 }
  }

  async function migrate() {
    for (const statement of await migrationStatements()) await query(statement)
  }

  return { query, migrate }
}

// D1_ACCOUNT_ID, D1_DATABASE_ID, D1_TOKEN. Not set → null (accounts say "not available on this server").
export function createD1FromEnv(env = process.env) {
  if (!env.D1_ACCOUNT_ID || !env.D1_DATABASE_ID || !env.D1_TOKEN) return null
  return createD1({ accountId: env.D1_ACCOUNT_ID, databaseId: env.D1_DATABASE_ID, token: env.D1_TOKEN })
}
