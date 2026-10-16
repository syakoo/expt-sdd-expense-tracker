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
import { EditReceiptView } from '@/routes/_app/receipts/-components/edit-receipt-view'

async function renderInRouter(node: ReactNode): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

const RECEIPT: Receipt = {
  id: 'receipt-01' as ReceiptId,
  ownerId: 'user-01' as UserId,
  date: '2026-10-16',
  amount: 1234,
  payee: '東京駅前タクシー',
  category: 'transportation',
  memo: '顧客訪問',
  locked: false,
}

describe('EditReceiptView', () => {
  it('forbidden なら作業者ロールが必要である旨だけを出す', async () => {
    const html = await renderInRouter(
      <EditReceiptView result={{ status: 'forbidden' }} />,
    )
    expect(html).toContain('領収書を管理するには作業者ロールが必要です')
    expect(html).not.toContain('領収書を編集')
    expect(html).not.toContain('<form')
  })

  it('ロックされていなければ見出し「領収書を編集」、編集フォーム、削除の確認領域を出す', async () => {
    const html = await renderInRouter(
      <EditReceiptView result={{ status: 'ok', receipt: RECEIPT }} />,
    )
    expect(html).toMatch(/<h1[^>]*>領収書を編集<\/h1>/)
    expect(html).toContain('<form')
    expect(html).toContain('東京駅前タクシー')
    expect(html).toContain('更新する')
    expect(html).toContain('この領収書を削除')
    expect(html).not.toContain('ロック中')
  })

  it('ロック中なら見出し「領収書」、ロックの通知、読み取り専用の表示、一覧へのリンクだけを出す', async () => {
    const html = await renderInRouter(
      <EditReceiptView
        result={{ status: 'ok', receipt: { ...RECEIPT, locked: true } }}
      />,
    )
    expect(html).toMatch(/<h1[^>]*>領収書<\/h1>/)
    expect(html).toContain('この領収書はロック中のため、編集・削除できません')
    expect(html).toContain('<dl')
    expect(html).toContain('東京駅前タクシー')
    expect(html).toMatch(/<a[^>]*href="\/receipts"[^>]*>領収書一覧に戻る<\/a>/)
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('領収書を編集')
  })
})
