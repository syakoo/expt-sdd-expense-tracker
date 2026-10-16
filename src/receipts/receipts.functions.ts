import { createServerFn } from '@tanstack/react-start'
import { getDb } from '@/db/client.server'
import { requireCurrentUser } from '@/identity'
import {
  createOwnReceipt,
  deleteOwnReceipt,
  getOwnReceipt,
  listOwnReceipts,
  updateOwnReceipt,
} from './receipt-service.server'
import type {
  CreateReceiptResult,
  DeleteReceiptResult,
  GetMyReceiptResult,
  ListMyReceiptsResult,
  UpdateReceiptResult,
} from './types'
import {
  parseReceiptFormInput,
  parseReceiptIdInput,
  parseUpdateReceiptInput,
} from './validation'

// 画面から呼ぶ Server Function。各ハンドラは入力の形を検証し、先頭で現在ユーザーを要求して
// （未選択なら /select-user へのリダイレクトを投げる）、判断はサービスにそのまま任せる。
// データの保護はここで行い、画面の表示制御だけに頼らない。

/** 現在ユーザーの領収書の一覧（日付の降順）。 */
export const listMyReceipts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ListMyReceiptsResult> => {
    const user = await requireCurrentUser()
    return listOwnReceipts(getDb(), user)
  },
)

/** 現在ユーザーの領収書を 1 件返す。存在しない ID と他人の領収書は区別せず not-found。 */
export const getMyReceipt = createServerFn({ method: 'GET' })
  .validator(parseReceiptIdInput)
  .handler(async ({ data }): Promise<GetMyReceiptResult> => {
    const user = await requireCurrentUser()
    return getOwnReceipt(getDb(), user, data.receiptId)
  })

/** 現在ユーザーを所有者として領収書を登録する。 */
export const createReceipt = createServerFn({ method: 'POST' })
  .validator(parseReceiptFormInput)
  .handler(async ({ data }): Promise<CreateReceiptResult> => {
    const user = await requireCurrentUser()
    return createOwnReceipt(getDb(), user, data)
  })

/** 現在ユーザーの領収書を更新する。ロック中なら入力の誤りより先に locked。 */
export const updateReceipt = createServerFn({ method: 'POST' })
  .validator(parseUpdateReceiptInput)
  .handler(async ({ data }): Promise<UpdateReceiptResult> => {
    const user = await requireCurrentUser()
    return updateOwnReceipt(getDb(), user, data.receiptId, data.form)
  })

/** 現在ユーザーの領収書を削除する。ロック中なら locked。 */
export const deleteReceipt = createServerFn({ method: 'POST' })
  .validator(parseReceiptIdInput)
  .handler(async ({ data }): Promise<DeleteReceiptResult> => {
    const user = await requireCurrentUser()
    return deleteOwnReceipt(getDb(), user, data.receiptId)
  })
