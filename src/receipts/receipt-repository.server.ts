import { desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '@/db/client.server'
import type { UserId } from '@/identity'
import { receiptLocks, receipts } from './schema'
import type { Receipt, ReceiptDraft, ReceiptId } from './types'

// SQL の唯一の所在。書き込みは呼び出し側のトランザクションの中で呼ばれる前提で、自分では開始しない

function queryReceipts(db: AppDatabase, where: SQL): Receipt[] {
  return db
    .select({
      id: receipts.id,
      ownerId: receipts.ownerId,
      date: receipts.date,
      amount: receipts.amount,
      payee: receipts.payee,
      category: receipts.category,
      memo: receipts.memo,
      locked: isNotNull(receiptLocks.receiptId).mapWith(Boolean),
    })
    .from(receipts)
    .leftJoin(receiptLocks, eq(receiptLocks.receiptId, receipts.id))
    .where(where)
    .orderBy(desc(receipts.date), desc(receipts.createdAt), desc(receipts.id))
    .all()
}

/** 所有者の領収書を、日付の降順 → 作成日時の降順 → ID の降順で返す。 */
export function findReceiptsByOwner(
  db: AppDatabase,
  ownerId: UserId,
): readonly Receipt[] {
  return queryReceipts(db, eq(receipts.ownerId, ownerId))
}

/** ID で 1 件返す。所有者で絞らない。未検証の文字列を受け取る。 */
export function findReceiptById(
  db: AppDatabase,
  id: string,
): Receipt | undefined {
  return queryReceipts(db, eq(receipts.id, id as ReceiptId))[0]
}

/**
 * 指定した ID のうち存在するものを、引数の順序で返す。重複した ID は 1 件にまとめる。
 * 未検証の文字列を受け取る。存在しない・形式が不正な ID は結果に含めない。
 */
export function findReceiptsByIds(
  db: AppDatabase,
  ids: readonly string[],
): readonly Receipt[] {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const byId = new Map(
    queryReceipts(db, inArray(receipts.id, unique as ReceiptId[])).map((r) => [
      r.id as string,
      r,
    ]),
  )
  return unique.flatMap((id) => byId.get(id) ?? [])
}

/** 新しい ID（crypto.randomUUID()）と作成・更新日時を付けて挿入する。ロックなしで返す。 */
export function insertReceipt(
  db: AppDatabase,
  ownerId: UserId,
  draft: ReceiptDraft,
): Receipt {
  const id = crypto.randomUUID() as ReceiptId
  const fields = pickDraft(draft)
  const now = Date.now()
  db.insert(receipts)
    .values({ id, ownerId, ...fields, createdAt: now, updatedAt: now })
    .run()
  return { id, ownerId, ...fields, locked: false }
}

/** 項目と更新日時だけを更新する。owner_id は更新しない。存在しない ID なら Error を投げる。 */
export function updateReceiptRow(
  db: AppDatabase,
  id: ReceiptId,
  draft: ReceiptDraft,
): Receipt {
  const result = db
    .update(receipts)
    .set({ ...pickDraft(draft), updatedAt: Date.now() })
    .where(eq(receipts.id, id))
    .run()
  const updated = result.changes === 0 ? undefined : findReceiptById(db, id)
  if (!updated) {
    throw new Error(`領収書 ${id} が存在しないため更新できません`)
  }
  return updated
}

/** 行を削除する。ロック中なら外部キー（RESTRICT）違反の Error になる。 */
export function deleteReceiptRow(db: AppDatabase, id: ReceiptId): void {
  db.delete(receipts).where(eq(receipts.id, id)).run()
}

/** ロックを付ける。既にロック中の ID は変えない。存在しない ID があれば Error を投げる（外部キー違反）。 */
export function insertLocks(db: AppDatabase, ids: readonly ReceiptId[]): void {
  if (ids.length === 0) return
  const lockedAt = Date.now()
  db.insert(receiptLocks)
    .values([...new Set(ids)].map((receiptId) => ({ receiptId, lockedAt })))
    .onConflictDoNothing({ target: receiptLocks.receiptId })
    .run()
}

/** ロックを外す。ロックされていない ID は無視する。 */
export function deleteLocks(db: AppDatabase, ids: readonly ReceiptId[]): void {
  if (ids.length === 0) return
  db.delete(receiptLocks)
    .where(inArray(receiptLocks.receiptId, [...ids]))
    .run()
}

// 保存する項目だけを取り出す（draft に余分なプロパティがあっても列や戻り値に混ぜない）
function pickDraft(draft: ReceiptDraft): ReceiptDraft {
  const { date, amount, payee, category, memo } = draft
  return { date, amount, payee, category, memo }
}
