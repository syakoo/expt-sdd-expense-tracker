import js from '@eslint/js'
import pluginRouter from '@tanstack/eslint-plugin-router'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// import 境界の制限パターン。設定ブロックごとに必要な分だけ展開する
const RESTRICT_PARENT_RELATIVE = {
  group: ['..', '../**'],
  message:
    '`../` で始まる import は使えません。ディレクトリをまたぐ import は `@/` エイリアスで書いてください。',
}

// 個別に許可・制限するもの（schema / ui / seed.server）は除外し、下の定数で扱う
const RESTRICT_IDENTITY_INTERNAL = {
  group: [
    '@/identity/**',
    '!@/identity/schema',
    '!@/identity/ui',
    '!@/identity/seed.server',
  ],
  message:
    '`@/identity` の内部モジュールは import できません。`@/identity`（外部キー参照なら `@/identity/schema`）を使ってください。',
}

const RESTRICT_IDENTITY_UI = {
  group: ['@/identity/ui'],
  message:
    '`@/identity/ui` はアプリシェル（`src/routes/__root.tsx`、`src/routes/select-user.tsx`）専用です。現在ユーザーは `@/identity` から取得してください。',
}

const RESTRICT_IDENTITY_SEED = {
  group: ['@/identity/seed.server'],
  message:
    '`@/identity/seed.server` はテストファイル（`*.test.ts` / `*.test.tsx`）専用です。',
}

// 個別に許可・制限するもの（schema / ui / api.server / test-fixtures.server）は除外し、下の定数で扱う
const RESTRICT_RECEIPTS_INTERNAL = {
  group: [
    '@/receipts/**',
    '!@/receipts/schema',
    '!@/receipts/ui',
    '!@/receipts/api.server',
    '!@/receipts/test-fixtures.server',
  ],
  message:
    '`@/receipts` の内部モジュールは import できません。`@/receipts`、`@/receipts/ui`、サーバーコードなら `@/receipts/api.server`、外部キー参照なら `@/receipts/schema` を使ってください。',
}

const RESTRICT_RECEIPTS_TEST_FIXTURES = {
  group: ['@/receipts/test-fixtures.server'],
  message:
    '`@/receipts/test-fixtures.server` はテストファイル（`*.test.ts` / `*.test.tsx`）専用です。',
}

const RESTRICT_DB_INTERNAL = {
  group: ['@/db/**', '!@/db/client.server', '!@/db/test-utils.server'],
  message:
    '`@/db` の内部モジュールは import できません。自機能のテーブルへのクエリには `@/db/client.server` を使ってください。',
}

const RESTRICT_DB_TEST_UTILS = {
  group: ['@/db/test-utils.server'],
  message:
    '`@/db/test-utils.server` はテストファイル（`*.test.ts` / `*.test.tsx`）専用です。',
}

// 機能モジュールごとの境界。新しい機能モジュールを足したら、内部の制限パターンを定義してここに追加する。
// - internal: モジュールの外から import できない内部ファイル
// - testOnly: モジュールの外ではテストファイルからだけ使えるもの
// - appShellOnly: モジュールの外ではアプリシェルからだけ使えるもの
// モジュール自身のファイルには自分の分をかけず、他のモジュールの分はすべてかける
const MODULE_BOUNDARIES = [
  {
    dir: 'src/identity',
    internal: [RESTRICT_IDENTITY_INTERNAL],
    testOnly: [RESTRICT_IDENTITY_SEED],
    appShellOnly: [RESTRICT_IDENTITY_UI],
  },
  {
    dir: 'src/receipts',
    internal: [RESTRICT_RECEIPTS_INTERNAL],
    testOnly: [RESTRICT_RECEIPTS_TEST_FIXTURES],
    appShellOnly: [],
  },
  {
    dir: 'src/db',
    internal: [RESTRICT_DB_INTERNAL],
    testOnly: [RESTRICT_DB_TEST_UTILS],
    appShellOnly: [],
  },
]

const MODULE_FILES = MODULE_BOUNDARIES.map(({ dir }) => `${dir}/**`)

// `@/identity/ui` を import できるアプリシェルのルートファイル
const APP_SHELL_FILES = ['src/routes/__root.tsx', 'src/routes/select-user.tsx']

/** ownDir のファイルにかける制限パターン。ownDir がなければどのモジュールにも属さないファイル */
function boundaryPatterns(ownDir, { testFile = false, appShell = false } = {}) {
  return [
    RESTRICT_PARENT_RELATIVE,
    ...MODULE_BOUNDARIES.filter(({ dir }) => dir !== ownDir).flatMap(
      (module) => [
        ...module.internal,
        ...(testFile ? [] : module.testOnly),
        ...(appShell ? [] : module.appShellOnly),
      ],
    ),
  ]
}

function restrictImports(patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] }
}

export default defineConfig(
  globalIgnores([
    'src/routeTree.gen.ts',
    'dist/',
    '.output/',
    '.tanstack/',
    '.vinxi/',
    '.nitro/',
    'drizzle/',
    'data/',
    'test-results/',
    'playwright-report/',
  ]),
  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat.recommended,
      pluginRouter.configs['flat/recommended'],
    ],
  },
  // import 境界。flat config では後のブロックの no-restricted-imports が前のものを丸ごと置き換えるため、
  // 各ブロックで必要な制限パターンをすべて展開する
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: MODULE_FILES,
    rules: restrictImports(boundaryPatterns()),
  },
  {
    files: APP_SHELL_FILES,
    rules: restrictImports(boundaryPatterns(undefined, { appShell: true })),
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    ignores: MODULE_FILES,
    rules: restrictImports(boundaryPatterns(undefined, { testFile: true })),
  },
  ...MODULE_BOUNDARIES.flatMap(({ dir }) => [
    {
      files: [`${dir}/**/*.{ts,tsx}`],
      rules: restrictImports(boundaryPatterns(dir)),
    },
    {
      files: [`${dir}/**/*.test.{ts,tsx}`],
      rules: restrictImports(boundaryPatterns(dir, { testFile: true })),
    },
  ]),
  // 整形系ルールは Prettier に任せるため、最後に置いて無効化する
  eslintConfigPrettier,
)
