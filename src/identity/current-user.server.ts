import type { AppDatabase } from '@/db/client.server'
import {
  readCurrentUserId,
  writeCurrentUserId,
} from './current-user-store.server'
import type { CurrentUserResult, SelectUserResult } from './types'
import { findUserById } from './user-repository.server'

/** 保持 ID を読み、DB と照合する。未保持または DB に存在しない ID なら { status: 'none' }。 */
export function resolveCurrentUser(db: AppDatabase): CurrentUserResult {
  const id = readCurrentUserId()
  if (id === undefined) return { status: 'none' }
  const user = findUserById(db, id)
  return user ? { status: 'selected', user } : { status: 'none' }
}

/** userId が DB に存在すれば保持して { status: 'selected' }。存在しなければ保持せずに { status: 'unknown-user' }。 */
export function selectCurrentUser(
  db: AppDatabase,
  userId: string,
): SelectUserResult {
  const user = findUserById(db, userId)
  if (!user) return { status: 'unknown-user' }
  // DB で検証済みの ID だけを保持する
  writeCurrentUserId(user.id)
  return { status: 'selected', user }
}
