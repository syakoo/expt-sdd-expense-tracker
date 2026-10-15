import { asc, eq, inArray, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '@/db/client.server'
import { userRoles, users } from './schema'
import { ROLES, type Role, type User, type UserId } from './types'

interface UserRoleRow {
  readonly id: UserId
  readonly displayName: string
  readonly role: Role | null
}

function queryUsers(db: AppDatabase, where: SQL | undefined): User[] {
  const rows: UserRoleRow[] = db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(where)
    .orderBy(asc(users.id))
    .all()

  const grouped = new Map<UserId, { displayName: string; roles: Role[] }>()
  for (const row of rows) {
    let entry = grouped.get(row.id)
    if (!entry) {
      entry = { displayName: row.displayName, roles: [] }
      grouped.set(row.id, entry)
    }
    if (row.role !== null) entry.roles.push(row.role)
  }

  return Array.from(grouped, ([id, { displayName, roles }]) => {
    const [first, ...rest] = ROLES.filter((role) => roles.includes(role))
    if (first === undefined) {
      throw new Error(`ユーザー ${id} がロールを持っていません（データ破損）`)
    }
    return { id, displayName, roles: [first, ...rest] }
  })
}

/** 全ユーザー、または指定ロールを持つユーザーを全ロール付きで users.id 昇順に返す。 */
export function findUsers(
  db: AppDatabase,
  filter?: { readonly role?: Role },
): readonly User[] {
  const role = filter?.role
  const where =
    role === undefined
      ? undefined
      : inArray(
          users.id,
          db
            .select({ userId: userRoles.userId })
            .from(userRoles)
            .where(eq(userRoles.role, role)),
        )
  return queryUsers(db, where)
}

/** 未検証の文字列 ID でユーザーを 1 件取得する。存在しなければ undefined。 */
export function findUserById(db: AppDatabase, id: string): User | undefined {
  return queryUsers(db, eq(users.id, id as UserId))[0]
}
