import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  // 機能ごとのテーブル定義（src/<feature>/schema.ts）をすべて拾う
  schema: './src/*/schema.ts',
  out: './drizzle',
})
