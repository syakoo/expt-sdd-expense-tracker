import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import type { UserId } from '@/identity'
import { seedUsers } from '@/identity/seed.server'
import {
  deleteLocks,
  deleteReceiptRow,
  findReceiptById,
  findReceiptsByIds,
  findReceiptsByOwner,
  insertLocks,
  insertReceipt,
  updateReceiptRow,
} from './receipt-repository.server'
import type { ReceiptDraft, ReceiptId } from './types'

const OWNER = 'user-01' as UserId
const OTHER = 'user-02' as UserId

const draft = (overrides: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  date: '2026-10-01',
  amount: 1234,
  payee: '文具店',
  category: 'supplies',
  memo: '',
  ...overrides,
})

/** better-sqlite3 のエラーコード（drizzle が包んだ cause の code）を取り出す。 */
function errorCode(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    const cause = (error as Error).cause as { code?: unknown } | undefined
    return cause?.code ?? (error as { code?: unknown }).code
  }
  return undefined
}

let db: AppDatabase

beforeEach(() => {
  db = createTestDatabase()
  seedUsers(db)
})

afterEach(() => {
  vi.useRealTimers()
  db.$client.close()
})

/** 作成日時を指定して挿入する。 */
function insertAt(
  now: number,
  owner: UserId,
  overrides?: Partial<ReceiptDraft>,
) {
  vi.useFakeTimers({ now, toFake: ['Date'] })
  try {
    return insertReceipt(db, owner, draft(overrides))
  } finally {
    vi.useRealTimers()
  }
}

describe('insertReceipt / findReceiptById', () => {
  it('新しい UUID の ID と所有者を付けて保存し、ロックなしで返す', () => {
    const created = insertReceipt(
      db,
      OWNER,
      draft({ memo: '会議用', category: 'meeting', amount: 9_999_999 }),
    )

    expect(created).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
      ownerId: OWNER,
      date: '2026-10-01',
      amount: 9_999_999,
      payee: '文具店',
      category: 'meeting',
      memo: '会議用',
      locked: false,
    })
    expect(findReceiptById(db, created.id)).toEqual(created)
    expect(insertReceipt(db, OWNER, draft()).id).not.toBe(created.id)
  })

  it('作成日時と更新日時をミリ秒で記録する', () => {
    const created = insertAt(1_760_000_000_000, OWNER)

    expect(
      db.get(
        sql`SELECT created_at, updated_at FROM receipts WHERE id = ${created.id}`,
      ),
    ).toEqual({ created_at: 1_760_000_000_000, updated_at: 1_760_000_000_000 })
  })

  it('存在しない ID・空文字なら undefined を返し、所有者で絞らない', () => {
    const others = insertReceipt(db, OTHER, draft())

    expect(findReceiptById(db, 'no-such-id')).toBeUndefined()
    expect(findReceiptById(db, '')).toBeUndefined()
    expect(findReceiptById(db, others.id)?.ownerId).toBe(OTHER)
  })
})

describe('findReceiptsByOwner', () => {
  it('所有者の領収書だけを、日付の降順 → 作成の新しい順 → ID の降順で返す', () => {
    const old = insertAt(1_000, OWNER, { date: '2026-09-30' })
    const sameDayEarly = insertAt(2_000, OWNER, { date: '2026-10-05' })
    const newest = insertAt(3_000, OWNER, { date: '2026-10-10' })
    const sameDayLate = insertAt(4_000, OWNER, { date: '2026-10-05' })
    insertAt(5_000, OTHER, { date: '2026-10-07' })
    const tieA = insertAt(6_000, OWNER, { date: '2026-10-01' })
    const tieB = insertAt(6_000, OWNER, { date: '2026-10-01' })
    const [tieHigh, tieLow] = [tieA, tieB].sort((a, b) =>
      a.id < b.id ? 1 : -1,
    )

    expect(findReceiptsByOwner(db, OWNER).map((r) => r.id)).toEqual([
      newest.id,
      sameDayLate.id,
      sameDayEarly.id,
      tieHigh?.id,
      tieLow?.id,
      old.id,
    ])
  })

  it('領収書がない所有者には空の配列を返す', () => {
    insertReceipt(db, OTHER, draft())

    expect(findReceiptsByOwner(db, OWNER)).toEqual([])
  })

  it('locked は receipt_locks の行の有無で決まる', () => {
    const a = insertReceipt(db, OWNER, draft())
    const b = insertReceipt(db, OWNER, draft())

    insertLocks(db, [a.id])

    const locked = new Map(
      findReceiptsByOwner(db, OWNER).map((r) => [r.id, r.locked]),
    )
    expect(locked.get(a.id)).toBe(true)
    expect(locked.get(b.id)).toBe(false)
    expect(findReceiptById(db, a.id)?.locked).toBe(true)
    expect(findReceiptById(db, b.id)?.locked).toBe(false)
  })
})

describe('findReceiptsByIds', () => {
  it('引数の順で返し、存在しない・形式が不正な ID を除き、重複を 1 件にまとめる', () => {
    const a = insertReceipt(db, OWNER, draft({ payee: 'A' }))
    const b = insertReceipt(db, OTHER, draft({ payee: 'B' }))
    const c = insertReceipt(db, OWNER, draft({ payee: 'C' }))
    insertLocks(db, [b.id])

    const found = findReceiptsByIds(db, [
      c.id,
      'not-a-uuid',
      a.id,
      '',
      c.id,
      '00000000-0000-4000-8000-000000000000',
      b.id,
    ])

    expect(found.map((r) => r.payee)).toEqual(['C', 'A', 'B'])
    expect(found.map((r) => r.locked)).toEqual([false, false, true])
  })

  it('空の配列には空の配列を返す', () => {
    insertReceipt(db, OWNER, draft())

    expect(findReceiptsByIds(db, [])).toEqual([])
  })
})

describe('updateReceiptRow', () => {
  it('項目と更新日時だけを更新し、所有者と作成日時を変えない', () => {
    const created = insertAt(1_000, OWNER)

    vi.useFakeTimers({ now: 9_000, toFake: ['Date'] })
    const updated = updateReceiptRow(
      db,
      created.id,
      draft({
        date: '2026-10-02',
        amount: 500,
        payee: 'タクシー',
        category: 'transportation',
        memo: '移動',
      }),
    )
    vi.useRealTimers()

    const expected = {
      id: created.id,
      ownerId: OWNER,
      date: '2026-10-02',
      amount: 500,
      payee: 'タクシー',
      category: 'transportation',
      memo: '移動',
      locked: false,
    }
    expect(updated).toEqual(expected)
    expect(findReceiptById(db, created.id)).toEqual(expected)
    expect(
      db.get(
        sql`SELECT owner_id, created_at, updated_at FROM receipts WHERE id = ${created.id}`,
      ),
    ).toEqual({ owner_id: OWNER, created_at: 1_000, updated_at: 9_000 })
  })

  it('存在しない ID なら Error を投げる', () => {
    expect(() =>
      updateReceiptRow(db, 'no-such-id' as ReceiptId, draft()),
    ).toThrow(/no-such-id/)
  })
})

describe('deleteReceiptRow', () => {
  it('ロックされていない領収書を削除する', () => {
    const a = insertReceipt(db, OWNER, draft())
    const b = insertReceipt(db, OWNER, draft())

    deleteReceiptRow(db, a.id)

    expect(findReceiptById(db, a.id)).toBeUndefined()
    expect(findReceiptsByOwner(db, OWNER).map((r) => r.id)).toEqual([b.id])
  })

  it('ロック中の領収書の行は外部キー（RESTRICT）違反で削除できない', () => {
    const a = insertReceipt(db, OWNER, draft())
    insertLocks(db, [a.id])

    expect(errorCode(() => deleteReceiptRow(db, a.id))).toBe(
      'SQLITE_CONSTRAINT_TRIGGER',
    )
    expect(findReceiptById(db, a.id)?.locked).toBe(true)
  })

  it('ロック解除後は削除できる', () => {
    const a = insertReceipt(db, OWNER, draft())
    insertLocks(db, [a.id])
    deleteLocks(db, [a.id])

    deleteReceiptRow(db, a.id)

    expect(findReceiptById(db, a.id)).toBeUndefined()
  })
})

describe('insertLocks / deleteLocks', () => {
  it('既にロック中の ID は変えず、ロック日時も保つ', () => {
    const a = insertReceipt(db, OWNER, draft())
    const b = insertReceipt(db, OWNER, draft())

    vi.useFakeTimers({ now: 1_000, toFake: ['Date'] })
    insertLocks(db, [a.id])
    vi.setSystemTime(2_000)
    insertLocks(db, [a.id, b.id])
    vi.useRealTimers()

    expect(
      db.all(
        sql`SELECT receipt_id, locked_at FROM receipt_locks ORDER BY locked_at`,
      ),
    ).toEqual([
      { receipt_id: a.id, locked_at: 1_000 },
      { receipt_id: b.id, locked_at: 2_000 },
    ])
  })

  it('存在しない ID のロックは外部キー違反で失敗する', () => {
    expect(errorCode(() => insertLocks(db, ['no-such-id' as ReceiptId]))).toBe(
      'SQLITE_CONSTRAINT_FOREIGNKEY',
    )
    expect(db.all(sql`SELECT receipt_id FROM receipt_locks`)).toEqual([])
  })

  it('ロックを外し、ロックされていない ID は無視する', () => {
    const a = insertReceipt(db, OWNER, draft())
    const b = insertReceipt(db, OWNER, draft())
    insertLocks(db, [a.id])

    deleteLocks(db, [a.id, b.id, 'no-such-id' as ReceiptId])
    deleteLocks(db, [a.id])

    expect(findReceiptById(db, a.id)?.locked).toBe(false)
    expect(findReceiptById(db, b.id)?.locked).toBe(false)
  })

  it('空の配列では何もしない', () => {
    const a = insertReceipt(db, OWNER, draft())
    insertLocks(db, [a.id])

    insertLocks(db, [])
    deleteLocks(db, [])

    expect(findReceiptById(db, a.id)?.locked).toBe(true)
  })

  it('書き込みは呼び出し側のトランザクションに含まれる（自分で確定しない）', () => {
    const a = insertReceipt(db, OWNER, draft())

    expect(() =>
      db.transaction((tx) => {
        insertLocks(db, [a.id])
        insertReceipt(db, OWNER, draft())
        tx.rollback()
      }),
    ).toThrow()

    expect(findReceiptById(db, a.id)?.locked).toBe(false)
    expect(findReceiptsByOwner(db, OWNER)).toHaveLength(1)
  })
})

describe('CHECK 制約', () => {
  it('範囲外の金額を拒否する', () => {
    expect(
      errorCode(() => insertReceipt(db, OWNER, draft({ amount: 0 }))),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(
      errorCode(() => insertReceipt(db, OWNER, draft({ amount: 10_000_000 }))),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(findReceiptsByOwner(db, OWNER)).toEqual([])
  })

  it('未定義の費目を拒否する', () => {
    const created = insertReceipt(db, OWNER, draft())

    expect(
      errorCode(() =>
        insertReceipt(
          db,
          OWNER,
          draft({ category: 'food' as ReceiptDraft['category'] }),
        ),
      ),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(
      errorCode(() =>
        updateReceiptRow(
          db,
          created.id,
          draft({ category: 'food' as ReceiptDraft['category'] }),
        ),
      ),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(findReceiptById(db, created.id)?.category).toBe('supplies')
  })
})

describe('ファイル DB の永続化', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'receipts-repo-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('接続を閉じて開き直しても、登録した領収書が同じ内容で読める', () => {
    const dbPath = path.join(tempDir, 'app.db')
    // マイグレーション済み・シード済みの in-memory DB をファイルに書き出して、アプリと同じ経路（create: false）で開く
    db.run(sql`VACUUM INTO ${dbPath}`)
    const first = openDatabase({ path: dbPath, create: false })
    const created = insertReceipt(first, OWNER, draft({ memo: '永続化' }))
    insertLocks(first, [created.id])
    first.$client.close()

    const second = openDatabase({ path: dbPath, create: false })
    try {
      expect(findReceiptById(second, created.id)).toEqual({
        ...created,
        locked: true,
      })
      expect(findReceiptsByOwner(second, OWNER)).toEqual([
        { ...created, locked: true },
      ])
    } finally {
      second.$client.close()
    }
  })
})
