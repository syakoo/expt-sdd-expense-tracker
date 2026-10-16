import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import { userRoles, users } from '@/identity/schema'
import { SEED_USERS, seedUsers } from '@/identity/seed.server'
import type { UserId } from '@/identity/types'
import { findUserById, findUsers } from '@/identity/user-repository.server'

let db: AppDatabase

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.$client.close()
})

const ids = (list: readonly { id: string }[]) => list.map((u) => u.id)

describe('findUsers', () => {
  beforeEach(() => {
    seedUsers(db)
  })

  it('全ユーザーを表示名・ロール付きで id 昇順に返す', () => {
    expect(findUsers(db)).toEqual(
      SEED_USERS.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        roles: u.roles,
      })),
    )
  })

  it('承認者一覧は承認者ロールを持つユーザーだけを返し、両ロール保持者は全ロール付きで含まれる', () => {
    const approvers = findUsers(db, { role: 'approver' })
    expect(ids(approvers)).toEqual(['user-03', 'user-04', 'user-05'])
    expect(approvers.every((u) => u.roles.includes('approver'))).toBe(true)
    expect(approvers.find((u) => u.id === 'user-05')?.roles).toEqual([
      'worker',
      'approver',
    ])
  })

  it('作業者一覧にも両ロール保持者が全ロール付きで含まれる', () => {
    const workers = findUsers(db, { role: 'worker' })
    expect(ids(workers)).toEqual(['user-01', 'user-02', 'user-05'])
    expect(workers.find((u) => u.id === 'user-05')?.roles).toEqual([
      'worker',
      'approver',
    ])
  })
})

describe('返却順', () => {
  it('挿入順を入れ替えても users.id 昇順・ロールは定義順で返る', () => {
    const reversed = [...SEED_USERS].reverse()
    for (const user of reversed) {
      db.insert(users)
        .values({ id: user.id, displayName: user.displayName })
        .run()
      db.insert(userRoles)
        .values(
          [...user.roles].reverse().map((role) => ({ userId: user.id, role })),
        )
        .run()
    }

    const expected = SEED_USERS.map((u) => u.id)
    expect(ids(findUsers(db))).toEqual(expected)
    expect(ids(findUsers(db, { role: 'approver' }))).toEqual([
      'user-03',
      'user-04',
      'user-05',
    ])
    expect(findUsers(db).find((u) => u.id === 'user-05')?.roles).toEqual([
      'worker',
      'approver',
    ])
    expect(findUserById(db, 'user-05')?.roles).toEqual(['worker', 'approver'])
  })
})

describe('findUserById', () => {
  beforeEach(() => {
    seedUsers(db)
  })

  it('存在する ID なら全ロール付きの User を返す', () => {
    expect(findUserById(db, 'user-05')).toEqual({
      id: 'user-05',
      displayName: '伊藤 直樹',
      roles: ['worker', 'approver'],
    })
  })

  it('存在しない ID なら undefined を返す', () => {
    expect(findUserById(db, 'user-99')).toBeUndefined()
    expect(findUserById(db, '')).toBeUndefined()
  })
})

describe('スキーマ', () => {
  it('worker / approver 以外のロールの挿入を拒否する', () => {
    db.insert(users)
      .values({ id: 'user-x' as UserId, displayName: 'X' })
      .run()
    expect(() =>
      db.$client
        .prepare(
          "INSERT INTO user_roles (user_id, role) VALUES ('user-x', 'admin')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/)
    expect(
      db.all(sql`SELECT * FROM user_roles WHERE user_id = 'user-x'`),
    ).toEqual([])
  })
})

describe('ロールなしユーザー', () => {
  beforeEach(() => {
    seedUsers(db)
    db.insert(users)
      .values({ id: 'user-00' as UserId, displayName: 'ロールなし' })
      .run()
  })

  it('findUsers はエラーにする', () => {
    expect(() => findUsers(db)).toThrow(/user-00/)
  })

  it('findUserById はエラーにする', () => {
    expect(() => findUserById(db, 'user-00')).toThrow(/user-00/)
  })
})
