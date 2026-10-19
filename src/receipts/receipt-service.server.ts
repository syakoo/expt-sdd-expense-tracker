import type { AppDatabase } from '@/db/client.server'
import type { User } from '@/identity'
import { canManageReceipts } from './access'
import {
  deleteReceiptRow,
  findReceiptById,
  findReceiptsByOwner,
  insertReceipt,
  updateReceiptRow,
} from './receipt-repository.server'
import type {
  CreateReceiptResult,
  DeleteReceiptResult,
  GetMyReceiptResult,
  ListMyReceiptsResult,
  Receipt,
  ReceiptFormInput,
  UpdateReceiptResult,
} from './types'
import { validateReceiptForm } from './validation'

// 現在ユーザーによる操作の判断。判定の順序は ロール → 存在と所有者 → ロック → 項目の検証。
// 利用者の操作で起こりうる拒否は結果で返し、DB の障害は握りつぶさずに伝播させる。

const FORBIDDEN = { status: 'forbidden' } as const
const NOT_FOUND = { status: 'not-found' } as const
const LOCKED = { status: 'locked' } as const

/** 自分の領収書を返す。存在しない ID と他人の領収書を区別しない。 */
function findOwnReceipt(
  db: AppDatabase,
  user: User,
  receiptId: string,
): Receipt | undefined {
  const receipt = findReceiptById(db, receiptId)
  return receipt?.ownerId === user.id ? receipt : undefined
}

export function listOwnReceipts(
  db: AppDatabase,
  user: User,
): ListMyReceiptsResult {
  if (!canManageReceipts(user)) return FORBIDDEN
  return { status: 'ok', receipts: findReceiptsByOwner(db, user.id) }
}

export function getOwnReceipt(
  db: AppDatabase,
  user: User,
  receiptId: string,
): GetMyReceiptResult {
  if (!canManageReceipts(user)) return FORBIDDEN
  const receipt = findOwnReceipt(db, user, receiptId)
  return receipt ? { status: 'ok', receipt } : NOT_FOUND
}

export function createOwnReceipt(
  db: AppDatabase,
  user: User,
  form: ReceiptFormInput,
): CreateReceiptResult {
  if (!canManageReceipts(user)) return FORBIDDEN
  const validation = validateReceiptForm(form)
  if (!validation.ok) return { status: 'invalid', errors: validation.errors }
  return {
    status: 'created',
    receipt: insertReceipt(db, user.id, validation.draft),
  }
}

export function updateOwnReceipt(
  db: AppDatabase,
  user: User,
  receiptId: string,
  form: ReceiptFormInput,
): UpdateReceiptResult {
  if (!canManageReceipts(user)) return FORBIDDEN
  // 確認と書き込みを 1 つのトランザクションで行い、確認の後にロックされる隙間を作らない（7.3）
  return db.transaction((): UpdateReceiptResult => {
    const receipt = findOwnReceipt(db, user, receiptId)
    if (!receipt) return NOT_FOUND
    if (receipt.locked) return LOCKED
    const validation = validateReceiptForm(form)
    if (!validation.ok) return { status: 'invalid', errors: validation.errors }
    return {
      status: 'updated',
      receipt: updateReceiptRow(db, receipt.id, validation.draft),
    }
  })
}

export function deleteOwnReceipt(
  db: AppDatabase,
  user: User,
  receiptId: string,
): DeleteReceiptResult {
  if (!canManageReceipts(user)) return FORBIDDEN
  return db.transaction((): DeleteReceiptResult => {
    const receipt = findOwnReceipt(db, user, receiptId)
    if (!receipt) return NOT_FOUND
    if (receipt.locked) return LOCKED
    deleteReceiptRow(db, receipt.id)
    return { status: 'deleted' }
  })
}
