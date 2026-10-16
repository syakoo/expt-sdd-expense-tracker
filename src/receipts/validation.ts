import {
  RECEIPT_CATEGORIES,
  type ReceiptCategory,
  type ReceiptDraft,
  type ReceiptField,
  type ReceiptFieldErrors,
  type ReceiptFormInput,
} from './types'

export const RECEIPT_LIMITS = {
  amountMin: 1,
  amountMax: 9_999_999,
  payeeMaxLength: 100,
  memoMaxLength: 500,
} as const

const RECEIPT_FIELDS = [
  'date',
  'amount',
  'payee',
  'category',
  'memo',
] as const satisfies readonly ReceiptField[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/** 5 項目がすべて文字列であれば返し、そうでなければ Error を投げる（Server Function の validator）。 */
export function parseReceiptFormInput(input: unknown): ReceiptFormInput {
  if (
    !isRecord(input) ||
    !RECEIPT_FIELDS.every((field) => typeof input[field] === 'string')
  ) {
    throw new Error(
      `${RECEIPT_FIELDS.join(' / ')} はすべて文字列で指定してください`,
    )
  }
  return {
    date: input.date as string,
    amount: input.amount as string,
    payee: input.payee as string,
    category: input.category as string,
    memo: input.memo as string,
  }
}

/** { receiptId } が空でない文字列であれば返し、そうでなければ Error を投げる。存在確認はしない。 */
export function parseReceiptIdInput(input: unknown): {
  readonly receiptId: string
} {
  if (!isRecord(input) || !isNonEmptyString(input.receiptId)) {
    throw new Error('receiptId は空でない文字列で指定してください')
  }
  return { receiptId: input.receiptId }
}

/** { receiptId, form } の形を確かめる（updateReceipt の validator）。 */
export function parseUpdateReceiptInput(input: unknown): {
  readonly receiptId: string
  readonly form: ReceiptFormInput
} {
  const { receiptId } = parseReceiptIdInput(input)
  return {
    receiptId,
    form: parseReceiptFormInput((input as Record<string, unknown>).form),
  }
}

export type ReceiptValidationResult =
  | { readonly ok: true; readonly draft: ReceiptDraft }
  | { readonly ok: false; readonly errors: ReceiptFieldErrors }

type FieldResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

function valid<T>(value: T): FieldResult<T> {
  return { ok: true, value }
}

function invalid(message: string): FieldResult<never> {
  return { ok: false, message }
}

/** サロゲートペアを 1 文字として数える。 */
function countCodePoints(value: string): number {
  return [...value].length
}

const DATE_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

function isExistingDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (match === null) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(0)
  // setUTCFullYear は 0〜99 年を 1900 年代に読み替えない
  date.setUTCFullYear(year, month - 1, day)
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function validateDate(raw: string): FieldResult<string> {
  const value = raw.trim()
  if (value === '') return invalid('日付を入力してください')
  if (!isExistingDate(value)) return invalid('実在する日付を入力してください')
  return valid(value)
}

const AMOUNT_MAX_DIGITS = String(RECEIPT_LIMITS.amountMax).length

function validateAmount(raw: string): FieldResult<number> {
  const value = raw.trim()
  if (value === '') return invalid('金額を入力してください')
  if (!/^[0-9]+$/.test(value)) {
    return invalid('金額は半角数字の整数で入力してください')
  }
  const outOfRange = invalid(
    '金額は 1 円以上 9,999,999 円以下で入力してください',
  )
  // 桁数の大きい入力は数値に変換すると精度が落ちるため、変換する前に桁数で範囲外と判定する
  const significant = value.replace(/^0+/, '')
  if (significant.length > AMOUNT_MAX_DIGITS) return outOfRange
  const amount = Number(significant)
  if (amount < RECEIPT_LIMITS.amountMin || amount > RECEIPT_LIMITS.amountMax) {
    return outOfRange
  }
  return valid(amount)
}

function validatePayee(raw: string): FieldResult<string> {
  const value = raw.trim()
  if (value === '') return invalid('支払先を入力してください')
  if (countCodePoints(value) > RECEIPT_LIMITS.payeeMaxLength) {
    return invalid('支払先は 100 文字以内で入力してください')
  }
  return valid(value)
}

function isReceiptCategory(value: string): value is ReceiptCategory {
  return (RECEIPT_CATEGORIES as readonly string[]).includes(value)
}

function validateCategory(raw: string): FieldResult<ReceiptCategory> {
  if (!isReceiptCategory(raw)) return invalid('費目を選択してください')
  return valid(raw)
}

function validateMemo(raw: string): FieldResult<string> {
  const value = raw.trim()
  if (countCodePoints(value) > RECEIPT_LIMITS.memoMaxLength) {
    return invalid('メモは 500 文字以内で入力してください')
  }
  return valid(value)
}

/** 項目ごとの規則で検証する。すべての項目を検証し、誤りのある項目すべてのメッセージを返す。 */
export function validateReceiptForm(
  form: ReceiptFormInput,
): ReceiptValidationResult {
  const date = validateDate(form.date)
  const amount = validateAmount(form.amount)
  const payee = validatePayee(form.payee)
  const category = validateCategory(form.category)
  const memo = validateMemo(form.memo)

  if (date.ok && amount.ok && payee.ok && category.ok && memo.ok) {
    return {
      ok: true,
      draft: {
        date: date.value,
        amount: amount.value,
        payee: payee.value,
        category: category.value,
        memo: memo.value,
      },
    }
  }

  const results = { date, amount, payee, category, memo }
  const errors: Partial<Record<ReceiptField, string>> = {}
  for (const field of RECEIPT_FIELDS) {
    const result = results[field]
    if (!result.ok) errors[field] = result.message
  }
  return { ok: false, errors }
}
