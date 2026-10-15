import { existsSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

// drizzle() が返す型。テストやスクリプトが接続を閉じられるよう $client を含める
export type AppDatabase = BetterSQLite3Database & {
  $client: Database.Database
}

// migrations-not-applied / migrations-pending の判定はタスク 3.2 で実装する
export type DatabaseUnavailableReason =
  | 'file-not-found'
  | 'migrations-not-applied'
  | 'migrations-pending'
  | 'open-failed'

const DEFAULT_DATABASE_PATH = 'data/app.db'
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
 * 指定パス（':memory:' 可）に接続する。getDb() もこれを create=false で使う。
 * create=true：ファイルを作成する（初期化スクリプトとテスト用）。
 * create=false：ファイルの存在を確認する。
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

  return drizzle({ client })
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
