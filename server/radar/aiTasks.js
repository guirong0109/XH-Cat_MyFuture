// AI task data for the Radar profile charts: Anthropic Economic Index task shares (data/ai/aei_tasks.tsv) joined to the
// O*NET task statements, and the ILO WP140 occupation scores (data/ai/ilo_wp140.tsv). Both files are checked against
// data/ai/manifest.json. Static reference data: the caller memoises the result.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const HUGGING_FACE_DATASET = 'https://huggingface.co/datasets/Anthropic/EconomicIndex'

// Rows by header name, not by position.
function rowsOf(text) {
  const [head, ...lines] = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean)
  const names = head.split('\t')
  return lines.map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(names.map((name, i) => [name, cells[i] ?? '']))
  })
}

async function checkedText(file, expected) {
  const text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n')
  if (createHash('sha256').update(text).digest('hex') !== expected) throw new Error(`${path.basename(file)} does not match the manifest`)
  return text
}

export async function loadAiTasks(dataDir) {
  try {
    const aiDir = path.join(dataDir, 'ai')
    const manifest = JSON.parse(await readFile(path.join(aiDir, 'manifest.json'), 'utf8'))
    const aei = manifest.aei ?? {}
    const copied = JSON.parse(await readFile(path.join(dataDir, 'radar', 'copied-from-main.json'), 'utf8'))
    const [aeiText, iloText, taskText] = await Promise.all([
      checkedText(path.join(aiDir, 'aei_tasks.tsv'), aei.files?.['aei_tasks.tsv']),
      checkedText(path.join(aiDir, 'ilo_wp140.tsv'), manifest.files?.['ilo_wp140.tsv']),
      checkedText(path.join(dataDir, 'onet', 'tasks.tsv'), copied.files?.['data/onet/tasks.tsv']),
    ])
    const usage = new Map(rowsOf(aeiText).map((r) => [r.task_id, r]))
    const taskCounts = {}
    const tasks = []
    for (const r of rowsOf(taskText)) {
      taskCounts[r.code] = (taskCounts[r.code] ?? 0) + 1
      const u = usage.get(r.task_id)
      if (u) tasks.push({ taskId: r.task_id, code: r.code, text: r.task, usage: Number(u.usage_pct), automation: Number(u.automation_pct), augmentation: Number(u.augmentation_pct) })
    }
    const ilo = rowsOf(iloText).map((r) => ({ isco: r.isco, title: r.title, mean: Number(r.mean), gradient: r.gradient }))
    const sourceLinks = [
      { label: 'Anthropic Economic Index (Hugging Face dataset)', url: HUGGING_FACE_DATASET },
      ...(aei.sourceUrl ? [{ label: `Anthropic Economic Index ${aei.release ?? ''} data file`.replace(/\s+/g, ' '), url: aei.sourceUrl }] : []),
      { label: 'ILO Working Paper 140 (Gmyrek et al., 2025)', url: manifest.paperUrl },
    ]
    return { state: 'data', release: aei.release ?? null, dataPeriod: aei.dataPeriod ?? null, tasks, taskCounts, ilo, sourceLinks, fetchedAt: aei.downloadedAt ?? null }
  } catch (error) {
    // A fixed plain reason only: file names, paths and stack text never reach the browser.
    return { state: 'unavailable', reason: error?.code === 'ENOENT' ? 'AI task data files are missing' : 'AI task data failed its check' }
  }
}
