import { useState } from 'react'
import { useHydrated, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { selectUser } from '@/identity/select-user.functions'
import type { User, UserId } from '@/identity/types'
import { formatRoleLabels } from './role-labels'

export function UserSelectList({
  users,
  currentUserId,
}: {
  users: readonly User[]
  currentUserId: UserId | undefined
}) {
  const router = useRouter()
  const hydrated = useHydrated()
  const submitSelectUser = useServerFn(selectUser)
  const [submitting, setSubmitting] = useState(false)
  const [unknownUser, setUnknownUser] = useState(false)

  async function handleSelect(userId: UserId) {
    setSubmitting(true)
    setUnknownUser(false)
    try {
      const result = await submitSelectUser({ data: { userId } })
      if (result.status === 'selected') {
        await router.invalidate()
        await router.navigate({ to: '/' })
      } else {
        setUnknownUser(true)
        await router.invalidate()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {unknownUser && (
        <p
          role="alert"
          className="rounded border border-red-700 bg-red-50 px-3 py-2 text-red-800"
        >
          選択したユーザーが見つかりません
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex items-center justify-between gap-4 rounded border border-gray-300 px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">{user.displayName}</span>
              <span className="text-sm text-gray-700">
                {formatRoleLabels(user.roles)}
              </span>
              {user.id === currentUserId && (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900">
                  選択中
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={`${user.displayName} を選択`}
              disabled={!hydrated || submitting}
              onClick={() => void handleSelect(user.id)}
              className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            >
              選択
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
