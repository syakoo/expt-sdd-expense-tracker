import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type { UserId } from '@/identity'
import { users } from '@/identity/schema'
import { RECEIPT_CATEGORIES, type ReceiptId } from './types'

// 金額の範囲（検証の最後の防衛線。フォームの検証と同じ値）
const MIN_AMOUNT = 1
const MAX_AMOUNT = 9_999_999

export const receipts = sqliteTable(
  'receipts',
  {
    id: text('id').primaryKey().$type<ReceiptId>(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id)
      .$type<UserId>(),
    /** YYYY-MM-DD */
    date: text('date').notNull(),
    amount: integer('amount').notNull(),
    payee: text('payee').notNull(),
    category: text('category', { enum: RECEIPT_CATEGORIES }).notNull(),
    memo: text('memo').notNull().default(''),
    /** ミリ秒 */
    createdAt: integer('created_at').notNull(),
    /** ミリ秒 */
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    check(
      'receipts_amount_check',
      sql.raw(`${table.amount.name} BETWEEN ${MIN_AMOUNT} AND ${MAX_AMOUNT}`),
    ),
    check(
      'receipts_category_check',
      sql.raw(
        `${table.category.name} IN (${RECEIPT_CATEGORIES.map((c) => `'${c}'`).join(', ')})`,
      ),
    ),
    // 所有者ごとの一覧の並べ替え（日付降順 → 作成の新しい順）用
    index('receipts_owner_date_created_idx').on(
      table.ownerId,
      table.date,
      table.createdAt,
    ),
  ],
)

/**
 * ロックの記録。行があればロック中。下流は直接読み書きせず `@/receipts/api.server` を使う。
 * ロック中の領収書は DB 上も削除できない（ON DELETE RESTRICT）。
 */
export const receiptLocks = sqliteTable('receipt_locks', {
  receiptId: text('receipt_id')
    .primaryKey()
    .references(() => receipts.id, { onDelete: 'restrict' })
    .$type<ReceiptId>(),
  /** ミリ秒 */
  lockedAt: integer('locked_at').notNull(),
})
