import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import type { UserId } from '@/identity'
import { seedUsers } from '@/identity/seed.server'
import {
  findReceiptsByIds,
  listReceiptsByOwner,
  lockReceipts,
  unlockReceipts,
} from './api.server'
import { insertReceipt } from './receipt-repository.server'
import type { Receipt, ReceiptDraft, ReceiptId } from './types'

const OWNER = 'user-01' as UserId
const OTHER = 'user-02' as UserId
const MISSING_ID = '00000000-0000-4000-8000-000000000000' as ReceiptId

const draft = (overrides: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  date: '2026-10-01',
  amount: 1234,
  payee: '文具店',
  category: 'supplies',
  memo: '',
  ...overrides,
})

let db: AppDatabase

beforeEach(() => {
  db = createTestDatabase()
  seedUsers(db)
})

afterEach(() => {
  vi.useRealTimers()
  db.$client.close()
})

function create(owner: UserId = OWNER, overrides?: Partial<ReceiptDraft>) {
  return insertReceipt(db, owner, draft(overrides))
}

/** 作成日時を指定して挿入する。 */
function createAt(
  now: number,
  owner: UserId,
  overrides?: Partial<ReceiptDraft>,
): Receipt {
  vi.useFakeTimers({ now, toFake: ['Date'] })
  try {
    return create(owner, overrides)
  } finally {
    vi.useRealTimers()
  }
}

const lockedOf = (ids: readonly ReceiptId[]) =>
  findReceiptsByIds(db, ids).map((r) => r.locked)

describe('lockReceipts / unlockReceipts', () => {
  it('何も呼ばれていない初期状態では、すべての領収書がロックされていない', () => {
    const a = create()
    const b = create(OTHER)

    expect(lockedOf([a.id, b.id])).toEqual([false, false])
  })

  it('lockReceipts は冪等で、2 回呼んでもエラーにならずロック中のままになる', () => {
    const a = create()
    const b = create()

    lockReceipts(db, [a.id, b.id])
    expect(() => lockReceipts(db, [a.id, b.id])).not.toThrow()

    expect(lockedOf([a.id, b.id])).toEqual([true, true])
  })

  it('lockReceipts は既にロック中の ID と未ロックの ID が混ざっていても全部をロックする', () => {
    const a = create()
    const b = create()

    lockReceipts(db, [a.id])
    lockReceipts(db, [a.id, b.id, b.id])

    expect(lockedOf([a.id, b.id])).toEqual([true, true])
  })

  it('unlockReceipts は冪等で、ロックされていない・存在しない ID を無視する', () => {
    const a = create()
    const b = create()
    lockReceipts(db, [a.id])

    unlockReceipts(db, [a.id, b.id, MISSING_ID])
    expect(() => unlockReceipts(db, [a.id, b.id, MISSING_ID])).not.toThrow()

    expect(lockedOf([a.id, b.id])).toEqual([false, false])
  })

  it('ロックを外すと、他の領収書のロックは残る', () => {
    const a = create()
    const b = create()
    lockReceipts(db, [a.id, b.id])

    unlockReceipts(db, [a.id])

    expect(lockedOf([a.id, b.id])).toEqual([false, true])
  })

  it('空の配列を渡しても何もせずエラーにならない', () => {
    const a = create()

    expect(() => lockReceipts(db, [])).not.toThrow()
    expect(() => unlockReceipts(db, [])).not.toThrow()
    expect(lockedOf([a.id])).toEqual([false])
  })

  it('存在しない ID を含む lockReceipts は Error を投げ、他の ID もロックしない', () => {
    const a = create()
    const b = create()

    expect(() => lockReceipts(db, [a.id, MISSING_ID, b.id])).toThrow()

    expect(lockedOf([a.id, b.id])).toEqual([false, false])
  })

  it('外側のトランザクションをロールバックすると、その中で付けたロックも残らない', () => {
    const a = create()
    const rollback = new Error('rollback')

    expect(() =>
      db.transaction(() => {
        lockReceipts(db, [a.id])
        expect(lockedOf([a.id])).toEqual([true])
        throw rollback
      }),
    ).toThrow(rollback)

    expect(lockedOf([a.id])).toEqual([false])
  })

  it('外側のトランザクションをロールバックすると、その中で外したロックも元に戻る', () => {
    const a = create()
    lockReceipts(db, [a.id])

    expect(() =>
      db.transaction(() => {
        unlockReceipts(db, [a.id])
        throw new Error('rollback')
      }),
    ).toThrow('rollback')

    expect(lockedOf([a.id])).toEqual([true])
  })

  it('外側のトランザクションがコミットされれば、その中で付けたロックが残る', () => {
    const a = create()

    db.transaction(() => {
      lockReceipts(db, [a.id])
    })

    expect(lockedOf([a.id])).toEqual([true])
  })

  it('外側のトランザクションの中で lockReceipts が失敗しても、外側の他の書き込みは捕まえれば続けられる', () => {
    const a = create()
    const b = create()

    db.transaction(() => {
      lockReceipts(db, [a.id])
      expect(() => lockReceipts(db, [b.id, MISSING_ID])).toThrow()
    })

    expect(lockedOf([a.id, b.id])).toEqual([true, false])
  })
})

describe('findReceiptsByIds', () => {
  it('所有者で絞らず、引数の順で返す', () => {
    const a = create(OWNER)
    const b = create(OTHER)
    const c = create(OWNER)

    expect(findReceiptsByIds(db, [c.id, a.id, b.id])).toEqual([c, a, b])
  })

  it('存在しない ID・空文字・UUID でない文字列を Error なしに除く', () => {
    const a = create()
    const b = create()

    expect(
      findReceiptsByIds(db, [
        '',
        a.id,
        MISSING_ID,
        'not-a-uuid',
        b.id,
        "' OR 1=1 --",
      ]),
    ).toEqual([a, b])
  })

  it('重複した ID を最初の位置で 1 件にまとめる', () => {
    const a = create()
    const b = create()

    expect(findReceiptsByIds(db, [b.id, a.id, b.id, a.id])).toEqual([b, a])
  })

  it('空の配列には空の配列を返す', () => {
    create()

    expect(findReceiptsByIds(db, [])).toEqual([])
  })

  it('ロック中かどうかを含めて返す', () => {
    const a = create()
    const b = create()
    lockReceipts(db, [b.id])

    expect(findReceiptsByIds(db, [a.id, b.id])).toEqual([
      a,
      { ...b, locked: true },
    ])
  })
})

describe('listReceiptsByOwner', () => {
  it('所有者の領収書だけを、一覧画面と同じ順（日付の降順 → 登録の新しい順）で返す', () => {
    const old = createAt(1_000, OWNER, { date: '2026-09-30' })
    const sameDayFirst = createAt(2_000, OWNER, { date: '2026-10-01' })
    createAt(2_500, OTHER, { date: '2026-10-05' })
    const sameDaySecond = createAt(3_000, OWNER, { date: '2026-10-01' })
    const newest = createAt(500, OWNER, { date: '2026-10-02' })

    expect(listReceiptsByOwner(db, OWNER)).toEqual([
      newest,
      sameDaySecond,
      sameDayFirst,
      old,
    ])
  })

  it('領収書がない所有者には空の配列を返す', () => {
    create(OTHER)

    expect(listReceiptsByOwner(db, OWNER)).toEqual([])
  })

  it('ロック中かどうかを含めて返す', () => {
    const a = create()
    lockReceipts(db, [a.id])

    expect(listReceiptsByOwner(db, OWNER)).toEqual([{ ...a, locked: true }])
  })
})
