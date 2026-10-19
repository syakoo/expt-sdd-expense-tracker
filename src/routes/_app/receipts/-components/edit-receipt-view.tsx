import { Link } from '@tanstack/react-router'
import type { GetMyReceiptResult } from '@/receipts'
import {
  DeleteReceiptSection,
  LockedNotice,
  ReceiptDetails,
  ReceiptForm,
  WorkerRoleRequired,
} from '@/receipts/ui'

interface EditReceiptViewProps {
  /** ローダーの結果。not-found はローダーが notFound() を投げるため届かない */
  readonly result: Exclude<GetMyReceiptResult, { status: 'not-found' }>
}

/** 編集画面の本体。権限なし・ロック中・編集可能の 3 通りを出し分ける（6.2, 7.2） */
export function EditReceiptView({ result }: EditReceiptViewProps) {
  if (result.status === 'forbidden') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <WorkerRoleRequired />
      </div>
    )
  }

  const { receipt } = result

  if (receipt.locked) {
    // 更新・削除の操作は置かない
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">領収書</h1>
        <LockedNotice />
        <ReceiptDetails receipt={receipt} />
        <p>
          <Link
            to="/receipts"
            className="rounded text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            領収書一覧に戻る
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">領収書を編集</h1>
      <ReceiptForm mode="edit" receipt={receipt} />
      <DeleteReceiptSection receiptId={receipt.id} />
    </div>
  )
}
