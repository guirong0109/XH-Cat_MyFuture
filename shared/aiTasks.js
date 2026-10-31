// "Which of these do you use AI for?" (spec 2026-10-31-radar-ai-usage-questions, D34-D39). Pure: no I/O.
// The ten categories are the owner's own list (D34); their names and examples are screen text in t().
// Stored in the profile as aiTasks: { status: 'skipped', date } or { status: 'answered', picked: [ids], date }.

export const AI_TASK_IDS = Object.freeze(['writing', 'learning', 'programming', 'data', 'creative', 'communication', 'planning', 'admin', 'customer', 'automation'])

const DATE = /^\d{4}-\d{2}-\d{2}$/
const inOrder = (ids) => AI_TASK_IDS.filter((id) => ids.includes(id))

// Adds or removes one category; the result is in list order. An unknown id changes nothing.
export function togglePick(picked, id) {
  if (!AI_TASK_IDS.includes(id)) return [...picked]
  return picked.includes(id) ? picked.filter((x) => x !== id) : inOrder([...picked, id])
}

// Continue needs at least one tick or "none of these" (D35, D36).
export const canContinue = (ask) => Boolean(ask && (ask.none === true || ask.picked?.length > 0))

export const answered = (picked, date) => ({ status: 'answered', picked: inOrder(picked), date })
export const skipped = (date) => ({ status: 'skipped', date })

// Skip on a reopened card keeps an earlier answer; it never overwrites one with "skipped" (spec §5).
export const afterSkip = (current, date) => (current?.status === 'answered' ? current : skipped(date))

// The card shows by itself only while a profile has no answer yet (D36). No profile: nothing to keep it in.
export const needsAsking = (profile) => Boolean(profile && typeof profile === 'object' && profile.aiTasks == null)

// The profile check for aiTasks (spec §4); called only when aiTasks is neither undefined nor null.
export function aiTasksErrors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ path: 'aiTasks', code: 'bad_type' }]
  const errors = []
  if (value.status !== 'skipped' && value.status !== 'answered') errors.push({ path: 'aiTasks.status', code: 'bad_enum' })
  if (value.status === 'answered') {
    if (!Array.isArray(value.picked)) errors.push({ path: 'aiTasks.picked', code: 'bad_type' })
    // Known ids, each once, in list order: only then is the list the same as its ordered copy.
    else if (value.picked.join() !== inOrder(value.picked).join()) errors.push({ path: 'aiTasks.picked', code: 'bad_enum' })
  } else if (value.picked !== undefined) errors.push({ path: 'aiTasks.picked', code: 'bad_type' })
  if (typeof value.date !== 'string' || !DATE.test(value.date)) errors.push({ path: 'aiTasks.date', code: 'bad_type' })
  return errors
}
