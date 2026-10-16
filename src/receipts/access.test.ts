import { describe, expect, it } from 'vitest'
import type { Role } from '@/identity'
import { canManageReceipts } from './access'
import { RECEIPT_CATEGORIES, RECEIPT_CATEGORY_LABELS } from './types'

describe('canManageReceipts', () => {
  it.each<{ roles: readonly [Role, ...Role[]]; expected: boolean }>([
    { roles: ['worker'], expected: true },
    { roles: ['approver'], expected: false },
    { roles: ['worker', 'approver'], expected: true },
  ])('roles=$roles のとき $expected を返す', ({ roles, expected }) => {
    expect(canManageReceipts({ roles })).toBe(expected)
  })
})

describe('RECEIPT_CATEGORIES', () => {
  it('7 種類の費目をこの順で持つ', () => {
    expect(RECEIPT_CATEGORIES).toEqual([
      'transportation',
      'lodging',
      'meeting',
      'entertainment',
      'supplies',
      'communication',
      'other',
    ])
  })

  it('費目の順に日本語ラベルが対応する', () => {
    expect(RECEIPT_CATEGORIES.map((c) => RECEIPT_CATEGORY_LABELS[c])).toEqual([
      '交通費',
      '宿泊費',
      '会議費',
      '交際費',
      '消耗品費',
      '通信費',
      'その他',
    ])
  })
})
