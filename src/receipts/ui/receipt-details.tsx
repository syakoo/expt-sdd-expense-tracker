import { RECEIPT_CATEGORY_LABELS } from '@/receipts'
import type { Receipt } from '@/receipts'
import { formatReceiptDate, formatYen } from './format'

interface ReceiptDetailsProps {
  readonly receipt: Receipt
}

/** 領収書の 5 項目を読み取り専用で表示する。更新・削除の操作は置かない */
export function ReceiptDetails({ receipt }: ReceiptDetailsProps) {
  const items: ReadonlyArray<readonly [term: string, value: string]> = [
    ['日付', formatReceiptDate(receipt.date)],
    ['金額', formatYen(receipt.amount)],
    ['支払先', receipt.payee],
    ['費目', RECEIPT_CATEGORY_LABELS[receipt.category]],
    ['メモ', receipt.memo === '' ? 'なし' : receipt.memo],
  ]
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
      {items.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="font-medium text-gray-700">{term}</dt>
          <dd className="whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
