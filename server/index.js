import { DATA_DIR, createApp } from './app.js'
import { checkPathwayData } from './pathway/data.js'
import { createNewsServiceFromEnv } from './news/service.js'
import { createR2FromEnv } from './store/r2.js'

const port = process.env.PORT || 3200
// A bad pathway data file (e.g. a pick for an unknown item) stops the server here, before it listens (spec §7, §9).
const pathway = await checkPathwayData(DATA_DIR)
if (pathway.error) {
  console.error(pathway.error)
  process.exit(1)
}
// AI news: the 3-hour DeepSeek refresh starts once the server listens (off without DEEPSEEK_API_KEY).
const news = createNewsServiceFromEnv({ dataDir: DATA_DIR, tempStore: createR2FromEnv() })
createApp({ pathwayData: pathway.data, news }).listen(port, () => {
  console.log(`FutureReady MY (CV/profile module) on http://localhost:${port}`)
  news.start().catch((error) => console.error('[news] start failed:', error?.code ?? error?.name ?? 'Error'))
})
