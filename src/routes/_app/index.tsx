import { createFileRoute } from '@tanstack/react-router'
import { ROLE_LABELS } from '@/identity'

export const Route = createFileRoute('/_app/')({
  component: TopPage,
})

function TopPage() {
  const { user } = Route.useRouteContext()
  const roleLabels = user.roles.map((role) => ROLE_LABELS[role]).join('・')
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-2xl font-bold">ようこそ、{user.displayName} さん</h1>
      <p>
        {user.displayName} さんのロール：{roleLabels}
      </p>
    </div>
  )
}
