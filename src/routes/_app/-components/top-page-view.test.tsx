import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import type { User, UserId } from '@/identity'
import { TopPageView } from '@/routes/_app/-components/top-page-view'

async function renderInRouter(node: ReactNode): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

// シード（サーバー専用）と同じ形のユーザー。ロールの組み合わせごとに 1 人
function userWithRoles(...roles: User['roles']): User {
  return { id: 'user-x' as UserId, displayName: '検証 太郎', roles }
}

describe('TopPageView', () => {
  it('作業者のみのユーザーには領収書管理へのリンクを出す', async () => {
    const html = await renderInRouter(
      <TopPageView user={userWithRoles('worker')} />,
    )
    expect(html).toContain('href="/receipts"')
    expect(html).toContain('領収書を管理する')
  })

  it('作業者と承認者の両方のユーザーにはリンクを出す', async () => {
    const html = await renderInRouter(
      <TopPageView user={userWithRoles('worker', 'approver')} />,
    )
    expect(html).toContain('href="/receipts"')
  })

  it('承認者のみのユーザーにはリンクを出さない', async () => {
    const html = await renderInRouter(
      <TopPageView user={userWithRoles('approver')} />,
    )
    expect(html).not.toContain('/receipts')
    expect(html).not.toContain('領収書を管理する')
  })

  it('見出しとロールの本文は変わらない', async () => {
    const user = userWithRoles('worker', 'approver')
    const html = await renderInRouter(<TopPageView user={user} />)
    expect(html).toContain(user.displayName)
    expect(html).toContain('ロール：')
  })
})
