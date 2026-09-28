import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Resolve the `@/*` import alias (mirrors tsconfig.json) so tests can import
// app modules the same way the app does.
export default defineConfig({
  test: {
    // Agent worktrees under .claude/worktrees carry full copies of the repo.
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
  },
  // Override PostCSS so Vite doesn't try to load the app's Tailwind v4 config —
  // these are plain logic tests with no CSS to process.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
