import { sql } from 'drizzle-orm'
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { ROLES, type UserId } from './types'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$type<UserId>(),
  displayName: text('display_name').notNull(),
})

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    role: text('role', { enum: ROLES }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    check(
      'user_roles_role_check',
      sql.raw(
        `${table.role.name} IN (${ROLES.map((r) => `'${r}'`).join(', ')})`,
      ),
    ),
    index('user_roles_role_idx').on(table.role),
  ],
)
