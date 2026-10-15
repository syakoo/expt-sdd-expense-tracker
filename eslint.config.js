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

// 内部モジュールの制限がかからないモジュール自身のファイル
const MODULE_INTERNAL_FILES = ['src/identity/**', 'src/db/**']

// `@/identity/ui` を import できるアプリシェルのルートファイル
const APP_SHELL_FILES = ['src/routes/__root.tsx', 'src/routes/select-user.tsx']

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
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [RESTRICT_PARENT_RELATIVE] },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: MODULE_INTERNAL_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            RESTRICT_PARENT_RELATIVE,
            RESTRICT_IDENTITY_INTERNAL,
            RESTRICT_IDENTITY_UI,
            RESTRICT_IDENTITY_SEED,
            RESTRICT_DB_INTERNAL,
            RESTRICT_DB_TEST_UTILS,
          ],
        },
      ],
    },
  },
  {
    files: APP_SHELL_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            RESTRICT_PARENT_RELATIVE,
            RESTRICT_IDENTITY_INTERNAL,
            RESTRICT_IDENTITY_SEED,
            RESTRICT_DB_INTERNAL,
            RESTRICT_DB_TEST_UTILS,
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    ignores: MODULE_INTERNAL_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            RESTRICT_PARENT_RELATIVE,
            RESTRICT_IDENTITY_INTERNAL,
            RESTRICT_IDENTITY_UI,
            RESTRICT_DB_INTERNAL,
          ],
        },
      ],
    },
  },
  // 整形系ルールは Prettier に任せるため、最後に置いて無効化する
  eslintConfigPrettier,
)
