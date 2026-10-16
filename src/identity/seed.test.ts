import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import { SEED_USERS, seedUsers } from '@/identity/seed.server'

interface UserRow {
  id: string
  display_name: string
}

interface RoleRow {
  user_id: string
  role: string
}

function readUsers(db: AppDatabase): UserRow[] {
  return db.all<UserRow>(sql`SELECT id, display_name FROM users ORDER BY id`)
}

function readRoles(db: AppDatabase): RoleRow[] {
  return db.all<RoleRow>(
    sql`SELECT user_id, role FROM user_roles ORDER BY user_id, role`,
  )
}

function expectedRoleRows(): RoleRow[] {
  return SEED_USERS.flatMap((user) =>
    user.roles.map((role) => ({ user_id: user.id, role })),
  ).sort(
    (a, b) =>
      a.user_id.localeCompare(b.user_id) || a.role.localeCompare(b.role),
  )
}

describe('SEED_USERS', () => {
  it('design の表どおりの 5 名を固定 ID で定義する', () => {
    expect(SEED_USERS).toEqual([
      { id: 'user-01', displayName: '佐藤 花子', roles: ['worker'] },
      { id: 'user-02', displayName: '鈴木 一郎', roles: ['worker'] },
      { id: 'user-03', displayName: '田中 美咲', roles: ['approver'] },
      { id: 'user-04', displayName: '高橋 健', roles: ['approver'] },
      {
        id: 'user-05',
        displayName: '伊藤 直樹',
        roles: ['worker', 'approver'],
      },
    ])
  })

  it('作業者 2 名以上・承認者 2 名以上・両方 1 名以上を含み、全員が 1 つ以上のロールを持つ', () => {
    const workers = SEED_USERS.filter((u) => u.roles.includes('worker'))
    const approvers = SEED_USERS.filter((u) => u.roles.includes('approver'))
    const both = SEED_USERS.filter(
      (u) => u.roles.includes('worker') && u.roles.includes('approver'),
    )

    expect(workers.length).toBeGreaterThanOrEqual(2)
    expect(approvers.length).toBeGreaterThanOrEqual(2)
    expect(both.length).toBeGreaterThanOrEqual(1)
    for (const user of SEED_USERS) {
      expect(user.roles.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('ID が一意である', () => {
    const ids = SEED_USERS.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('seedUsers', () => {
  const opened: AppDatabase[] = []

  function open(): AppDatabase {
    const db = createTestDatabase()
    opened.push(db)
    return db
  }

  afterEach(() => {
    for (const db of opened.splice(0)) db.$client.close()
  })

  it('定義どおりのユーザーとロールを投入する', () => {
    const db = open()

    seedUsers(db)

    expect(readUsers(db).map((u) => u.id)).toEqual([
      'user-01',
      'user-02',
      'user-03',
      'user-04',
      'user-05',
    ])
    expect(readUsers(db)).toEqual(
      SEED_USERS.map((u) => ({ id: u.id, display_name: u.displayName })),
    )
    expect(readRoles(db)).toEqual(expectedRoleRows())
  })

  it('2 回投入してもユーザー数・ロール数・ID が変わらない', () => {
    const db = open()

    seedUsers(db)
    const usersAfterFirst = readUsers(db)
    const rolesAfterFirst = readRoles(db)
    seedUsers(db)

    expect(usersAfterFirst).toHaveLength(5)
    expect(rolesAfterFirst).toHaveLength(6)
    expect(readUsers(db)).toEqual(usersAfterFirst)
    expect(readRoles(db)).toEqual(rolesAfterFirst)
  })

  it('再投入で、変更された表示名とロールを定義どおりに戻す', () => {
    const db = open()
    seedUsers(db)

    db.run(
      sql`UPDATE users SET display_name = '改名 太郎' WHERE id = 'user-01'`,
    )
    db.run(sql`DELETE FROM user_roles WHERE user_id = 'user-05'`)
    db.run(
      sql`INSERT INTO user_roles (user_id, role) VALUES ('user-03', 'worker')`,
    )
    seedUsers(db)

    expect(readUsers(db)).toEqual(
      SEED_USERS.map((u) => ({ id: u.id, display_name: u.displayName })),
    )
    expect(readRoles(db)).toEqual(expectedRoleRows())
  })

  it('シードにないユーザーを削除しない', () => {
    const db = open()
    db.run(
      sql`INSERT INTO users (id, display_name) VALUES ('user-extra', '追加 次郎')`,
    )
    db.run(
      sql`INSERT INTO user_roles (user_id, role) VALUES ('user-extra', 'worker')`,
    )

    seedUsers(db)
    seedUsers(db)

    expect(readUsers(db)).toContainEqual({
      id: 'user-extra',
      display_name: '追加 次郎',
    })
    expect(readRoles(db)).toContainEqual({
      user_id: 'user-extra',
      role: 'worker',
    })
    expect(readUsers(db)).toHaveLength(6)
  })
})
