import { ROLES, type Role } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRole(value: unknown): value is Role {
  return (ROLES as readonly unknown[]).includes(value)
}

/** { role } が ROLES のいずれかであれば返し、そうでなければ Error を投げる。 */
export function parseRoleInput(input: unknown): { readonly role: Role } {
  if (!isRecord(input) || !isRole(input.role)) {
    throw new Error(`role は ${ROLES.join(' / ')} のいずれかで指定してください`)
  }
  return { role: input.role }
}

/** { userId } が空でない文字列であれば返し、そうでなければ Error を投げる。存在確認はしない。 */
export function parseSelectUserInput(input: unknown): {
  readonly userId: string
} {
  if (
    !isRecord(input) ||
    typeof input.userId !== 'string' ||
    input.userId === ''
  ) {
    throw new Error('userId は空でない文字列で指定してください')
  }
  return { userId: input.userId }
}
