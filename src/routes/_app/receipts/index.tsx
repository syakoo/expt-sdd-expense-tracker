import { createFileRoute, Link } from '@tanstack/react-router'
import { listMyReceipts } from '@/receipts'
import { ReceiptList, WorkerRoleRequired } from '@/receipts/ui'

export const Route = createFileRoute('/_app/receipts/')({
  loader: () => listMyReceipts(),
  component: ReceiptListPage,
})

function ReceiptListPage() {
  const result = Route.useLoaderData()

  if (result.status === 'forbidden') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <WorkerRoleRequired />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">領収書</h1>
      {result.receipts.length > 0 && (
        <p>
          <Link
            to="/receipts/new"
            className="rounded text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            領収書を登録する
          </Link>
        </p>
      )}
      <ReceiptList receipts={result.receipts} />
    </div>
  )
}
