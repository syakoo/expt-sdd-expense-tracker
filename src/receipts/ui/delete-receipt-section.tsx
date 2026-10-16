import { useId, useRef, useState } from 'react'
import type { Ref } from 'react'
import { flushSync } from 'react-dom'
import { useHydrated, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { deleteReceipt } from '@/receipts'
import type { DeleteReceiptResult, ReceiptId } from '@/receipts'
import {
  DELETE_FAILED_MESSAGE,
  toDeleteReceiptOutcome,
} from './receipt-form-outcome'

interface DeleteReceiptSectionProps {
  readonly receiptId: ReceiptId
}

/**
 * 削除の確認領域。確認されるまで削除を送らない（5.1, 5.3）。
 * 送信結果の扱いは ReceiptForm と同じ（design の System Flows の Key Decisions、`toDeleteReceiptOutcome`）
 */
export function DeleteReceiptSection({ receiptId }: DeleteReceiptSectionProps) {
  const router = useRouter()
  const hydrated = useHydrated()
  const submitDelete = useServerFn(deleteReceipt)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [open, setOpen] = useState(false)
  const [alert, setAlert] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  function handleOpen() {
    // 確認領域を描画してから見出しにフォーカスを移す
    flushSync(() => setOpen(true))
    headingRef.current?.focus()
  }

  function handleCancel() {
    // 確認領域を閉じて「この領収書を削除」ボタンを描画してから、フォーカスを戻す
    flushSync(() => {
      setOpen(false)
      setAlert(undefined)
    })
    triggerRef.current?.focus()
  }

  async function handleConfirm() {
    // 同じ警告が続いても読み上げられるよう、前の警告を消してから送る
    setAlert(undefined)
    setSubmitting(true)
    try {
      let result: DeleteReceiptResult | undefined
      try {
        result = await submitDelete({ data: { receiptId } })
      } catch {
        // 保存先の障害など。成功したかのように見せず、遷移しない（8.5）
        setAlert(DELETE_FAILED_MESSAGE)
        return
      }
      // 現在ユーザーが未選択ならリダイレクトされ、useServerFn は結果を返さない
      if (result === undefined) return

      const outcome = toDeleteReceiptOutcome(result)
      switch (outcome.kind) {
        case 'deleted':
          await router.invalidate()
          await router.navigate({ to: '/receipts' })
          return
        case 'rejected':
          setAlert(outcome.alert)
          // ロック中なら読み直して、編集画面を読み取り専用の表示に切り替える（7.3）
          if (outcome.reload) await router.invalidate()
          return
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DeleteReceiptSectionView
      triggerRef={triggerRef}
      headingRef={headingRef}
      open={open}
      alert={alert}
      busy={!hydrated || submitting}
      onOpen={handleOpen}
      onConfirm={() => void handleConfirm()}
      onCancel={handleCancel}
    />
  )
}

interface DeleteReceiptSectionViewProps {
  readonly triggerRef?: Ref<HTMLButtonElement>
  readonly headingRef?: Ref<HTMLHeadingElement>
  /** 確認領域を開いているか */
  readonly open: boolean
  /** role="alert" で出す警告 */
  readonly alert: string | undefined
  /** ハイドレーション前・送信中。ボタンをすべて無効にする（8.3） */
  readonly busy: boolean
  readonly onOpen: () => void
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

const BUTTON_FOCUS_CLASS_NAME =
  'rounded px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed'

/** DeleteReceiptSection の表示。状態を持たず、テストから任意の状態で描画できる（モジュールの外には公開しない） */
export function DeleteReceiptSectionView({
  triggerRef,
  headingRef,
  open,
  alert,
  busy,
  onOpen,
  onConfirm,
  onCancel,
}: DeleteReceiptSectionViewProps) {
  const headingId = useId()

  return (
    <div className="flex flex-col gap-3">
      {alert !== undefined && (
        <p
          role="alert"
          className="rounded border border-red-700 bg-red-50 px-3 py-2 text-red-800"
        >
          {alert}
        </p>
      )}

      {open ? (
        <div
          role="group"
          aria-labelledby={headingId}
          className="flex flex-col gap-3 rounded border border-red-700 p-4"
        >
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="rounded font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            この領収書を削除しますか？
          </h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={`${BUTTON_FOCUS_CLASS_NAME} bg-red-700 text-white hover:bg-red-800 disabled:bg-gray-600`}
            >
              削除する
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className={`${BUTTON_FOCUS_CLASS_NAME} border border-gray-600 text-gray-900 hover:bg-gray-100 disabled:text-gray-600`}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            ref={triggerRef}
            type="button"
            disabled={busy}
            onClick={onOpen}
            className={`${BUTTON_FOCUS_CLASS_NAME} border border-red-700 text-red-800 hover:bg-red-50 disabled:border-gray-600 disabled:text-gray-600`}
          >
            この領収書を削除
          </button>
        </div>
      )}
    </div>
  )
}
