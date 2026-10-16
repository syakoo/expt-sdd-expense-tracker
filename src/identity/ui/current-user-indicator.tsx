import { Link } from '@tanstack/react-router'
import type { CurrentUserResult } from '@/identity/types'
import { formatRoleLabels } from './role-labels'

export function CurrentUserIndicator({
  currentUser,
}: {
  currentUser: CurrentUserResult
}) {
  return (
    <section
      aria-label="現在のユーザー"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
    >
      <p>
        {currentUser.status === 'selected'
          ? `現在のユーザー：${currentUser.user.displayName}（${formatRoleLabels(currentUser.user.roles)}）`
          : 'ユーザー未選択'}
      </p>
      <Link
        to="/select-user"
        className="rounded text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        ユーザーを切り替える
      </Link>
    </section>
  )
}
