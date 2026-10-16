import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'

describe('createTestDatabase', () => {
  const opened: AppDatabase[] = []

  function open(): AppDatabase {
    const db = createTestDatabase()
    opened.push(db)
    return db
  }

  afterEach(() => {
    for (const db of opened.splice(0)) db.$client.close()
  })

  it('マイグレーション適用済みで、users / user_roles が空の DB を返す', () => {
    const db = open()

    expect(db.$client.memory).toBe(true)
    expect(db.all(sql`SELECT id FROM users`)).toEqual([])
    expect(db.all(sql`SELECT user_id FROM user_roles`)).toEqual([])
  })

  it('呼び出しごとに独立した DB になる', () => {
    const first = open()
    const second = open()

    first.run(
      sql`INSERT INTO users (id, display_name) VALUES ('user-a', '独立 花子')`,
    )

    expect(first.all(sql`SELECT id FROM users`)).toEqual([{ id: 'user-a' }])
    expect(second.all(sql`SELECT id FROM users`)).toEqual([])
  })

  it('外部キー制約が有効になっている', () => {
    const db = open()

    expect(db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 })
    let caught: unknown
    try {
      db.run(
        sql`INSERT INTO user_roles (user_id, role) VALUES ('missing-user', 'worker')`,
      )
    } catch (error) {
      caught = error
    }
    expect((caught as Error | undefined)?.cause).toMatchObject({
      code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
    })
  })
})
