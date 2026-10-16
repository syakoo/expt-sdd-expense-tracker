import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import type { UserId } from '@/identity'
import { seedUsers } from '@/identity/seed.server'
import {
  findReceiptsByIds,
  listReceiptsByOwner,
  lockReceipts,
} from './api.server'
import {
  createTestReceipt,
  deleteTestReceipt,
  updateTestReceipt,
} from './test-fixtures.server'
import type { ReceiptCategory, ReceiptId } from './types'
import { validateReceiptForm } from './validation'

const OWNER = 'user-01' as UserId
const MISSING_ID = '00000000-0000-4000-8000-000000000000' as ReceiptId

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
  db.$client.close()
})

describe('createTestReceipt', () => {
  it('overrides なしで、検証規則を満たすロックなしの領収書を作る', () => {
    const created = createTestReceipt(db, OWNER)

    expect(created.ownerId).toBe(OWNER)
    expect(created.locked).toBe(false)
    const validation = validateReceiptForm({
      date: created.date,
      amount: String(created.amount),
      payee: created.payee,
      category: created.category,
      memo: created.memo,
    })
    expect(validation).toEqual({
      ok: true,
      draft: {
        date: created.date,
        amount: created.amount,
        payee: created.payee,
        category: created.category,
        memo: created.memo,
      },
    })
    expect(created.memo).toBe('')
  })

  it('作った領収書が複数 ID での参照と所有者の一覧に出る', () => {
    const created = createTestReceipt(db, OWNER)

    expect(findReceiptsByIds(db, [created.id])).toEqual([created])
    expect(listReceiptsByOwner(db, OWNER)).toEqual([created])
    expect(listReceiptsByOwner(db, 'user-02' as UserId)).toEqual([])
  })

  it('overrides で指定した項目だけを差し替える', () => {
    const base = createTestReceipt(db, OWNER)
    const created = createTestReceipt(db, OWNER, {
      amount: 500,
      memo: '会議用',
    })

    expect(created).toEqual({
      ...base,
      id: created.id,
      amount: 500,
      memo: '会議用',
    })
    expect(created.id).not.toBe(base.id)
    expect(findReceiptsByIds(db, [created.id])).toEqual([created])
  })

  it('範囲外の金額・未定義の費目は CHECK 制約の Error になり、作られない', () => {
    expect(errorCode(() => createTestReceipt(db, OWNER, { amount: 0 }))).toBe(
      'SQLITE_CONSTRAINT_CHECK',
    )
    expect(
      errorCode(() => createTestReceipt(db, OWNER, { amount: 10_000_000 })),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(
      errorCode(() =>
        createTestReceipt(db, OWNER, {
          category: 'unknown' as ReceiptCategory,
        }),
      ),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(listReceiptsByOwner(db, OWNER)).toEqual([])
  })
})

describe('updateTestReceipt', () => {
  it('patch の項目だけを変え、所有者を変えない', () => {
    const created = createTestReceipt(db, OWNER)

    const updated = updateTestReceipt(db, created.id, {
      payee: 'タクシー',
      category: 'transportation',
    })

    expect(updated).toEqual({
      ...created,
      payee: 'タクシー',
      category: 'transportation',
    })
    expect(findReceiptsByIds(db, [created.id])).toEqual([updated])
  })

  it('patch に ownerId を混ぜても所有者は変わらない', () => {
    const created = createTestReceipt(db, OWNER)

    const updated = updateTestReceipt(db, created.id, {
      amount: 2000,
      ownerId: 'user-02',
    } as Parameters<typeof updateTestReceipt>[2])

    expect(updated.ownerId).toBe(OWNER)
    expect(listReceiptsByOwner(db, OWNER)).toEqual([updated])
    expect(listReceiptsByOwner(db, 'user-02' as UserId)).toEqual([])
  })

  it('存在しない ID なら Error を投げる', () => {
    expect(() => updateTestReceipt(db, MISSING_ID, { amount: 1 })).toThrow(
      Error,
    )
  })

  it('範囲外の値は CHECK 制約の Error になり、変わらない', () => {
    const created = createTestReceipt(db, OWNER)

    expect(
      errorCode(() => updateTestReceipt(db, created.id, { amount: -1 })),
    ).toBe('SQLITE_CONSTRAINT_CHECK')
    expect(findReceiptsByIds(db, [created.id])).toEqual([created])
  })
})

describe('deleteTestReceipt', () => {
  it('領収書を削除する', () => {
    const created = createTestReceipt(db, OWNER)

    deleteTestReceipt(db, created.id)

    expect(findReceiptsByIds(db, [created.id])).toEqual([])
    expect(listReceiptsByOwner(db, OWNER)).toEqual([])
  })

  it('存在しない ID なら Error を投げ、他の領収書を消さない', () => {
    const created = createTestReceipt(db, OWNER)

    expect(() => deleteTestReceipt(db, MISSING_ID)).toThrow(Error)
    expect(listReceiptsByOwner(db, OWNER)).toEqual([created])
  })

  it('ロック中なら外部キー（RESTRICT）違反の Error を投げ、削除しない', () => {
    const created = createTestReceipt(db, OWNER)
    lockReceipts(db, [created.id])

    // ON DELETE RESTRICT の違反は SQLite では SQLITE_CONSTRAINT_TRIGGER（"FOREIGN KEY constraint failed"）になる
    expect(errorCode(() => deleteTestReceipt(db, created.id))).toBe(
      'SQLITE_CONSTRAINT_TRIGGER',
    )
    expect(findReceiptsByIds(db, [created.id])).toEqual([
      { ...created, locked: true },
    ])
  })
})
