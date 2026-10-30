// Vitest settings: the defaults, plus helper worktrees under .claude/ are never collected as tests,
// so a plain `npm test` runs this checkout's tests only.
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.claude/**', 'node_modules/**'],
  },
})
