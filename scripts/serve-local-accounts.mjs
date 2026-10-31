// Development only: the app with the D1 and R2 stand-ins (in memory, lost on exit), so accounts and saved profiles
// can be tried without Cloudflare. Never for real users.  Run: node scripts/serve-local-accounts.mjs
import { createApp } from '../server/app.js'
import { createFakeD1 } from '../tests/helpers/fakeStores.js'

const d1 = createFakeD1()
await d1.migrate()
const port = Number(process.env.PORT) || 3100
createApp({ d1 }).listen(port, () => console.log(`[dev] local accounts server on http://localhost:${port} (in-memory stores)`))
