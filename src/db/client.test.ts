import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DatabaseUnavailableError,
  getDb,
  MIGRATIONS_FOLDER,
  openDatabase,
  resolveDatabasePath,
} from './client.server'
import { applyMigrations } from './migrate.server'

describe('openDatabase', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'app-db-test-'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('存在しないパスを create: false で開くと file-not-found になり、メッセージにパスと対処を含む', () => {
    const databasePath = path.join(tempDir, 'missing.db')

    let caught: unknown
    try {
      openDatabase({ path: databasePath, create: false })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DatabaseUnavailableError)
    const error = caught as DatabaseUnavailableError
    expect(error.reason).toBe('file-not-found')
    expect(error.databasePath).toBe(databasePath)
    expect(error.message).toContain(databasePath)
    expect(error.message).toContain('npm run db:setup')
    expect(console.error).toHaveBeenCalledWith(error)
  })

  it('一時ファイルに書き込んだデータが、接続を閉じて開き直しても読める', () => {
    const databasePath = path.join(tempDir, 'app.db')

    const db = openDatabase({ path: databasePath, create: true })
    applyMigrations(db)
    db.run(
      sql`INSERT INTO users (id, display_name) VALUES ('user-x', '永続 太郎')`,
    )
    db.$client.close()

    const reopened = openDatabase({ path: databasePath, create: false })
    const rows = reopened.all<{ id: string; display_name: string }>(
      sql`SELECT id, display_name FROM users`,
    )
    expect(rows).toEqual([{ id: 'user-x', display_name: '永続 太郎' }])
    expect(reopened.get(sql`PRAGMA foreign_keys`)).toEqual({
      foreign_keys: 1,
    })
    expect(reopened.get(sql`PRAGMA journal_mode`)).toEqual({
      journal_mode: 'wal',
    })
    reopened.$client.close()
  })

  it('適用済みのマイグレーションは再適用せずスキップする', () => {
    const databasePath = path.join(tempDir, 'app.db')
    const db = openDatabase({ path: databasePath, create: true })

    applyMigrations(db)
    expect(() => applyMigrations(db)).not.toThrow()

    const applied = db.all(sql`SELECT id FROM __drizzle_migrations`)
    expect(applied).toHaveLength(1)
    db.$client.close()
  })

  it('マイグレーション未適用の DB を create: false で開くと migrations-not-applied になり、接続を閉じる', () => {
    const databasePath = path.join(tempDir, 'app.db')
    openDatabase({ path: databasePath, create: true }).$client.close()
    const closeSpy = vi.spyOn(Database.prototype, 'close')

    let caught: unknown
    try {
      openDatabase({ path: databasePath, create: false })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DatabaseUnavailableError)
    const error = caught as DatabaseUnavailableError
    expect(error.reason).toBe('migrations-not-applied')
    expect(error.message).toContain(databasePath)
    expect(error.message).toContain('npm run db:setup')
    expect(console.error).toHaveBeenCalledWith(error)
    expect(closeSpy).toHaveBeenCalled()
  })

  it('最後のマイグレーションの適用記録がないと migrations-pending になり、applyMigrations の後は開ける', () => {
    // 最後のエントリを除いたジャーナルで適用し、「新しいマイグレーションを取り込んだが未適用」の状態を作る
    const olderMigrationsFolder = path.join(tempDir, 'drizzle-older')
    cpSync(MIGRATIONS_FOLDER, olderMigrationsFolder, { recursive: true })
    const journalPath = path.join(olderMigrationsFolder, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: unknown[]
    }
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }),
    )

    const databasePath = path.join(tempDir, 'app.db')
    const db = openDatabase({ path: databasePath, create: true })
    migrate(db, { migrationsFolder: olderMigrationsFolder })
    db.$client.close()

    let caught: unknown
    try {
      openDatabase({ path: databasePath, create: false })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DatabaseUnavailableError)
    const error = caught as DatabaseUnavailableError
    expect(error.reason).toBe('migrations-pending')
    expect(error.message).toContain(databasePath)
    expect(error.message).toContain('npm run db:setup')
    expect(console.error).toHaveBeenCalledWith(error)

    const setup = openDatabase({ path: databasePath, create: true })
    applyMigrations(setup)
    setup.$client.close()

    const reopened = openDatabase({ path: databasePath, create: false })
    expect(reopened.all(sql`SELECT id FROM users`)).toEqual([])
    reopened.$client.close()
  })

  it('適用記録が最後のコミット済みマイグレーションより古いと migrations-pending になる', () => {
    const databasePath = path.join(tempDir, 'app.db')
    const db = openDatabase({ path: databasePath, create: true })
    applyMigrations(db)
    db.run(sql`UPDATE __drizzle_migrations SET created_at = created_at - 1`)
    db.$client.close()

    let caught: unknown
    try {
      openDatabase({ path: databasePath, create: false })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DatabaseUnavailableError)
    const error = caught as DatabaseUnavailableError
    expect(error.reason).toBe('migrations-pending')
    expect(error.message).toContain(databasePath)
    expect(error.message).toContain('npm run db:setup')
    expect(console.error).toHaveBeenCalledWith(error)
  })

  it('create: true ではマイグレーション未適用でも開ける', () => {
    const db = openDatabase({ path: ':memory:', create: true })
    expect(db.get(sql`SELECT 1 AS one`)).toEqual({ one: 1 })
    db.$client.close()
  })

  it('接続に失敗すると open-failed になり、メッセージにパスを含む', () => {
    // ディレクトリは存在するが SQLite ファイルとして開けない
    let caught: unknown
    try {
      openDatabase({ path: tempDir, create: false })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DatabaseUnavailableError)
    const error = caught as DatabaseUnavailableError
    expect(error.reason).toBe('open-failed')
    expect(error.message).toContain(tempDir)
    expect(console.error).toHaveBeenCalledWith(error)
  })
})

describe('getDb', () => {
  let tempDir: string
  const globalForDb = globalThis as {
    __appDatabase?: { $client: { close(): void } }
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'app-db-test-'))
  })

  afterEach(() => {
    globalForDb.__appDatabase?.$client.close()
    delete globalForDb.__appDatabase
    vi.unstubAllEnvs()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('DATABASE_PATH の DB に接続し、2 回目以降は同じ接続を返す', () => {
    const databasePath = path.join(tempDir, 'shared.db')
    vi.stubEnv('DATABASE_PATH', databasePath)
    const setup = openDatabase({ path: databasePath, create: true })
    applyMigrations(setup)
    setup.$client.close()

    expect(resolveDatabasePath()).toBe(databasePath)
    const first = getDb()
    expect(getDb()).toBe(first)
    expect(first.$client.name).toBe(databasePath)
  })

  it('DATABASE_PATH が未設定なら data/app.db を使う', () => {
    vi.stubEnv('DATABASE_PATH', undefined)
    expect(resolveDatabasePath()).toBe(
      path.resolve(process.cwd(), 'data/app.db'),
    )
  })
})
