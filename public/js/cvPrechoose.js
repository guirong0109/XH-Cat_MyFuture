// The field of study read from a CV is prechosen (owner, 31 Oct): the first ISCED-F 2013 field the field search finds
// for the CV words, marked via 'cv_match' so the form asks the user to check it. Nothing found, or the search not
// available: the record keeps the words and the form asks the user to choose.
// search(words) → the /api/fields/search answer ({ version, candidates }) or null.
export async function prechooseFields(profile, search) {
  const records = await Promise.all(profile.education.records.map(async (record) => {
    const words = String(record.fieldOfStudy ?? '').trim()
    if (record.field || words.length < 2) return record
    const result = await search(words).catch(() => null)
    const top = result?.candidates?.[0]
    if (!top) return record
    return { ...record, field: { source: 'isced', code: top.code, title: top.title, version: result.version, via: 'cv_match', term: words } }
  }))
  return { ...profile, education: { ...profile.education, records } }
}
