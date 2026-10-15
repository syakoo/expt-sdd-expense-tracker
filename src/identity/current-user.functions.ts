import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getDb } from '@/db/client.server'
import { resolveCurrentUser } from './current-user.server'
import type { CurrentUserResult, User } from './types'

/** 現在ユーザーを返す。未保持または DB に存在しない ID なら { status: 'none' }。 */
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  (): CurrentUserResult => resolveCurrentUser(getDb()),
)

/** 現在ユーザーを返す。未選択ならユーザー選択画面（/select-user）へのリダイレクトを投げ、戻らない。 */
export const requireCurrentUser = createServerFn({ method: 'GET' }).handler(
  (): User => {
    const result = resolveCurrentUser(getDb())
    if (result.status === 'none') {
      throw redirect({ to: '/select-user' })
    }
    return result.user
  },
)
