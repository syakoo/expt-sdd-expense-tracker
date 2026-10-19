import type { AppDatabase } from '@/db/client.server'
import type { UserId } from '@/identity'
import {
  deleteLocks,
  findReceiptsByIds as findReceiptsByIdsRow,
  findReceiptsByOwner,
  insertLocks,
} from './receipt-repository.server'
import type { Receipt, ReceiptId } from './types'

// 下流（expense-claim-workflow）のサーバーコードが使ってよい唯一の入口。
// 権限の確認はしない（呼び出し側が判断する）。ロックの判断も下流に従う（要件 7.5）。

/**
 * 指定 ID の領収書を引数の順で返す。所有者で絞らない。
 * 未検証の文字列を受け取る（下流は申請の入力から届いた ID をそのまま渡してよい）。
 * 存在しない ID・形式が不正な ID は結果に含めず、Error も投げない。重複した ID は 1 件にまとめる。
 */
export function findReceiptsByIds(
  db: AppDatabase,
  ids: readonly string[],
): readonly Receipt[] {
  return findReceiptsByIdsRow(db, ids)
}

/** 所有者の領収書を、一覧画面と同じ順序で返す。 */
export function listReceiptsByOwner(
  db: AppDatabase,
  ownerId: UserId,
): readonly Receipt[] {
  return findReceiptsByOwner(db, ownerId)
}

/**
 * 指定した領収書をロック中にする。冪等。存在しない ID が含まれれば Error を投げ、何もロックしない。
 * 呼び出し側のトランザクションの中で呼ばれた場合は、その入れ子（SAVEPOINT）になる。
 */
export function lockReceipts(db: AppDatabase, ids: readonly ReceiptId[]): void {
  db.transaction(() => insertLocks(db, ids))
}

/**
 * 指定した領収書のロックを外す。冪等。ロックされていない・存在しない ID は無視する。
 * 呼び出し側のトランザクションの中で呼ばれた場合は、その入れ子（SAVEPOINT）になる。
 */
export function unlockReceipts(
  db: AppDatabase,
  ids: readonly ReceiptId[],
): void {
  db.transaction(() => deleteLocks(db, ids))
}
