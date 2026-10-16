import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { RouteError, RouteNotFound } from '@/routes/-components/route-error'

// Link のためにメモリ上のルーターで包んでサーバー描画する
async function renderInRouter(node: ReactNode): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

describe('RouteError', () => {
  it('「データを読み込めませんでした」を alert として表示する', async () => {
    const html = await renderInRouter(
      <RouteError error={new Error('boom')} reset={() => {}} />,
    )
    expect(html).toMatch(/role="alert"/)
    expect(html).toMatch(/<h1[^>]*>データを読み込めませんでした<\/h1>/)
  })

  // Vitest では import.meta.env.DEV が true のため、開発時の経路のみを検証する
  it('開発時はエラーメッセージをテキストとして表示する', async () => {
    expect(import.meta.env.DEV).toBe(true)
    const html = await renderInRouter(
      <RouteError
        error={
          new Error(
            'DB ファイル /tmp/x.db を開けません。npm run db:setup を実行してください <b>',
          )
        }
        reset={() => {}}
      />,
    )
    expect(html).toContain(
      'DB ファイル /tmp/x.db を開けません。npm run db:setup を実行してください &lt;b&gt;',
    )
    expect(html).not.toContain('<b>')
  })

  it('開発時は Error 以外の値も文字列にして表示する', async () => {
    const html = await renderInRouter(
      <RouteError error="接続できません" reset={() => {}} />,
    )
    expect(html).toContain('接続できません')
  })
})

describe('RouteNotFound', () => {
  it('「ページが見つかりません」とトップへのリンクを表示する', async () => {
    const html = await renderInRouter(<RouteNotFound />)
    expect(html).toMatch(/<h1[^>]*>ページが見つかりません<\/h1>/)
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>トップへ戻る<\/a>/)
  })
})
