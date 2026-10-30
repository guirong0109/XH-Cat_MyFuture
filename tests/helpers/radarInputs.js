// Helpers for Future Skills Radar tests.

// Keep the periods up to and including `period`, slicing every series of a DosmTable.
export function truncateTable(table, period) {
  const index = table.periods.indexOf(period)
  if (index < 0) throw new Error(`period not in table: ${period}`)
  const cut = (values) => values.slice(0, index + 1)
  return {
    periods: cut(table.periods),
    total: cut(table.total),
    unclassified: cut(table.unclassified),
    groups: Object.fromEntries(Object.entries(table.groups).map(([code, g]) => [code, { name: g.name, values: cut(g.values) }])),
  }
}
