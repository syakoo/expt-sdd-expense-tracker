import { createFileRoute } from '@tanstack/react-router'

// 仮の画面。中身は 4.2 で編集・削除の画面に置き換える
export const Route = createFileRoute('/_app/receipts/$receiptId/edit')({
  component: EditReceiptPage,
})

function EditReceiptPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">領収書を編集</h1>
    </div>
  )
}
