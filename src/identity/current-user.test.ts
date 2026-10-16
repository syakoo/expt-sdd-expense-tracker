import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '@/db/client.server'
import { createTestDatabase } from '@/db/test-utils.server'
import {
  readCurrentUserId,
  writeCurrentUserId,
} from '@/identity/current-user-store.server'
import {
  resolveCurrentUser,
  selectCurrentUser,
} from '@/identity/current-user.server'
import { SEED_USERS, seedUsers } from '@/identity/seed.server'

vi.mock('@/identity/current-user-store.server', () => ({
  readCurrentUserId: vi.fn(),
  writeCurrentUserId: vi.fn(),
}))

const readMock = vi.mocked(readCurrentUserId)
const writeMock = vi.mocked(writeCurrentUserId)

const seeded = SEED_USERS[0]
const expectedUser = {
  id: seeded.id,
  displayName: seeded.displayName,
  roles: seeded.roles,
}

let db: AppDatabase

beforeEach(() => {
  vi.resetAllMocks()
  db = createTestDatabase()
  seedUsers(db)
})

afterEach(() => {
  if (db.$client.open) db.$client.close()
})

describe('resolveCurrentUser', () => {
  it('保持 ID がなければ未選択を返す', () => {
    readMock.mockReturnValue(undefined)
    expect(resolveCurrentUser(db)).toEqual({ status: 'none' })
  })

  it('DB に存在しない保持 ID なら未選択を返す', () => {
    readMock.mockReturnValue('unknown')
    expect(resolveCurrentUser(db)).toEqual({ status: 'none' })
  })

  it('有効な保持 ID なら選択済みのユーザーを返す', () => {
    readMock.mockReturnValue(seeded.id)
    expect(resolveCurrentUser(db)).toEqual({
      status: 'selected',
      user: expectedUser,
    })
  })

  it('DB エラーは未選択にせず伝播させる', () => {
    readMock.mockReturnValue(seeded.id)
    db.$client.close()
    expect(() => resolveCurrentUser(db)).toThrow()
  })
})

describe('selectCurrentUser', () => {
  it('既知の ID なら保持して選択済みを返す', () => {
    expect(selectCurrentUser(db, seeded.id)).toEqual({
      status: 'selected',
      user: expectedUser,
    })
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(writeMock).toHaveBeenCalledWith(seeded.id)
  })

  it('未知の ID なら保持せずに unknown-user を返す', () => {
    expect(selectCurrentUser(db, 'unknown')).toEqual({ status: 'unknown-user' })
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('DB エラーは伝播させ、保持しない', () => {
    db.$client.close()
    expect(() => selectCurrentUser(db, seeded.id)).toThrow()
    expect(writeMock).not.toHaveBeenCalled()
  })
})
