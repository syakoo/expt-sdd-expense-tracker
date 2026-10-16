import { Link } from '@tanstack/react-router'
import { ROLE_LABELS } from '@/identity'
import type { User } from '@/identity'
import { canManageReceipts } from '@/receipts'

export function TopPageView({ user }: { user: User }) {
  const roleLabels = user.roles.map((role) => ROLE_LABELS[role]).join('・')
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-2xl font-bold">ようこそ、{user.displayName} さん</h1>
      <p>
        {user.displayName} さんのロール：{roleLabels}
      </p>
      {canManageReceipts(user) && (
        <p>
          <Link
            to="/receipts"
            className="rounded text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            領収書を管理する
          </Link>
        </p>
      )}
    </div>
  )
}
