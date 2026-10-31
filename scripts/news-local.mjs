// Local browser check of Compare futures → AI news with a FAKE search and a FAKE relevance check (spec §11): no
// DeepSeek call, nothing paid, never deployed. Two runs: the first fills every field; in the second, field 09's search
// fails (http_503) and field 03's check fails (bad_reply), so both keep their last list with the "Couldn't refresh"
// note. Field 06 gets 30 results (one too old, one repeat) to show the rules; every field gets an "arXiv" listing and an
// "Assignment" page that the fake check drops, and a copy of story 1 ending in " | Copy Site" that the repeat rule drops.
//   PORT=3271 node scripts/news-local.mjs
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DATA_DIR, createApp } from '../server/app.js'
import { NewsSearchError } from '../server/news/deepseek.js'
import { loadNewsFields } from '../server/news/fields.js'
import { createNewsService } from '../server/news/service.js'
import { createFileNewsStore } from '../server/news/store.js'

const port = Number(process.env.PORT) || 3271
const fields = await loadNewsFields(DATA_DIR)
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
let run = 0

const search = {
  async search(query) {
    const field = fields.find((f) => query.includes(f.words))
    if (run === 2 && field.code === '09') throw new NewsSearchError('http_503')
    const count = field.code === '06' ? 30 : 3
    const results = Array.from({ length: count }, (_, i) => ({
      title: `Sample AI story ${i + 1} for ${field.title} (fake search, run ${run})`,
      url: `https://example.com/${field.code}/${run}/${i + 1}`,
      site_name: 'Example News (fake)',
      date: daysAgo((i % 28) + 0.1),
      snippet: 'Fake search result for the local check. No DeepSeek call was made.',
    }))
    results.push({ title: `Artificial Intelligence — arXiv listing (run ${run}, ${field.code})`, url: `https://example.com/arxiv/${field.code}/${run}`, site_name: 'arXiv (fake)', date: daysAgo(1), snippet: 'New submissions.' })
    results.push({ title: `Assignment: AI essay (run ${run}, ${field.code})`, url: `https://example.com/homework/${field.code}/${run}`, site_name: 'Homework (fake)', date: daysAgo(1), snippet: 'Answer the question.' })
    results.push({ ...results[0], title: `${results[0].title} | Copy Site`, url: `https://copy.example.com/${field.code}/${run}` })
    if (field.code === '06') {
      results.push({ title: 'Too old to keep', url: 'https://example.com/old', site_name: 'Old', date: daysAgo(40), snippet: '' })
      results.push({ ...results[0], url: `${results[0].url}?utm_source=x` })
    }
    return results
  },
}

// Drops headlines with "arXiv" (listing) or "Assignment" (homework); field 03 fails in run 2.
const relevance = {
  async check(title, items) {
    if (run === 2 && title === fields[2].title) throw new NewsSearchError('bad_reply')
    const reasonOf = (item) => (item.title.includes('arXiv') ? 'listing' : item.title.includes('Assignment') ? 'homework' : null)
    const keep = items.map((item, i) => (reasonOf(item) ? null : i)).filter((i) => i !== null)
    const reasons = {}
    for (const item of items) if (reasonOf(item)) reasons[reasonOf(item)] = (reasons[reasonOf(item)] ?? 0) + 1
    return { keep, reasons }
  },
}

const news = createNewsService({
  enabled: true,
  loadFields: async () => fields,
  store: createFileNewsStore(path.join(mkdtempSync(path.join(tmpdir(), 'news-local-')), 'latest.json')),
  search,
  relevance,
  log: (line) => console.log(line),
})
run = 1
await news.runNow()
run = 2
await news.runNow()
createApp({ news }).listen(port, () => console.log(`AI news local check (fake search and check) on http://futures.localhost:${port}/#futures`))
