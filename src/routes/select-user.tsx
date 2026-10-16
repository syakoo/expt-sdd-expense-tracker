import { createFileRoute } from '@tanstack/react-router'
import { listAllUsers, UserSelectList } from '@/identity/ui'

export const Route = createFileRoute('/select-user')({
  loader: () => listAllUsers(),
  component: SelectUserPage,
})

function SelectUserPage() {
  const users = Route.useLoaderData()
  const { currentUser } = Route.useRouteContext()
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">ユーザーを選択</h1>
      <UserSelectList
        users={users}
        currentUserId={
          currentUser.status === 'selected' ? currentUser.user.id : undefined
        }
      />
    </div>
  )
}
