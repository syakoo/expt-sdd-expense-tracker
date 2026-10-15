import { ROLE_LABELS } from '@/identity/types'
import type { Role } from '@/identity/types'

/** ロールを表示用のラベルにして「・」でつなぐ（例：作業者・承認者）。 */
export function formatRoleLabels(roles: readonly Role[]): string {
  return roles.map((role) => ROLE_LABELS[role]).join('・')
}
