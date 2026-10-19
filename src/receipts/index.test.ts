import { describe, expect, it } from 'vitest'
import * as receipts from '@/receipts'

describe('@/receipts の公開面', () => {
  it('5 つの Server Function・作業者ロールの判定・費目の定数とラベルだけを実行時に公開する', () => {
    expect(Object.keys(receipts).sort()).toEqual([
      'RECEIPT_CATEGORIES',
      'RECEIPT_CATEGORY_LABELS',
      'canManageReceipts',
      'createReceipt',
      'deleteReceipt',
      'getMyReceipt',
      'listMyReceipts',
      'updateReceipt',
    ])
  })

  it('読み書きの関数・操作の判断・下流向けの関数・検証・DB 接続を公開しない', () => {
    for (const name of [
      // リポジトリ
      'findReceiptById',
      'findReceiptsByOwner',
      'insertReceipt',
      'updateReceiptRow',
      'deleteReceiptRow',
      // サービス
      'listOwnReceipts',
      'getOwnReceipt',
      'createOwnReceipt',
      'updateOwnReceipt',
      'deleteOwnReceipt',
      // 下流向け（api.server）
      'findReceiptsByIds',
      'listReceiptsByOwner',
      'lockReceipts',
      'unlockReceipts',
      // テストフィクスチャ
      'createTestReceipt',
      'updateTestReceipt',
      'deleteTestReceipt',
      // 検証（サーバーで行う）
      'RECEIPT_LIMITS',
      'validateReceiptForm',
      // DB 接続
      'getDb',
    ]) {
      expect(receipts).not.toHaveProperty(name)
    }
  })
})
