import { Link } from '@tanstack/react-router'
import { RECEIPT_CATEGORY_LABELS } from '@/receipts'
import type { Receipt } from '@/receipts'
import { formatReceiptDate, formatYen } from './format'
import { LINK_CLASS_NAME } from './link-style'

const COLUMNS = ['日付', '金額', '支払先', '費目', '状態', '操作'] as const

interface ReceiptListProps {
  readonly receipts: readonly Receipt[]
}

/**
 * 自分の領収書を受け取った順に表で表示する。0 件なら空の表示と登録画面への導線を出す。
 * 並び順はサーバーが決めるため、ここでは並べ替えない
 */
export function ReceiptList({ receipts }: ReceiptListProps) {
  if (receipts.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p>登録された領収書はありません</p>
        <p>
          <Link to="/receipts/new" className={LINK_CLASS_NAME}>
            領収書を登録する
          </Link>
        </p>
      </div>
    )
  }

  return (
    <table className="w-full border-collapse text-left">
      <caption className="mb-2 text-left font-bold">自分の領収書</caption>
      <thead>
        <tr className="border-b border-gray-300">
          {COLUMNS.map((column) => (
            <th key={column} scope="col" className="px-2 py-1 font-medium">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {receipts.map((receipt) => (
          <ReceiptRow key={receipt.id} receipt={receipt} />
        ))}
      </tbody>
    </table>
  )
}

function ReceiptRow({ receipt }: { readonly receipt: Receipt }) {
  const date = formatReceiptDate(receipt.date)
  return (
    <tr className="border-b border-gray-200">
      <td className="px-2 py-1 whitespace-nowrap">{date}</td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        {formatYen(receipt.amount)}
      </td>
      <td className="px-2 py-1">{receipt.payee}</td>
      <td className="px-2 py-1">{RECEIPT_CATEGORY_LABELS[receipt.category]}</td>
      <td className="px-2 py-1">{receipt.locked ? 'ロック中' : ''}</td>
      <td className="px-2 py-1">
        {/* 見える文字「開く」を名前の末尾に含め、行ごとに区別できる名前にする */}
        <Link
          to="/receipts/$receiptId/edit"
          params={{ receiptId: receipt.id }}
          aria-label={`${date} ${receipt.payee} の領収書を開く`}
          className={LINK_CLASS_NAME}
        >
          開く
        </Link>
      </td>
    </tr>
  )
}
