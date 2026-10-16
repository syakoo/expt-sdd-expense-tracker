import { createFileRoute, notFound } from '@tanstack/react-router'
import { getMyReceipt } from '@/receipts'
import { ReceiptNotFound } from '@/receipts/ui'
import { EditReceiptView } from '@/routes/_app/receipts/-components/edit-receipt-view'

export const Route = createFileRoute('/_app/receipts/$receiptId/edit')({
  loader: async ({ params }) => {
    const result = await getMyReceipt({ data: { receiptId: params.receiptId } })
    // 存在しない ID と他人の領収書は区別されない（6.3, 6.4）
    if (result.status === 'not-found') throw notFound()
    return result
  },
  notFoundComponent: NotFoundPage,
  component: EditReceiptPage,
})

function NotFoundPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <ReceiptNotFound />
    </div>
  )
}

function EditReceiptPage() {
  const result = Route.useLoaderData()
  return <EditReceiptView result={result} />
}
