import type { AppDatabase } from '@/db/client.server'
import type { UserId } from '@/identity'
import {
  deleteReceiptRow,
  findReceiptById,
  insertReceipt,
  updateReceiptRow,
} from './receipt-repository.server'
import type { Receipt, ReceiptDraft, ReceiptId } from './types'

// 下流のテストファイル専用の入口（eslint.config.js の testOnly）。
// 現在ユーザー・ロール・ロック・項目の検証は通さない。範囲外の値は DB の CHECK 制約で Error になる。
// receipts に列が増えたら、ここの既定値で補い、下流のテストを変えずに済ませる。

// 検証規則（validateReceiptForm）を満たす既定値
const DEFAULT_DRAFT: ReceiptDraft = {
  date: '2026-10-01',
  amount: 1000,
  payee: 'テスト用の支払先',
  category: 'supplies',
  memo: '',
}

/**
 * 所有者 ownerId の領収書を 1 件挿入し、ロックなしの Receipt を返す。
 * overrides で指定しなかった項目は、検証規則を満たす既定値（固定の日付・金額・支払先・費目、メモは空）で補う。
 */
export function createTestReceipt(
  db: AppDatabase,
  ownerId: UserId,
  overrides?: Partial<ReceiptDraft>,
): Receipt {
  return db.transaction(() =>
    insertReceipt(db, ownerId, { ...DEFAULT_DRAFT, ...overrides }),
  )
}

/** 既存の領収書の項目を patch で上書きし、更新後の Receipt を返す。所有者は変えない。存在しない ID なら Error を投げる。 */
export function updateTestReceipt(
  db: AppDatabase,
  id: ReceiptId,
  patch: Partial<ReceiptDraft>,
): Receipt {
  return db.transaction(() => {
    const { date, amount, payee, category, memo } = requireReceipt(db, id)
    // 所有者は updateReceiptRow が更新しない（patch に混ざっていても保存されない）
    return updateReceiptRow(db, id, {
      date,
      amount,
      payee,
      category,
      memo,
      ...patch,
    })
  })
}

/** 領収書を削除する。存在しない ID なら Error を投げる。ロック中なら外部キー（RESTRICT）違反の Error になる。 */
export function deleteTestReceipt(db: AppDatabase, id: ReceiptId): void {
  db.transaction(() => {
    requireReceipt(db, id)
    deleteReceiptRow(db, id)
  })
}

function requireReceipt(db: AppDatabase, id: ReceiptId): Receipt {
  const receipt = findReceiptById(db, id)
  if (!receipt) {
    throw new Error(`領収書 ${id} が存在しません`)
  }
  return receipt
}
