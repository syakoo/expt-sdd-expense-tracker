import { createServerFn } from '@tanstack/react-start'
import { getDb } from '@/db/client.server'
import type { User } from './types'
import { findUsers } from './user-repository.server'
import { parseRoleInput } from './validation'

/** 指定ロールを持つユーザーの一覧（users.id 昇順）。両ロール保持者はどちらの一覧にも含まれる。現在ユーザーを要求しない。 */
export const listUsersByRole = createServerFn({ method: 'GET' })
  .validator(parseRoleInput)
  .handler(({ data }): readonly User[] =>
    findUsers(getDb(), { role: data.role }),
  )

/** 全ユーザーの一覧（users.id 昇順）。ユーザー選択画面専用で @/identity からは公開しない。現在ユーザーを要求しない。 */
export const listAllUsers = createServerFn({ method: 'GET' }).handler(
  (): readonly User[] => findUsers(getDb()),
)
