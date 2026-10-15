import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { MIGRATIONS_FOLDER, type AppDatabase } from './client.server'

/** drizzle/ の未適用マイグレーションを順に適用する。適用済みはスキップする。 */
export function applyMigrations(db: AppDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
