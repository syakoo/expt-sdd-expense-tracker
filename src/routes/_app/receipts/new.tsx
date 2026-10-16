import { createFileRoute } from '@tanstack/react-router'
import { canManageReceipts } from '@/receipts'
import { ReceiptForm, WorkerRoleRequired } from '@/receipts/ui'

export const Route = createFileRoute('/_app/receipts/new')({
  component: NewReceiptPage,
})

function NewReceiptPage() {
  const { user } = Route.useRouteContext()

  if (!canManageReceipts(user)) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <WorkerRoleRequired />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">領収書を登録</h1>
      <ReceiptForm mode="create" />
    </div>
  )
}
