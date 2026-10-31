// Pure helpers for the profile form (Case B), the review (Case C), the CV draft (Case A) and the AI compare view.
// Nothing here changes its input.

const SCALARS = [
  'userCategory', 'education.highestQualification', 'education.educationStatus', 'employment.status',
  'employment.yearsOfExperience', 'preferences.careerGoal', 'preferences.preferredWorkLocation',
  'preferences.preferredLearningHoursPerWeek',
]
// Repeatable records and how one record is recognised in two versions of a profile.
const LIST_KEYS = {
  skills: (r) => String(r.canonicalId ?? r.name ?? '').toLowerCase(),
  'education.records': (r) => `${r.qualification ?? ''}|${r.fieldOfStudy ?? ''}`.toLowerCase(),
  'employment.records': (r) => `${r.jobTitle ?? ''}|${r.employer ?? ''}`.toLowerCase(),
  certifications: (r) => String(r.name ?? '').toLowerCase(),
  projects: (r) => String(r.title ?? '').toLowerCase(),
  training: (r) => String(r.name ?? '').toLowerCase(),
}
const OTHER_LISTS = ['employment.industries', 'preferences.careerInterests']
const EMPTY_STATE = { state: 'empty' }

const clone = (value) => (value === undefined ? undefined : structuredClone(value))
const get = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object)

function setPath(object, path, value) {
  const out = clone(object)
  const keys = path.split('.')
  let node = out
  for (const key of keys.slice(0, -1)) node = node[key]
  node[keys.at(-1)] = value
  return out
}

export const setField = (profile, path, state) => setPath(profile, path, state)
export const addRecord = (profile, listPath, record) => setPath(profile, listPath, [...(get(profile, listPath) ?? []), record])
export const removeRecord = (profile, listPath, index) => setPath(profile, listPath, (get(profile, listPath) ?? []).filter((_, i) => i !== index))
// "Mark for later review" on one record or skill, e.g. path 'certifications.0'.
export const markForReview = (profile, path, on) => setPath(profile, path, { ...get(profile, path), needsReview: on })

// The form shows "Prefer not to say" as every optional field's default: once a section is shown, what the user left
// unanswered is saved as declined. Empty then means the user never saw the field.
export function declineUnanswered(profile, paths) {
  let out = profile
  for (const path of paths) if ((get(out, path)?.state ?? 'empty') === 'empty') out = setPath(out, path, { state: 'declined' })
  return out
}

// Only answers count: defaults ("prefer not to say" left as it was) do not make a profile the user's work.
export function isUntouched(profile) {
  if (SCALARS.some((path) => get(profile, path)?.state === 'value')) return false
  // An AI question answered yes or no is the user's work too (M17).
  if (Object.values(profile?.aiUse ?? {}).some((v) => v === 'yes' || v === 'no')) return false
  return [...Object.keys(LIST_KEYS), ...OTHER_LISTS].every((path) => (get(profile, path) ?? []).length === 0)
}

export function confirmProfile(profile) {
  let out = clone(profile)
  for (const listPath of Object.keys(LIST_KEYS)) {
    out = setPath(out, listPath, (get(out, listPath) ?? []).map((record) => ({ ...record, userConfirmed: true })))
  }
  out.profileStatus = 'confirmed'
  out.dataProvenance = { ...out.dataProvenance, profileReviewedByUser: true }
  return out
}

// Records compared without provenance (the CV rules and the AI always differ there).
const plain = (record) => JSON.stringify({ ...record, extraction: undefined, userConfirmed: undefined, source: undefined, needsReview: undefined })

export function diffProfiles(original, suggested, editedPaths = new Set()) {
  const rows = []
  for (const path of SCALARS) {
    const from = get(original, path)
    const to = get(suggested, path)
    if (!to || to.state !== 'value') continue
    let kind = 'same'
    if (!from || from.state !== 'value') kind = 'new'
    else if (JSON.stringify(from.value) !== JSON.stringify(to.value)) kind = 'conflict'
    rows.push({ path, kind, from, to, locked: editedPaths.has(path) })
  }
  for (const [listPath, keyOf] of Object.entries(LIST_KEYS)) {
    const before = new Map((get(original, listPath) ?? []).map((record) => [keyOf(record), record]))
    for (const record of get(suggested, listPath) ?? []) {
      const path = `${listPath}#${keyOf(record)}`
      const from = before.get(keyOf(record))
      const kind = !from ? 'new' : plain(from) === plain(record) ? 'same' : 'changed'
      rows.push({ path, kind, from: from ?? null, to: record, locked: editedPaths.has(path) })
    }
  }
  return rows
}

// Applies accepted rows only; locked rows (the user's own edits) and 'same' rows never change anything.
export function applyAccepted(original, diff, acceptedPaths) {
  let out = clone(original)
  for (const row of diff) {
    if (row.locked || row.kind === 'same' || !acceptedPaths.has(row.path)) continue
    const [listPath] = row.path.split('#')
    if (listPath === row.path) {
      out = setPath(out, row.path, clone(row.to))
      continue
    }
    const keyOf = LIST_KEYS[listPath]
    const list = get(out, listPath) ?? []
    const index = list.findIndex((record) => keyOf(record) === keyOf(row.to))
    out = setPath(out, listPath, index < 0 ? [...list, clone(row.to)] : list.map((record, i) => (i === index ? clone(row.to) : record)))
  }
  return out
}

// A CV draft into the form: an untouched form takes the draft; otherwise only new items are added and what the user
// already typed wins every conflict.
export function mergeDraft(current, draft) {
  if (isUntouched(current)) return clone(draft)
  const rows = diffProfiles(current, draft).filter((row) => row.kind === 'new')
  return { ...applyAccepted(current, rows, new Set(rows.map((row) => row.path))), inputMethod: 'cv', cvLanguage: draft.cvLanguage }
}

// What the user changed after the CV draft (or filled in when there was none). The compare view locks these.
export function userEditedPaths(draft, current) {
  const edited = new Set()
  for (const path of SCALARS) {
    const before = draft ? get(draft, path) ?? EMPTY_STATE : EMPTY_STATE
    if (JSON.stringify(before) !== JSON.stringify(get(current, path) ?? EMPTY_STATE)) edited.add(path)
  }
  for (const [listPath, keyOf] of Object.entries(LIST_KEYS)) {
    const before = new Map((draft ? get(draft, listPath) ?? [] : []).map((record) => [keyOf(record), record]))
    for (const record of get(current, listPath) ?? []) {
      const was = before.get(keyOf(record))
      if (!was || plain(was) !== plain(record)) edited.add(`${listPath}#${keyOf(record)}`)
    }
  }
  return edited
}

// "Career interests" and "preferred career fields" became one list (owner, 30 Oct). A profile saved before keeps
// what was typed in either box, each text once.
export function mergeCareerFields(profile) {
  if (!profile?.preferences || !('preferredCareerFields' in profile.preferences)) return profile
  const { preferredCareerFields, ...preferences } = profile.preferences
  const interests = [...(preferences.careerInterests ?? [])]
  const seen = new Set(interests.map((item) => String(item?.name ?? item).toLowerCase()))
  for (const text of preferredCareerFields ?? []) if (!seen.has(String(text).toLowerCase())) interests.push(text)
  return { ...profile, preferences: { ...preferences, careerInterests: interests } }
}

// What a guest keeps in the browser: no CV quotes and no raw text.
export function minimizeForGuest(profile) {
  return JSON.parse(JSON.stringify(profile, (key, value) => (key === 'evidence' || key === 'text' || key === 'rawText' ? undefined : value)))
}
