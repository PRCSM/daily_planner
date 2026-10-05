import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import { importX } from 'eslint-plugin-import-x'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'

/**
 * Layering, strictly one-directional:
 *   routes/ → features/ → ui/ → domain/ → data/ → lib/
 * A layer may import from layers to its right, never to its left.
 */
const LAYERS = ['lib', 'data', 'domain', 'ui', 'features', 'routes']
const layerZones = LAYERS.flatMap((layer, i) =>
  LAYERS.slice(i + 1).map((higher) => ({
    target: `./src/${layer}`,
    from: `./src/${higher}`,
    message: `Layer violation: ${layer}/ must not import from ${higher}/ (routes → features → ui → domain → data → lib).`,
  })),
)

// domain/ is PURE. It may take row *types* from data/types, nothing else from data/.
const domainPurity = {
  target: './src/domain',
  from: './src/data',
  except: ['./types.ts'],
  message: 'domain/ is pure: only data/types may be imported (types, no Dexie).',
}

// The only module allowed to import the Supabase SDK.
const NETWORK_SDK = ['@supabase/supabase-js', '@supabase/*']

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'dev-dev', 'dev-dist', 'node_modules', 'playwright-report', 'test-results', 'supabase/functions/ai/index.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.app.json' })],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'import-x/no-restricted-paths': ['error', { zones: [...layerZones, domainPurity] }],
      // ── Network is confined to lib/ai (fetch) and lib/supabase.ts (SDK) ──
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network calls live in src/lib/ai only.' },
        { name: 'XMLHttpRequest', message: 'Network calls live in src/lib/ai only.' },
        { name: 'WebSocket', message: 'Network calls live in src/lib/ai only.' },
        { name: 'EventSource', message: 'Network calls live in src/lib/ai only.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: 'Network calls live in src/lib/ai only.' },
        { object: 'globalThis', property: 'fetch', message: 'Network calls live in src/lib/ai only.' },
        { object: 'navigator', property: 'sendBeacon', message: 'Network calls live in src/lib/ai only.' },
      ],
      'no-restricted-imports': ['error', { paths: NETWORK_SDK.map((name) => ({ name, message: 'Only src/lib/supabase.ts may import the Supabase SDK.' })), patterns: [{ group: ['@supabase/*'], message: 'Only src/lib/supabase.ts may import the Supabase SDK.' }] }],
      // ── One reader of the clock: src/lib/clock.ts ──
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Read the clock through lib/clock (readClock) only.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Read the clock through lib/clock (readClock) only.' },
        { selector: "CallExpression[callee.name='dayjs'][arguments.length=0]", message: 'dayjs() reads the clock. Pass a date string.' },
        { selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']", message: 'toISOString().slice() is the UTC date — wrong for 5.5h/day in IST. Use lib/clock.' },
      ],
    },
  },
  // lib/ai is the ONLY place allowed to call fetch.
  {
    files: ['src/lib/ai/**/*.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  // The Edge Function runs server-side, not in the app bundle: it owns its own network access.
  {
    files: ['supabase/functions/**/*.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' },
  },
  // The Supabase client module may import the SDK.
  {
    files: ['src/lib/supabase.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  // The clock module is the one reader of the clock.
  {
    files: ['src/lib/clock.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  // domain/ is pure: no React, no Dexie, no router, no network.
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'domain/ is pure — no React.' },
          { name: 'react-dom', message: 'domain/ is pure — no React.' },
          { name: 'react-router', message: 'domain/ is pure — no router.' },
          { name: 'dexie', message: 'domain/ is pure — no Dexie.' },
          { name: 'dexie-react-hooks', message: 'domain/ is pure — no Dexie.' },
          { name: 'zustand', message: 'domain/ is pure — no UI state.' },
        ],
        patterns: [{ group: ['@supabase/*', '@/lib/ai', '@/lib/ai/*', '@/lib/supabase', '@/lib/clock'], message: 'domain/ is pure: no network, and no clock — take `today` as a parameter.' }],
      }],
    },
  },
  // No component touches the database directly.
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/routes/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'dexie', message: 'Components never touch Dexie; go through data/repos.' }],
        patterns: [
          { group: ['@/data/db', '@/data/db.ts'], message: 'Components never touch the db; go through data/repos.' },
          { group: ['@supabase/*'], message: 'Only src/lib/supabase.ts may import the Supabase SDK.' },
        ],
      }],
    },
  },
  // Tests and tooling may do what they need.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**', 'scripts/**', 'supabase/**/*.test.ts', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      'import-x/no-restricted-paths': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  { files: ['**/*.mjs', 'scripts/**'], languageOptions: { globals: { ...globals.node } } },
)
