import { existsSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { readMigrationFiles } from 'drizzle-orm/migrator'

// drizzle() が返す型。テストやスクリプトが接続を閉じられるよう $client を含める
export type AppDatabase = BetterSQLite3Database & {
  $client: Database.Database
}

export type DatabaseUnavailableReason =
  | 'file-not-found'
  | 'migrations-not-applied'
  | 'migrations-pending'
  | 'open-failed'

const DEFAULT_DATABASE_PATH = 'data/app.db'
// drizzle-kit generate の出力先（プロジェクトルートの drizzle/）
export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')
const MIGRATIONS_TABLE = '__drizzle_migrations'
const SETUP_COMMAND = 'npm run db:setup'

const REASON_MESSAGES: Record<DatabaseUnavailableReason, string> = {
  'file-not-found': 'DB ファイルが見つかりません',
  'migrations-not-applied': 'マイグレーションが適用されていません',
  'migrations-pending': '未適用のマイグレーションがあります',
  'open-failed': 'DB に接続できませんでした',
}

export class DatabaseUnavailableError extends Error {
  readonly reason: DatabaseUnavailableReason
  readonly databasePath: string

  constructor(params: {
    reason: DatabaseUnavailableReason
    databasePath: string
    cause: unknown
  }) {
    super(
      `${REASON_MESSAGES[params.reason]}（reason: ${params.reason}、DB パス: ${params.databasePath}）。` +
        `データ初期化手順 \`${SETUP_COMMAND}\` を実行してください。`,
      { cause: params.cause },
    )
    this.name = 'DatabaseUnavailableError'
    this.reason = params.reason
    this.databasePath = params.databasePath
  }
}

function fail(
  reason: DatabaseUnavailableReason,
  databasePath: string,
  cause: unknown,
): never {
  const error = new DatabaseUnavailableError({ reason, databasePath, cause })
  console.error(error)
  throw error
}

/** DATABASE_PATH（未設定なら data/app.db）をプロジェクトルート（カレントディレクトリ）から解決する。 */
export function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH
  return path.resolve(
    process.cwd(),
    configured ? configured : DEFAULT_DATABASE_PATH,
  )
}

/**
 * drizzle の migrator と同じ比較（適用記録の created_at の最大値 < ジャーナルの when）で、
 * コミット済みのマイグレーションがすべて適用されているかを確かめる。
 */
function findMigrationProblem(
  db: AppDatabase,
): 'migrations-not-applied' | 'migrations-pending' | undefined {
  const table = db.get<{ name: string } | undefined>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${MIGRATIONS_TABLE}`,
  )
  if (!table) return 'migrations-not-applied'

  const committed = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
  const latestCommitted = committed.at(-1)?.folderMillis
  if (latestCommitted === undefined) return undefined

  const applied = db.get<{ latest: number | null }>(
    sql`SELECT MAX(created_at) AS latest FROM ${sql.identifier(MIGRATIONS_TABLE)}`,
  )
  const latestApplied = applied?.latest
  if (latestApplied == null || Number(latestApplied) < latestCommitted) {
    return 'migrations-pending'
  }
  return undefined
}

/**
 * 指定パス（':memory:' 可）に接続する。getDb() もこれを create=false で使う。
 * create=true：ファイルを作成し、マイグレーションの適用状態を確認しない（初期化スクリプトとテスト用）。
 * create=false：ファイルの存在とマイグレーションの適用状態を確認する。
 */
export function openDatabase(params: {
  path: string
  create: boolean
}): AppDatabase {
  const { path: databasePath, create } = params
  const inMemory = databasePath === ':memory:'

  if (!create && !inMemory && !existsSync(databasePath)) {
    fail('file-not-found', databasePath, undefined)
  }

  let client: Database.Database | undefined
  try {
    client = new Database(databasePath, { fileMustExist: !create && !inMemory })
    client.pragma('foreign_keys = ON')
    client.pragma('journal_mode = WAL')
  } catch (cause) {
    client?.close()
    fail('open-failed', databasePath, cause)
  }

  const db = drizzle({ client })
  if (create) return db

  let problem: ReturnType<typeof findMigrationProblem>
  try {
    problem = findMigrationProblem(db)
  } catch (cause) {
    client.close()
    fail('open-failed', databasePath, cause)
  }
  if (problem) {
    client.close()
    fail(problem, databasePath, undefined)
  }
  return db
}

const globalForDb = globalThis as typeof globalThis & {
  __appDatabase?: AppDatabase
}

/** アプリ実行時の共有接続。初回呼び出しで接続し、以後は同じ接続を返す。 */
export function getDb(): AppDatabase {
  // 開発サーバーのモジュール再読み込みで接続が増えないよう globalThis に保持する
  globalForDb.__appDatabase ??= openDatabase({
    path: resolveDatabasePath(),
    create: false,
  })
  return globalForDb.__appDatabase
}
