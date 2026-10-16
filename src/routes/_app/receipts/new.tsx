import { createFileRoute } from '@tanstack/react-router'

// 仮の画面。中身は 4.1 で登録フォームに置き換える
export const Route = createFileRoute('/_app/receipts/new')({
  component: NewReceiptPage,
})

function NewReceiptPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">領収書を登録</h1>
    </div>
  )
}
