// Pure helpers for the profile form (Case B), the review (Case C), and the CV draft (Case A).
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

// A CV draft into the form: an untouched form takes the draft; otherwise only new items are added and what the user
// already typed wins every conflict (a job or skill the user already has keeps its own values and gets no CV tag).
export function mergeDraft(current, draft) {
  if (isUntouched(current)) return clone(draft)
  let out = clone(current)
  for (const path of SCALARS) {
    const from = get(out, path)
    const to = get(draft, path)
    if (to?.state === 'value' && from?.state !== 'value') out = setPath(out, path, clone(to))
  }
  for (const [listPath, keyOf] of Object.entries(LIST_KEYS)) {
    const list = get(out, listPath) ?? []
    const have = new Set(list.map(keyOf))
    // Repeated items inside the draft (same key twice) are all kept; only items the user already has are skipped.
    const added = (get(draft, listPath) ?? []).filter((record) => !have.has(keyOf(record)))
    if (added.length) out = setPath(out, listPath, [...list, ...clone(added)])
  }
  return { ...out, inputMethod: 'cv', cvLanguage: draft.cvLanguage }
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
