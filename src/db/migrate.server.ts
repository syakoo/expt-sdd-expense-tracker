import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { AppDatabase } from './client.server'

// drizzle-kit generate の出力先（プロジェクトルートの drizzle/）
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** drizzle/ の未適用マイグレーションを順に適用する。適用済みはスキップする。 */
export function applyMigrations(db: AppDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
