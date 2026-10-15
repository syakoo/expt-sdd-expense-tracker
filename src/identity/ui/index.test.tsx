import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import type { User, UserId } from '@/identity/types'
import { CurrentUserIndicator, UserSelectList } from '@/identity/ui'

// サーバー描画（ハイドレーション前）の HTML を得る。Link と useRouter のためにメモリ上のルーターで包む
async function renderInRouter(node: ReactNode): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

const HANAKO: User = {
  id: 'user-01' as UserId,
  displayName: '佐藤 花子',
  roles: ['worker'],
}
const NAOKI: User = {
  id: 'user-05' as UserId,
  displayName: '伊藤 直樹',
  roles: ['worker', 'approver'],
}

describe('CurrentUserIndicator', () => {
  it('選択済みなら「現在のユーザー」領域に表示名とロールラベル、切替リンクを出す', async () => {
    const html = await renderInRouter(
      <CurrentUserIndicator
        currentUser={{ status: 'selected', user: NAOKI }}
      />,
    )
    expect(html).toMatch(/<section[^>]*aria-label="現在のユーザー"/)
    expect(html).toContain('現在のユーザー：伊藤 直樹（作業者・承認者）')
    expect(html).toMatch(
      /<a[^>]*href="\/select-user"[^>]*>ユーザーを切り替える<\/a>/,
    )
    expect(html).not.toContain('ユーザー未選択')
  })

  it('未選択なら「ユーザー未選択」と切替リンクを出す', async () => {
    const html = await renderInRouter(
      <CurrentUserIndicator currentUser={{ status: 'none' }} />,
    )
    expect(html).toMatch(/<section[^>]*aria-label="現在のユーザー"/)
    expect(html).toContain('ユーザー未選択')
    expect(html).toMatch(
      /<a[^>]*href="\/select-user"[^>]*>ユーザーを切り替える<\/a>/,
    )
  })
})

describe('UserSelectList', () => {
  it('全ユーザーを表示名とロールラベル付きでリスト表示し、各項目に選択ボタンを置く', async () => {
    const html = await renderInRouter(
      <UserSelectList users={[HANAKO, NAOKI]} currentUserId={undefined} />,
    )
    expect(html).toMatch(/<ul[\s>]/)
    expect(html.match(/<li[\s>]/g)).toHaveLength(2)
    expect(html).toContain('佐藤 花子')
    expect(html).toContain('作業者・承認者')
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*aria-label="佐藤 花子 を選択"/,
    )
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*aria-label="伊藤 直樹 を選択"/,
    )
    expect(html).not.toContain('選択中')
  })

  it('現在ユーザーの項目にだけ「選択中」と表示する', async () => {
    const html = await renderInRouter(
      <UserSelectList users={[HANAKO, NAOKI]} currentUserId={NAOKI.id} />,
    )
    expect(html.match(/選択中/g)).toHaveLength(1)
    const naokiItem = html.slice(html.indexOf('伊藤 直樹'))
    expect(naokiItem).toContain('選択中')
  })

  it('認証情報の入力欄を置かない', async () => {
    const html = await renderInRouter(
      <UserSelectList users={[HANAKO, NAOKI]} currentUserId={undefined} />,
    )
    expect(html).not.toMatch(/<input|<textarea|<form/)
  })

  it('ハイドレーション前はすべてのボタンを無効にする', async () => {
    const html = await renderInRouter(
      <UserSelectList users={[HANAKO, NAOKI]} currentUserId={undefined} />,
    )
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) expect(button).toMatch(/\sdisabled=""/)
  })
})
