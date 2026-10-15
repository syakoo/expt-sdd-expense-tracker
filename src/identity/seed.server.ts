import { eq } from 'drizzle-orm'
import type { AppDatabase } from '@/db/client.server'
import { userRoles, users } from './schema'
import type { Role, UserId } from './types'

export interface SeedUser {
  readonly id: UserId
  readonly displayName: string
  readonly roles: readonly [Role, ...Role[]]
}

// ID は後続 spec のテストからも参照される契約。変更は再検証トリガー
export const SEED_USERS: readonly SeedUser[] = [
  { id: 'user-01' as UserId, displayName: '佐藤 花子', roles: ['worker'] },
  { id: 'user-02' as UserId, displayName: '鈴木 一郎', roles: ['worker'] },
  { id: 'user-03' as UserId, displayName: '田中 美咲', roles: ['approver'] },
  { id: 'user-04' as UserId, displayName: '高橋 健', roles: ['approver'] },
  {
    id: 'user-05' as UserId,
    displayName: '伊藤 直樹',
    roles: ['worker', 'approver'],
  },
]

/**
 * シードユーザーを 1 トランザクションで投入する。何度実行しても同じ状態になる。
 * 各ユーザーを ID で upsert し、そのユーザーのロールを定義どおりに入れ直す。シードにないユーザーは残す。
 */
export function seedUsers(db: AppDatabase): void {
  db.transaction((tx) => {
    for (const user of SEED_USERS) {
      tx.insert(users)
        .values({ id: user.id, displayName: user.displayName })
        .onConflictDoUpdate({
          target: users.id,
          set: { displayName: user.displayName },
        })
        .run()
      tx.delete(userRoles).where(eq(userRoles.userId, user.id)).run()
      tx.insert(userRoles)
        .values(user.roles.map((role) => ({ userId: user.id, role })))
        .run()
    }
  })
}
