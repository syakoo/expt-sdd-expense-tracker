import { sql, type SQL } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import { RECEIPT_CATEGORIES } from './types'

function constraintCode(db: AppDatabase, statement: SQL): unknown {
  try {
    db.run(statement)
  } catch (error) {
    return ((error as Error).cause as { code?: unknown } | undefined)?.code
  }
  return undefined
}

describe('receipts / receipt_locks テーブル', () => {
  const opened: AppDatabase[] = []

  function open(): AppDatabase {
    const db = createTestDatabase()
    opened.push(db)
    db.run(sql`INSERT INTO users (id, display_name) VALUES ('user-a', '花子')`)
    return db
  }

  function insertReceipt(id: string, amount: number, category: string): SQL {
    return sql`INSERT INTO receipts (id, owner_id, date, amount, payee, category, created_at, updated_at)
      VALUES (${id}, 'user-a', '2026-10-01', ${amount}, '文具店', ${category}, 1, 1)`
  }

  afterEach(() => {
    for (const db of opened.splice(0)) db.$client.close()
  })

  it('マイグレーション適用直後は両テーブルが空で存在する（ロックの記録が 1 件もない）', () => {
    const db = createTestDatabase()
    opened.push(db)

    expect(db.all(sql`SELECT id FROM receipts`)).toEqual([])
    expect(db.all(sql`SELECT receipt_id FROM receipt_locks`)).toEqual([])
  })

  it('所有者・日付・作成日時のインデックスがある', () => {
    const db = open()

    const columns = db.all<{ name: string }>(
      sql`SELECT ii.name FROM sqlite_master m, pragma_index_info(m.name) ii
        WHERE m.type = 'index' AND m.name = 'receipts_owner_date_created_idx'
        ORDER BY ii.seqno`,
    )
    expect(columns.map((c) => c.name)).toEqual([
      'owner_id',
      'date',
      'created_at',
    ])
  })

  it('メモを省略すると空文字になる', () => {
    const db = open()
    db.run(insertReceipt('r-1', 1234, 'supplies'))

    expect(db.get(sql`SELECT memo FROM receipts WHERE id = 'r-1'`)).toEqual({
      memo: '',
    })
  })

  it('金額は 1〜9,999,999 だけを受け付ける', () => {
    const db = open()

    expect(constraintCode(db, insertReceipt('r-0', 0, 'other'))).toBe(
      'SQLITE_CONSTRAINT_CHECK',
    )
    expect(
      constraintCode(db, insertReceipt('r-big', 10_000_000, 'other')),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(
      constraintCode(db, insertReceipt('r-min', 1, 'other')),
    ).toBeUndefined()
    expect(
      constraintCode(db, insertReceipt('r-max', 9_999_999, 'other')),
    ).toBeUndefined()
  })

  it('費目は 7 値だけを受け付ける', () => {
    const db = open()

    expect(constraintCode(db, insertReceipt('r-x', 100, 'food'))).toBe(
      'SQLITE_CONSTRAINT_CHECK',
    )
    RECEIPT_CATEGORIES.forEach((category, i) => {
      expect(
        constraintCode(db, insertReceipt(`r-${i}`, 100, category)),
      ).toBeUndefined()
    })
  })

  it('所有者は存在するユーザーでなければならない', () => {
    const db = open()

    expect(
      constraintCode(
        db,
        sql`INSERT INTO receipts (id, owner_id, date, amount, payee, category, created_at, updated_at)
          VALUES ('r-1', 'missing-user', '2026-10-01', 100, '文具店', 'other', 1, 1)`,
      ),
    ).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
  })

  it('ロック中の領収書は削除できず、ロックを外すと削除できる', () => {
    const db = open()
    db.run(insertReceipt('r-1', 100, 'other'))
    db.run(
      sql`INSERT INTO receipt_locks (receipt_id, locked_at) VALUES ('r-1', 1)`,
    )

    // ON DELETE RESTRICT の違反は SQLite では SQLITE_CONSTRAINT_TRIGGER（"FOREIGN KEY constraint failed"）になる
    expect(constraintCode(db, sql`DELETE FROM receipts WHERE id = 'r-1'`)).toBe(
      'SQLITE_CONSTRAINT_TRIGGER',
    )
    expect(db.all(sql`SELECT id FROM receipts`)).toEqual([{ id: 'r-1' }])

    db.run(sql`DELETE FROM receipt_locks WHERE receipt_id = 'r-1'`)
    expect(
      constraintCode(db, sql`DELETE FROM receipts WHERE id = 'r-1'`),
    ).toBeUndefined()
  })

  it('存在しない領収書にはロックを付けられない', () => {
    const db = open()

    expect(
      constraintCode(
        db,
        sql`INSERT INTO receipt_locks (receipt_id, locked_at) VALUES ('missing', 1)`,
      ),
    ).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
  })
})
