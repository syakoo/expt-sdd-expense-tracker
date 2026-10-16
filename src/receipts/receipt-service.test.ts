import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import type { User } from '@/identity'
import { SEED_USERS, seedUsers } from '@/identity/seed.server'
import {
  deleteLocks,
  findReceiptById,
  findReceiptsByOwner,
  insertLocks,
} from './receipt-repository.server'
import {
  createOwnReceipt,
  deleteOwnReceipt,
  getOwnReceipt,
  listOwnReceipts,
  updateOwnReceipt,
} from './receipt-service.server'
import type { Receipt, ReceiptFormInput } from './types'

function seedUser(id: string): User {
  const user = SEED_USERS.find((u) => u.id === id)
  if (!user) throw new Error(`unknown seed user ${id}`)
  return { id: user.id, displayName: user.displayName, roles: user.roles }
}

const WORKER = seedUser('user-01')
const OTHER_WORKER = seedUser('user-02')
const APPROVER_ONLY = seedUser('user-03')
const BOTH_ROLES = seedUser('user-05')

const MISSING_ID = '00000000-0000-4000-8000-000000000000'

const form = (overrides: Partial<ReceiptFormInput> = {}): ReceiptFormInput => ({
  date: '2026-10-01',
  amount: '1234',
  payee: '文具店',
  category: 'supplies',
  memo: '',
  ...overrides,
})

const invalidForm = form({ date: '2026-02-30', amount: '0', payee: ' ' })

let db: AppDatabase

beforeEach(() => {
  db = createTestDatabase()
  seedUsers(db)
})

afterEach(() => {
  if (db.$client.open) db.$client.close()
})

/** receipts と receipt_locks の全行（DB が変わっていないことの比較用）。 */
function snapshot() {
  return {
    receipts: db.$client.prepare('SELECT * FROM receipts ORDER BY id').all(),
    locks: db.$client
      .prepare('SELECT * FROM receipt_locks ORDER BY receipt_id')
      .all(),
  }
}

function createFor(user: User, overrides?: Partial<ReceiptFormInput>) {
  const result = createOwnReceipt(db, user, form(overrides))
  if (result.status !== 'created') {
    throw new Error(`create failed: ${result.status}`)
  }
  return result.receipt
}

function lock(receipt: Receipt) {
  insertLocks(db, [receipt.id])
}

describe('所有者ごとの分離', () => {
  it('登録した領収書は所有者の一覧に出て、他人の一覧には出ない（1.2, 3.1, 3.6）', () => {
    const created = createFor(WORKER, { payee: ' 書店 ', memo: ' 会議用 ' })

    expect(created).toMatchObject({
      ownerId: WORKER.id,
      date: '2026-10-01',
      amount: 1234,
      payee: '書店',
      category: 'supplies',
      memo: '会議用',
      locked: false,
    })
    expect(listOwnReceipts(db, WORKER)).toEqual({
      status: 'ok',
      receipts: [created],
    })
    expect(listOwnReceipts(db, OTHER_WORKER)).toEqual({
      status: 'ok',
      receipts: [],
    })
  })

  it('一覧はリポジトリの並び順のまま返す（3.1）', () => {
    const older = createFor(WORKER, { date: '2026-09-01' })
    const newer = createFor(WORKER, { date: '2026-10-05' })

    const result = listOwnReceipts(db, WORKER)
    expect(result.status === 'ok' && result.receipts.map((r) => r.id)).toEqual([
      newer.id,
      older.id,
    ])
  })

  it('自分の領収書は 1 件取得できる', () => {
    const created = createFor(WORKER)
    expect(getOwnReceipt(db, WORKER, created.id)).toEqual({
      status: 'ok',
      receipt: created,
    })
  })
})

describe('ロール（6.1）', () => {
  it('承認者のみのユーザーは 5 操作すべてで forbidden を受け、DB が変わらない', () => {
    const target = createFor(WORKER)
    const before = snapshot()

    expect(listOwnReceipts(db, APPROVER_ONLY)).toEqual({ status: 'forbidden' })
    expect(getOwnReceipt(db, APPROVER_ONLY, target.id)).toEqual({
      status: 'forbidden',
    })
    expect(createOwnReceipt(db, APPROVER_ONLY, form())).toEqual({
      status: 'forbidden',
    })
    expect(
      updateOwnReceipt(db, APPROVER_ONLY, target.id, form({ payee: '変更' })),
    ).toEqual({ status: 'forbidden' })
    expect(deleteOwnReceipt(db, APPROVER_ONLY, target.id)).toEqual({
      status: 'forbidden',
    })
    expect(snapshot()).toEqual(before)
  })

  it('作業者でなければ DB に触れない（閉じた DB でも例外にならず forbidden）', () => {
    const target = createFor(WORKER)
    db.$client.close()

    expect(listOwnReceipts(db, APPROVER_ONLY)).toEqual({ status: 'forbidden' })
    expect(getOwnReceipt(db, APPROVER_ONLY, target.id)).toEqual({
      status: 'forbidden',
    })
    expect(createOwnReceipt(db, APPROVER_ONLY, form())).toEqual({
      status: 'forbidden',
    })
    expect(updateOwnReceipt(db, APPROVER_ONLY, target.id, form())).toEqual({
      status: 'forbidden',
    })
    expect(deleteOwnReceipt(db, APPROVER_ONLY, target.id)).toEqual({
      status: 'forbidden',
    })
  })

  it('作業者と承認者の両方のロールを持つユーザーは 5 操作すべてを行える', () => {
    const created = createFor(BOTH_ROLES)
    expect(created.ownerId).toBe(BOTH_ROLES.id)
    expect(listOwnReceipts(db, BOTH_ROLES)).toEqual({
      status: 'ok',
      receipts: [created],
    })
    expect(getOwnReceipt(db, BOTH_ROLES, created.id)).toEqual({
      status: 'ok',
      receipt: created,
    })
    expect(
      updateOwnReceipt(db, BOTH_ROLES, created.id, form({ payee: '変更後' })),
    ).toMatchObject({ status: 'updated', receipt: { payee: '変更後' } })
    expect(deleteOwnReceipt(db, BOTH_ROLES, created.id)).toEqual({
      status: 'deleted',
    })
  })
})

describe('存在と所有者（6.3, 6.4）', () => {
  it('他人の領収書の取得・更新・削除は not-found で、DB が変わらない', () => {
    const target = createFor(WORKER)
    const before = snapshot()

    expect(getOwnReceipt(db, OTHER_WORKER, target.id)).toEqual({
      status: 'not-found',
    })
    expect(
      updateOwnReceipt(db, OTHER_WORKER, target.id, form({ payee: '改ざん' })),
    ).toEqual({ status: 'not-found' })
    expect(deleteOwnReceipt(db, OTHER_WORKER, target.id)).toEqual({
      status: 'not-found',
    })
    expect(snapshot()).toEqual(before)
  })

  it('他人の領収書と存在しない ID・形式が不正な ID は同じ結果になる', () => {
    const target = createFor(WORKER)
    const before = snapshot()

    for (const id of [target.id, MISSING_ID, '', 'not-a-uuid']) {
      expect(getOwnReceipt(db, OTHER_WORKER, id)).toEqual({
        status: 'not-found',
      })
      expect(updateOwnReceipt(db, OTHER_WORKER, id, form())).toEqual({
        status: 'not-found',
      })
      expect(deleteOwnReceipt(db, OTHER_WORKER, id)).toEqual({
        status: 'not-found',
      })
    }
    expect(snapshot()).toEqual(before)
  })

  it('存在・所有者の判定は入力の検証より先に行う', () => {
    const target = createFor(WORKER)
    expect(updateOwnReceipt(db, OTHER_WORKER, target.id, invalidForm)).toEqual({
      status: 'not-found',
    })
    expect(updateOwnReceipt(db, WORKER, MISSING_ID, invalidForm)).toEqual({
      status: 'not-found',
    })
  })
})

describe('項目の検証（1.3, 2.10, 4.3）', () => {
  it('不正な入力での登録は invalid と項目ごとのメッセージを返し、DB が変わらない', () => {
    const before = snapshot()

    const result = createOwnReceipt(db, WORKER, invalidForm)

    expect(result.status).toBe('invalid')
    expect(result.status === 'invalid' && Object.keys(result.errors)).toEqual([
      'date',
      'amount',
      'payee',
    ])
    expect(snapshot()).toEqual(before)
  })

  it('不正な入力での更新は登録と同じ invalid を返し、DB が変わらない', () => {
    const target = createFor(WORKER)
    const before = snapshot()

    const createResult = createOwnReceipt(db, WORKER, invalidForm)
    const updateResult = updateOwnReceipt(db, WORKER, target.id, invalidForm)

    expect(updateResult).toEqual(createResult)
    expect(snapshot()).toEqual(before)
  })
})

describe('更新・削除（4.2, 4.4, 5.2）', () => {
  it('更新は内容を変え、所有者を変えない', () => {
    const target = createFor(WORKER)

    const result = updateOwnReceipt(
      db,
      WORKER,
      target.id,
      form({
        date: '2026-10-10',
        amount: '5000',
        payee: ' 新幹線 ',
        category: 'transportation',
        memo: ' 出張 ',
      }),
    )

    const expected: Receipt = {
      id: target.id,
      ownerId: WORKER.id,
      date: '2026-10-10',
      amount: 5000,
      payee: '新幹線',
      category: 'transportation',
      memo: '出張',
      locked: false,
    }
    expect(result).toEqual({ status: 'updated', receipt: expected })
    expect(findReceiptById(db, target.id)).toEqual(expected)
    expect(listOwnReceipts(db, WORKER)).toEqual({
      status: 'ok',
      receipts: [expected],
    })
  })

  it('削除すると一覧から消える', () => {
    const kept = createFor(WORKER, { payee: '残す' })
    const removed = createFor(WORKER, { payee: '消す' })

    expect(deleteOwnReceipt(db, WORKER, removed.id)).toEqual({
      status: 'deleted',
    })
    expect(listOwnReceipts(db, WORKER)).toEqual({
      status: 'ok',
      receipts: [kept],
    })
    expect(getOwnReceipt(db, WORKER, removed.id)).toEqual({
      status: 'not-found',
    })
  })
})

describe('ロック（7.1, 7.3, 7.4, 7.6）', () => {
  it('何もロックしていない初期状態では、すべての領収書が locked: false', () => {
    createFor(WORKER, { payee: 'A' })
    createFor(WORKER, { payee: 'B' })
    createFor(OTHER_WORKER, { payee: 'C' })

    for (const user of [WORKER, OTHER_WORKER]) {
      const result = listOwnReceipts(db, user)
      expect(result.status).toBe('ok')
      for (const receipt of result.status === 'ok' ? result.receipts : []) {
        expect(receipt.locked).toBe(false)
      }
    }
  })

  it('ロック中の領収書の更新・削除は、入力が不正でも locked を返し、DB が変わらない', () => {
    const target = createFor(WORKER)
    lock(target)
    const before = snapshot()

    expect(updateOwnReceipt(db, WORKER, target.id, invalidForm)).toEqual({
      status: 'locked',
    })
    expect(
      updateOwnReceipt(db, WORKER, target.id, form({ payee: '変更' })),
    ).toEqual({ status: 'locked' })
    expect(deleteOwnReceipt(db, WORKER, target.id)).toEqual({
      status: 'locked',
    })
    expect(snapshot()).toEqual(before)
  })

  it('ロック中でも取得と一覧はでき、locked: true で返る', () => {
    const target = createFor(WORKER)
    lock(target)

    expect(getOwnReceipt(db, WORKER, target.id)).toEqual({
      status: 'ok',
      receipt: { ...target, locked: true },
    })
    expect(listOwnReceipts(db, WORKER)).toEqual({
      status: 'ok',
      receipts: [{ ...target, locked: true }],
    })
  })

  it('他人のロック中の領収書は locked ではなく not-found になる', () => {
    const target = createFor(WORKER)
    lock(target)

    expect(updateOwnReceipt(db, OTHER_WORKER, target.id, form())).toEqual({
      status: 'not-found',
    })
    expect(deleteOwnReceipt(db, OTHER_WORKER, target.id)).toEqual({
      status: 'not-found',
    })
  })

  it('取得した後にロックされると、その後の更新・削除は locked になる', () => {
    const target = createFor(WORKER)
    const fetched = getOwnReceipt(db, WORKER, target.id)
    expect(fetched).toMatchObject({ status: 'ok', receipt: { locked: false } })

    lock(target)

    expect(
      updateOwnReceipt(db, WORKER, target.id, form({ payee: '変更' })),
    ).toEqual({ status: 'locked' })
    expect(deleteOwnReceipt(db, WORKER, target.id)).toEqual({
      status: 'locked',
    })
    expect(findReceiptById(db, target.id)).toEqual({ ...target, locked: true })
  })

  it('ロック解除後は更新・削除が成功する', () => {
    const target = createFor(WORKER)
    lock(target)
    deleteLocks(db, [target.id])

    expect(
      updateOwnReceipt(db, WORKER, target.id, form({ payee: '解除後' })),
    ).toMatchObject({
      status: 'updated',
      receipt: { payee: '解除後', locked: false },
    })
    expect(deleteOwnReceipt(db, WORKER, target.id)).toEqual({
      status: 'deleted',
    })
    expect(findReceiptsByOwner(db, WORKER.id)).toEqual([])
  })
})

describe('DB の障害（8.5 の前提）', () => {
  it('閉じた DB で作業者が操作すると、例外が伝播する', () => {
    const target = createFor(WORKER)
    db.$client.close()

    expect(() => listOwnReceipts(db, WORKER)).toThrow()
    expect(() => getOwnReceipt(db, WORKER, target.id)).toThrow()
    expect(() => createOwnReceipt(db, WORKER, form())).toThrow()
    expect(() => updateOwnReceipt(db, WORKER, target.id, form())).toThrow()
    expect(() => deleteOwnReceipt(db, WORKER, target.id)).toThrow()
  })

  it('書き込み中の DB エラーは握りつぶさずに伝播し、トランザクションが巻き戻る', () => {
    const target = createFor(WORKER)
    const before = snapshot()
    db.$client.exec(`
      CREATE TRIGGER fail_update BEFORE UPDATE ON receipts
      BEGIN SELECT RAISE(ABORT, 'boom'); END;
    `)

    expect(() =>
      updateOwnReceipt(db, WORKER, target.id, form({ payee: '変更' })),
    ).toThrow(/boom/)
    expect(snapshot()).toEqual(before)
  })
})
