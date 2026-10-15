import { createServerFn } from '@tanstack/react-start'
import { getDb } from '@/db/client.server'
import { selectCurrentUser } from './current-user.server'
import type { SelectUserResult } from './types'
import { parseSelectUserInput } from './validation'

/** 選ばれたユーザーを現在ユーザーにする（選択と切替で共通）。遷移は呼び出し側が結果を見て行う。 */
export const selectUser = createServerFn({ method: 'POST' })
  .validator(parseSelectUserInput)
  .handler(({ data }): SelectUserResult =>
    selectCurrentUser(getDb(), data.userId),
  )
