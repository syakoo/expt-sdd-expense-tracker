import { describe, expect, it } from 'vitest'
import { parseRoleInput, parseSelectUserInput } from './validation'

describe('parseRoleInput', () => {
  it.each(['worker', 'approver'] as const)(
    'ロール %s を受け付けて返す',
    (role) => {
      expect(parseRoleInput({ role })).toEqual({ role })
    },
  )

  it.each([
    ['未知のロール', { role: 'admin' }],
    ['大文字違い', { role: 'Worker' }],
    ['空文字', { role: '' }],
    ['文字列でない値', { role: 1 }],
    ['role がない', {}],
    ['null', null],
    ['undefined', undefined],
    ['文字列そのもの', 'worker'],
  ])('%s を拒否する', (_label, input) => {
    expect(() => parseRoleInput(input)).toThrow(Error)
  })

  it('余分なプロパティを含めずに返す', () => {
    expect(parseRoleInput({ role: 'worker', extra: 1 })).toStrictEqual({
      role: 'worker',
    })
  })
})

describe('parseSelectUserInput', () => {
  it('空でない文字列の userId を受け付けて返す（存在確認はしない）', () => {
    expect(parseSelectUserInput({ userId: 'no-such-user' })).toStrictEqual({
      userId: 'no-such-user',
    })
  })

  it.each([
    ['空文字', { userId: '' }],
    ['数値', { userId: 1 }],
    ['null の userId', { userId: null }],
    ['配列', { userId: ['user-01'] }],
    ['userId がない', {}],
    ['null', null],
    ['undefined', undefined],
    ['文字列そのもの', 'user-01'],
  ])('%s を拒否する', (_label, input) => {
    expect(() => parseSelectUserInput(input)).toThrow(Error)
  })

  it('余分なプロパティを含めずに返す', () => {
    expect(
      parseSelectUserInput({ userId: 'user-01', extra: true }),
    ).toStrictEqual({ userId: 'user-01' })
  })
})
