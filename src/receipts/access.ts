import type { User } from '@/identity'

/** 作業者ロールを持つユーザーだけが領収書を管理できる。 */
export function canManageReceipts(user: Pick<User, 'roles'>): boolean {
  return user.roles.includes('worker')
}
