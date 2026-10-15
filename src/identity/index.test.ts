import { describe, expect, it } from 'vitest'
import * as identity from '@/identity'

describe('@/identity の公開面', () => {
  it('取得口・ロール定数・ラベルだけを実行時に公開する', () => {
    expect(Object.keys(identity).sort()).toEqual([
      'ROLES',
      'ROLE_LABELS',
      'getCurrentUser',
      'listUsersByRole',
      'requireCurrentUser',
    ])
  })

  it('選択操作・全件一覧・保持層・リポジトリ・DB 接続を公開しない', () => {
    for (const name of [
      'selectUser',
      'listAllUsers',
      'readCurrentUserId',
      'writeCurrentUserId',
      'resolveCurrentUser',
      'selectCurrentUser',
      'findUsers',
      'findUserById',
      'getDb',
    ]) {
      expect(identity).not.toHaveProperty(name)
    }
  })
})
