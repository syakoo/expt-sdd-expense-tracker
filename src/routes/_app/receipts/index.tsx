import { createFileRoute } from '@tanstack/react-router'

// 仮の画面。中身は 4.1 で一覧に置き換える
export const Route = createFileRoute('/_app/receipts/')({
  component: ReceiptListPage,
})

function ReceiptListPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">領収書</h1>
    </div>
  )
}
