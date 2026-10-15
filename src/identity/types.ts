export const ROLES = ['worker', 'approver'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  worker: '作業者',
  approver: '承認者',
}

export type UserId = string & { readonly __brand: 'UserId' }

export interface User {
  readonly id: UserId
  readonly displayName: string
  /** 1 つ以上。順序は ROLES の順（worker → approver）。 */
  readonly roles: readonly [Role, ...Role[]]
}

export type CurrentUserResult =
  | { readonly status: 'selected'; readonly user: User }
  | { readonly status: 'none' }

/** selectUser の結果（identity 内部とアプリシェルで使う）。 */
export type SelectUserResult =
  | { readonly status: 'selected'; readonly user: User }
  | { readonly status: 'unknown-user' }
