import type {
  CreateReceiptResult,
  DeleteReceiptResult,
  ReceiptField,
  ReceiptFieldErrors,
  UpdateReceiptResult,
} from '@/receipts'

/** 入力欄の並び順。最初の誤りの欄を決めるのに使う */
export const RECEIPT_FIELDS: readonly ReceiptField[] = [
  'date',
  'amount',
  'payee',
  'category',
  'memo',
]

/** 送信が例外で終わったとき（保存先の障害など）の警告文 */
export const SAVE_FAILED_MESSAGE =
  '保存できませんでした。時間をおいてもう一度お試しください'

/** 削除の送信が例外で終わったとき（保存先の障害など）の警告文 */
export const DELETE_FAILED_MESSAGE =
  '削除できませんでした。時間をおいてもう一度お試しください'

/** 受け付けられなかった。警告を出し、reload なら読み直して表示を切り替える */
export interface RejectedOutcome {
  readonly kind: 'rejected'
  readonly alert: string
  readonly reload: boolean
}

/** 送信結果を受けて画面がとる振る舞い */
export type ReceiptFormOutcome =
  /** 保存できた。データを読み直して一覧へ遷移する */
  | { readonly kind: 'saved' }
  /** 入力の誤り。入力を保持したまま項目ごとのエラーを出し、最初の誤りの欄へフォーカスする */
  | {
      readonly kind: 'invalid'
      readonly errors: ReceiptFieldErrors
      readonly alert: string
      readonly focus: ReceiptField | undefined
    }
  | RejectedOutcome

/** 削除の送信結果を受けて画面がとる振る舞い */
export type DeleteReceiptOutcome =
  /** 削除できた。データを読み直して一覧へ遷移する */
  { readonly kind: 'deleted' } | RejectedOutcome

/** 登録・更新の結果を、画面の振る舞いに対応づける（design の System Flows の Key Decisions） */
export function toReceiptFormOutcome(
  result: CreateReceiptResult | UpdateReceiptResult,
): ReceiptFormOutcome {
  switch (result.status) {
    case 'created':
    case 'updated':
      return { kind: 'saved' }
    case 'invalid':
      return {
        kind: 'invalid',
        errors: result.errors,
        alert: '入力内容を確認してください',
        focus: RECEIPT_FIELDS.find(
          (field) => result.errors[field] !== undefined,
        ),
      }
    case 'locked':
    case 'not-found':
    case 'forbidden':
      return toRejectedOutcome(result.status)
  }
}

/** 削除の結果を、画面の振る舞いに対応づける。拒否の扱いは登録・更新と同じ */
export function toDeleteReceiptOutcome(
  result: DeleteReceiptResult,
): DeleteReceiptOutcome {
  switch (result.status) {
    case 'deleted':
      return { kind: 'deleted' }
    case 'locked':
    case 'not-found':
    case 'forbidden':
      return toRejectedOutcome(result.status)
  }
}

function toRejectedOutcome(
  status: 'locked' | 'not-found' | 'forbidden',
): RejectedOutcome {
  switch (status) {
    case 'locked':
      // 編集画面を読み取り専用の表示に切り替えるため、読み直す
      return {
        kind: 'rejected',
        alert: 'この領収書はロック中のため、編集・削除できません',
        reload: true,
      }
    case 'not-found':
      return {
        kind: 'rejected',
        alert: '領収書が見つかりません',
        reload: false,
      }
    case 'forbidden':
      return {
        kind: 'rejected',
        alert: '領収書を管理するには作業者ロールが必要です',
        reload: false,
      }
  }
}
