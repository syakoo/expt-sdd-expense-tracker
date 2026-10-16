import { useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode, Ref } from 'react'
import { flushSync } from 'react-dom'
import { Link, useHydrated, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  createReceipt,
  RECEIPT_CATEGORIES,
  RECEIPT_CATEGORY_LABELS,
  updateReceipt,
} from '@/receipts'
import type {
  CreateReceiptResult,
  Receipt,
  ReceiptField,
  ReceiptFieldErrors,
  ReceiptFormInput,
  UpdateReceiptResult,
} from '@/receipts'
import { LINK_CLASS_NAME } from './link-style'
import {
  SAVE_FAILED_MESSAGE,
  toReceiptFormOutcome,
} from './receipt-form-outcome'

interface ReceiptFormProps {
  readonly mode: 'create' | 'edit'
  /** edit のときだけ。初期値と送信先の ID */
  readonly receipt?: Receipt
}

const EMPTY_VALUES: ReceiptFormInput = {
  date: '',
  amount: '',
  payee: '',
  category: '',
  memo: '',
}

function initialValuesOf(receipt: Receipt | undefined): ReceiptFormInput {
  if (receipt === undefined) return EMPTY_VALUES
  return {
    date: receipt.date,
    amount: String(receipt.amount),
    payee: receipt.payee,
    category: receipt.category,
    memo: receipt.memo,
  }
}

/**
 * 領収書の登録・編集で共通のフォーム。入力値は文字列のまま持ち、検証はサーバーに任せる。
 * 送信結果の扱いは design の System Flows の Key Decisions のとおり（`toReceiptFormOutcome`）
 */
export function ReceiptForm({ mode, receipt }: ReceiptFormProps) {
  const router = useRouter()
  const hydrated = useHydrated()
  const submitCreate = useServerFn(createReceipt)
  const submitUpdate = useServerFn(updateReceipt)
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState(() => initialValuesOf(receipt))
  const [errors, setErrors] = useState<ReceiptFieldErrors>({})
  const [alert, setAlert] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  function send(): Promise<CreateReceiptResult | UpdateReceiptResult> {
    if (mode === 'edit' && receipt !== undefined) {
      return submitUpdate({ data: { receiptId: receipt.id, form: values } })
    }
    return submitCreate({ data: values })
  }

  async function handleSubmit() {
    // 同じ警告が続いても読み上げられるよう、前の警告を消してから送る
    setAlert(undefined)
    setSubmitting(true)
    try {
      let result: CreateReceiptResult | UpdateReceiptResult | undefined
      try {
        result = await send()
      } catch {
        // 保存先の障害など。成功したかのように見せず、遷移しない（8.5）
        setErrors({})
        setAlert(SAVE_FAILED_MESSAGE)
        return
      }
      // 現在ユーザーが未選択ならリダイレクトされ、useServerFn は結果を返さない
      if (result === undefined) return

      const outcome = toReceiptFormOutcome(result)
      switch (outcome.kind) {
        case 'saved':
          await router.invalidate()
          await router.navigate({ to: '/receipts' })
          return
        case 'invalid': {
          // aria-invalid を付けてからフォーカスを移すため、描画を確定させる
          flushSync(() => {
            setErrors(outcome.errors)
            setAlert(outcome.alert)
          })
          const target =
            outcome.focus === undefined
              ? null
              : formRef.current?.elements.namedItem(outcome.focus)
          if (target instanceof HTMLElement) target.focus()
          return
        }
        case 'rejected':
          setErrors({})
          setAlert(outcome.alert)
          if (outcome.reload) await router.invalidate()
          return
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ReceiptFormView
      ref={formRef}
      mode={mode}
      values={values}
      errors={errors}
      alert={alert}
      submitDisabled={!hydrated || submitting}
      onChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }))
      }}
      onSubmit={() => void handleSubmit()}
    />
  )
}

interface ReceiptFormViewProps {
  readonly ref?: Ref<HTMLFormElement>
  readonly mode: 'create' | 'edit'
  readonly values: ReceiptFormInput
  readonly errors: ReceiptFieldErrors
  /** フォームの先頭に role="alert" で出す警告 */
  readonly alert: string | undefined
  readonly submitDisabled: boolean
  readonly onChange: (field: ReceiptField, value: string) => void
  readonly onSubmit: () => void
}

const CONTROL_CLASS_NAME =
  'rounded border border-gray-400 px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 aria-invalid:border-red-700'

/** ReceiptForm の表示。状態を持たず、テストから任意の状態で描画できる（モジュールの外には公開しない） */
export function ReceiptFormView({
  ref,
  mode,
  values,
  errors,
  alert,
  submitDisabled,
  onChange,
  onSubmit,
}: ReceiptFormViewProps) {
  const idPrefix = useId()
  const controlId = (field: ReceiptField) => `${idPrefix}-${field}`
  const errorId = (field: ReceiptField) => `${idPrefix}-${field}-error`

  /** 入力欄に付ける共通の属性。誤りがあればエラー文に関連付ける */
  function controlProps(field: ReceiptField) {
    const invalid = errors[field] !== undefined
    return {
      id: controlId(field),
      name: field,
      value: values[field],
      'aria-invalid': invalid ? true : undefined,
      'aria-describedby': invalid ? errorId(field) : undefined,
      className: CONTROL_CLASS_NAME,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      ref={ref}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {alert !== undefined && (
        <p
          role="alert"
          className="rounded border border-red-700 bg-red-50 px-3 py-2 text-red-800"
        >
          {alert}
        </p>
      )}

      <Field
        label="日付"
        htmlFor={controlId('date')}
        required
        error={errors.date}
        errorId={errorId('date')}
      >
        <input
          type="date"
          aria-required="true"
          {...controlProps('date')}
          onChange={(event) => onChange('date', event.target.value)}
        />
      </Field>

      <Field
        label="金額"
        htmlFor={controlId('amount')}
        required
        error={errors.amount}
        errorId={errorId('amount')}
      >
        <span className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            aria-required="true"
            {...controlProps('amount')}
            onChange={(event) => onChange('amount', event.target.value)}
          />
          <span>円</span>
        </span>
      </Field>

      <Field
        label="支払先"
        htmlFor={controlId('payee')}
        required
        error={errors.payee}
        errorId={errorId('payee')}
      >
        <input
          type="text"
          aria-required="true"
          {...controlProps('payee')}
          onChange={(event) => onChange('payee', event.target.value)}
        />
      </Field>

      <Field
        label="費目"
        htmlFor={controlId('category')}
        required
        error={errors.category}
        errorId={errorId('category')}
      >
        <select
          aria-required="true"
          {...controlProps('category')}
          onChange={(event) => onChange('category', event.target.value)}
        >
          <option value="">選択してください</option>
          {RECEIPT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {RECEIPT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="メモ"
        htmlFor={controlId('memo')}
        required={false}
        error={errors.memo}
        errorId={errorId('memo')}
      >
        <textarea
          rows={3}
          {...controlProps('memo')}
          onChange={(event) => onChange('memo', event.target.value)}
        />
      </Field>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          {mode === 'create' ? '登録する' : '更新する'}
        </button>
        <Link to="/receipts" className={LINK_CLASS_NAME}>
          キャンセル
        </Link>
      </div>
    </form>
  )
}

interface FieldProps {
  readonly label: string
  readonly htmlFor: string
  readonly required: boolean
  readonly error: string | undefined
  readonly errorId: string
  readonly children: ReactNode
}

/** ラベル・必須／任意の印・入力欄・エラー文のまとまり */
function Field({
  label,
  htmlFor,
  required,
  error,
  errorId,
  children,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
        {required ? (
          // 支援技術には aria-required で伝わるため、見た目の印だけにする
          <span
            aria-hidden="true"
            className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-900"
          >
            必須
          </span>
        ) : (
          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800">
            任意
          </span>
        )}
      </label>
      {children}
      {error !== undefined && (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}
