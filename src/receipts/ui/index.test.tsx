import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import type { UserId } from '@/identity'
import type { Receipt, ReceiptId } from '@/receipts'
import {
  formatReceiptDate,
  formatYen,
  LockedNotice,
  ReceiptDetails,
  ReceiptNotFound,
  WorkerRoleRequired,
} from '@/receipts/ui'

// サーバー描画（ハイドレーション前）の HTML を得る。Link と useRouter のためにメモリ上のルーターで包む
async function renderInRouter(node: ReactNode): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

const LOCKED_RECEIPT: Receipt = {
  id: 'receipt-01' as ReceiptId,
  ownerId: 'user-01' as UserId,
  date: '2026-10-16',
  amount: 1234,
  payee: '東京駅前タクシー',
  category: 'transportation',
  memo: '顧客訪問',
  locked: true,
}

describe('formatYen', () => {
  it('桁区切りと「円」を付ける', () => {
    expect(formatYen(1234)).toBe('1,234円')
    expect(formatYen(1)).toBe('1円')
    expect(formatYen(9999999)).toBe('9,999,999円')
  })
})

describe('formatReceiptDate', () => {
  it('YYYY-MM-DD を YYYY/MM/DD にする', () => {
    expect(formatReceiptDate('2026-10-16')).toBe('2026/10/16')
  })
})

describe('WorkerRoleRequired', () => {
  it('作業者ロールが必要であることと、ユーザー切替画面へのリンクを出す', async () => {
    const html = await renderInRouter(<WorkerRoleRequired />)
    expect(html).toContain('領収書を管理するには作業者ロールが必要です')
    expect(html).toMatch(/<a[^>]*href="\/select-user"[^>]*>[^<]+<\/a>/)
  })
})

describe('ReceiptNotFound', () => {
  it('領収書が見つからないことと、一覧へのリンクを出す', async () => {
    const html = await renderInRouter(<ReceiptNotFound />)
    expect(html).toContain('領収書が見つかりません')
    expect(html).toMatch(/<a[^>]*href="\/receipts"[^>]*>[^<]+<\/a>/)
  })
})

describe('LockedNotice', () => {
  it('ロック中のため編集・削除できないことを role="status" で出す', async () => {
    const html = await renderInRouter(<LockedNotice />)
    expect(html).toMatch(
      /<[a-z]+[^>]*role="status"[^>]*>この領収書はロック中のため、編集・削除できません</,
    )
  })
})

describe('ReceiptDetails', () => {
  it('5 項目を読み取り専用の dl で表示する', async () => {
    const html = await renderInRouter(
      <ReceiptDetails receipt={LOCKED_RECEIPT} />,
    )
    expect(html).toMatch(/<dl[\s>]/)
    for (const term of ['日付', '金額', '支払先', '費目', 'メモ']) {
      expect(html).toMatch(new RegExp(`<dt[^>]*>${term}</dt>`))
    }
    expect(html).toMatch(/<dd[^>]*>2026\/10\/16<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>1,234円<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>東京駅前タクシー<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>交通費<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>顧客訪問<\/dd>/)
  })

  it('メモが空なら「なし」と表示する', async () => {
    const html = await renderInRouter(
      <ReceiptDetails receipt={{ ...LOCKED_RECEIPT, memo: '' }} />,
    )
    expect(html).toMatch(/<dt[^>]*>メモ<\/dt><dd[^>]*>なし<\/dd>/)
  })

  it('ロック中の表示に更新・削除の操作（ボタン・入力欄・フォーム）を置かない', async () => {
    const html = await renderInRouter(
      <>
        <LockedNotice />
        <ReceiptDetails receipt={LOCKED_RECEIPT} />
      </>,
    )
    expect(html).not.toMatch(/<button|<input|<textarea|<select|<form/)
    expect(html).not.toContain('更新する')
    expect(html).not.toContain('削除する')
    expect(html).not.toContain('この領収書を削除')
  })
})
