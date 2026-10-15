import js from '@eslint/js'
import pluginRouter from '@tanstack/eslint-plugin-router'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
  // 整形系ルールは Prettier に任せるため、最後に置いて無効化する
  eslintConfigPrettier,
)
