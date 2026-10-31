import { DATA_DIR, createApp } from './app.js'
import { checkPathwayData } from './pathway/data.js'

const port = process.env.PORT || 3200
// A bad pathway data file (e.g. a pick for an unknown item) stops the server here, before it listens (spec §7, §9).
const pathway = await checkPathwayData(DATA_DIR)
if (pathway.error) {
  console.error(pathway.error)
  process.exit(1)
}
createApp({ pathwayData: pathway.data }).listen(port, () => console.log(`FutureReady MY (CV/profile module) on http://localhost:${port}`))
