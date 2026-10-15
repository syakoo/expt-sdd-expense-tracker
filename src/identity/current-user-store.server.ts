import { getCookie, setCookie } from '@tanstack/react-start/server'
import type { UserId } from './types'

// 現在ユーザー ID の保持方法（Cookie）を知るのはこのファイルだけにする
const COOKIE_NAME = 'current_user_id'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** リクエストのコンテキスト内（Server Function のハンドラ、SSR 中の処理）で呼ぶ。未保持なら undefined。 */
export function readCurrentUserId(): string | undefined {
  return getCookie(COOKIE_NAME)
}

/** リクエストのコンテキスト内で呼ぶ。レスポンスに Set-Cookie を付ける。 */
export function writeCurrentUserId(id: UserId): void {
  setCookie(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  })
}
