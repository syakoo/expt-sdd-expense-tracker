import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  openDatabase,
  resolveDatabasePath,
  type AppDatabase,
} from '@/db/client.server'
import { applyMigrations } from '@/db/migrate.server'
import { seedUsers } from '@/identity/seed.server'

// データ初期化手順：DB ファイル作成 → マイグレーション適用 → シード投入。何度実行しても同じ状態になる
function main(): void {
  const databasePath = resolveDatabasePath()
  let db: AppDatabase | undefined
  try {
    mkdirSync(path.dirname(databasePath), { recursive: true })
    db = openDatabase({ path: databasePath, create: true })
    applyMigrations(db)
    seedUsers(db)
    console.log(`データ初期化が完了しました（DB パス: ${databasePath}）`)
  } catch (error) {
    console.error(`データ初期化に失敗しました（DB パス: ${databasePath}）`)
    console.error(error)
    process.exitCode = 1
  } finally {
    db?.$client.close()
  }
}

main()
