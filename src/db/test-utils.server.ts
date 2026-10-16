import { openDatabase, type AppDatabase } from '@/db/client.server'
import { applyMigrations } from '@/db/migrate.server'

/**
 * in-memory SQLite を開き、drizzle/ の全マイグレーションを適用して返す。テストごとに独立した DB になる。
 * 使い終わったら呼び出し側が `db.$client.close()` で閉じる。
 */
export function createTestDatabase(): AppDatabase {
  const db = openDatabase({ path: ':memory:', create: true })
  applyMigrations(db)
  return db
}
