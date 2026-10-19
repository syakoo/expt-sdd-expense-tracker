import type { UserId } from '@/identity'

export type ReceiptId = string & { readonly __brand: 'ReceiptId' }

export const RECEIPT_CATEGORIES = [
  'transportation',
  'lodging',
  'meeting',
  'entertainment',
  'supplies',
  'communication',
  'other',
] as const
export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number]

export const RECEIPT_CATEGORY_LABELS: Readonly<
  Record<ReceiptCategory, string>
> = {
  transportation: '交通費',
  lodging: '宿泊費',
  meeting: '会議費',
  entertainment: '交際費',
  supplies: '消耗品費',
  communication: '通信費',
  other: 'その他',
}

export interface Receipt {
  readonly id: ReceiptId
  readonly ownerId: UserId
  /** YYYY-MM-DD（実在する日付） */
  readonly date: string
  /** 日本円。1 以上 9,999,999 以下の整数 */
  readonly amount: number
  readonly payee: string
  readonly category: ReceiptCategory
  /** 未入力は空文字 */
  readonly memo: string
  /** ロック中なら true。理由（申請の状態）は持たない */
  readonly locked: boolean
}

/** フォームから届く生の値。すべて文字列 */
export interface ReceiptFormInput {
  readonly date: string
  readonly amount: string
  readonly payee: string
  readonly category: string
  readonly memo: string
}

/** 検証済みの項目（保存する値） */
export interface ReceiptDraft {
  readonly date: string
  readonly amount: number
  readonly payee: string
  readonly category: ReceiptCategory
  readonly memo: string
}

export type ReceiptField = keyof ReceiptFormInput
export type ReceiptFieldErrors = Readonly<Partial<Record<ReceiptField, string>>>

export type ListMyReceiptsResult =
  | { readonly status: 'ok'; readonly receipts: readonly Receipt[] }
  | { readonly status: 'forbidden' }

export type GetMyReceiptResult =
  | { readonly status: 'ok'; readonly receipt: Receipt }
  | { readonly status: 'not-found' }
  | { readonly status: 'forbidden' }

export type CreateReceiptResult =
  | { readonly status: 'created'; readonly receipt: Receipt }
  | { readonly status: 'invalid'; readonly errors: ReceiptFieldErrors }
  | { readonly status: 'forbidden' }

export type UpdateReceiptResult =
  | { readonly status: 'updated'; readonly receipt: Receipt }
  | { readonly status: 'invalid'; readonly errors: ReceiptFieldErrors }
  | { readonly status: 'locked' }
  | { readonly status: 'not-found' }
  | { readonly status: 'forbidden' }

export type DeleteReceiptResult =
  | { readonly status: 'deleted' }
  | { readonly status: 'locked' }
  | { readonly status: 'not-found' }
  | { readonly status: 'forbidden' }
