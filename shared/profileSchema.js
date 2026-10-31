// The structured profile that Case A (CV) and Case B (manual) both produce. Used by the browser, the server and the tests.
// Spec: docs/superpowers/specs/2026-10-29-cv-profile-module-design.md §4 (CV spec §7.1).

// Three states for an optional field: no information, "prefer not to say", or a value.
export const EMPTY = Object.freeze({ state: 'empty' })
export const DECLINED = Object.freeze({ state: 'declined' })
export const val = (value) => ({ state: 'value', value })

export const SKILL_SOURCES = ['cv_rules', 'cv_semantic', 'cv_ai', 'user_input']
export const LEVELS = ['basic', 'good', 'expert']
export const PROFICIENCY_STATUS = ['not_assessed', 'self_reported', 'assessed']
// Who are you? (owner, 31 Oct): the first four. The last two are the earlier answers, kept so saved profiles stay valid.
export const USER_CATEGORIES = ['fresh_graduate', 'student', 'underemployed', 'unemployed', 'working_adult', 'graduate_switcher']
export const FORBIDDEN_FIELDS = ['age', 'gender', 'ethnicity', 'religion', 'maritalStatus', 'photo', 'address', 'icNumber']

const CV_SOURCES = new Set(['cv_rules', 'cv_semantic', 'cv_ai'])
// Optional single fields: value type, and the allowed values where the list is fixed.
const FIELDS = {
  userCategory: ['string', USER_CATEGORIES],
  'education.highestQualification': ['string'],
  'education.educationStatus': ['string'],
  'employment.status': ['string'],
  'employment.yearsOfExperience': ['number'],
  'preferences.careerGoal': ['string'],
  'preferences.preferredWorkLocation': ['string'],
  'preferences.preferredLearningHoursPerWeek': ['number'],
}
const LISTS = [
  'education.records', 'employment.records', 'employment.industries', 'skills', 'certifications', 'projects', 'training',
  'preferences.careerInterests', 'occupationMappings',
]

export function emptyProfile({ inputMethod = 'manual', interfaceLanguage = 'en' } = {}) {
  return {
    profileId: null,
    profileVersion: 0,
    profileStatus: 'draft',
    inputMethod,
    interfaceLanguage,
    cvLanguage: null,
    userCategory: EMPTY,
    education: { highestQualification: EMPTY, educationStatus: EMPTY, records: [] },
    employment: { status: EMPTY, yearsOfExperience: EMPTY, records: [], industries: [] },
    skills: [],
    certifications: [],
    projects: [],
    training: [],
    preferences: {
      careerInterests: [],
      careerGoal: EMPTY,
      preferredWorkLocation: EMPTY,
      preferredLearningHoursPerWeek: EMPTY,
    },
    assessment: { status: 'incomplete', completedAt: null },
    occupationMappings: [],
    dataProvenance: { profileReviewedByUser: false, occupationalSources: [], extractionModel: null },
  }
}

// usedIn: the jobs and projects the skill was used in, by title ({ kind: 'job' | 'project', title }); none = other skills.
export function makeSkill({ name, originalText = name, canonicalId = null, category = null, source, extraction = null, usedIn = [] }) {
  return {
    name,
    originalText,
    canonicalId,
    category,
    source,
    userConfirmed: source === 'user_input',
    proficiency: null,
    proficiencyStatus: 'not_assessed',
    extraction,
    usedIn,
  }
}

const get = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object)

function checkForbidden(node, path, errors) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => checkForbidden(item, path ? `${path}.${i}` : String(i), errors))
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    const at = path ? `${path}.${key}` : key
    if (FORBIDDEN_FIELDS.includes(key)) errors.push({ path: at, code: 'forbidden_field' })
    else checkForbidden(value, at, errors)
  }
}

function checkSkill(skill, i, errors) {
  const at = `skills.${i}`
  if (!skill || typeof skill !== 'object' || typeof skill.name !== 'string' || !skill.name.trim()) {
    errors.push({ path: at, code: 'bad_type' })
    return
  }
  if (!SKILL_SOURCES.includes(skill.source)) errors.push({ path: `${at}.source`, code: 'bad_enum' })
  if (!PROFICIENCY_STATUS.includes(skill.proficiencyStatus)) errors.push({ path: `${at}.proficiencyStatus`, code: 'bad_enum' })
  // Older profiles have no usedIn; when present it lists jobs and projects by title.
  if (skill.usedIn !== undefined && !(Array.isArray(skill.usedIn) && skill.usedIn.every((p) => ['job', 'project'].includes(p?.kind) && typeof p.title === 'string'))) {
    errors.push({ path: `${at}.usedIn`, code: 'bad_type' })
  }
  if (skill.proficiency !== null && !LEVELS.includes(skill.proficiency)) errors.push({ path: `${at}.proficiency`, code: 'bad_enum' })
  // A CV can show that a skill is mentioned; only the user (or an assessment) can say how good they are.
  else if (skill.proficiency !== null && CV_SOURCES.has(skill.source) && !skill.userConfirmed) {
    errors.push({ path: `${at}.proficiency`, code: 'cv_set_proficiency' })
  }
}

export function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return { ok: false, errors: [{ path: '', code: 'bad_type' }] }
  const errors = []
  checkForbidden(profile, '', errors)
  for (const [path, [type, allowed]] of Object.entries(FIELDS)) {
    const field = get(profile, path)
    if (!field || !['empty', 'declined', 'value'].includes(field.state)) errors.push({ path, code: 'bad_state' })
    else if (field.state === 'value') {
      if (typeof field.value !== type || (type === 'number' && !(field.value >= 0))) errors.push({ path, code: 'bad_type' })
      else if (allowed && !allowed.includes(field.value)) errors.push({ path, code: 'bad_enum' })
    }
  }
  for (const path of LISTS) if (!Array.isArray(get(profile, path))) errors.push({ path, code: 'bad_type' })
  if (Array.isArray(profile.skills)) profile.skills.forEach((skill, i) => checkSkill(skill, i, errors))
  if (!['draft', 'confirmed'].includes(profile.profileStatus)) errors.push({ path: 'profileStatus', code: 'bad_enum' })
  return { ok: errors.length === 0, errors }
}

// Matching needs at least one skill we could identify; otherwise the user is asked for more.
export const hasUsableSkill = (profile) => (profile?.skills ?? []).some((skill) => Boolean(skill.canonicalId))
