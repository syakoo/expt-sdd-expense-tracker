import type { ReactNode } from 'react'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { getCurrentUser } from '@/identity'
import { CurrentUserIndicator } from '@/identity/ui'
import { RouteError, RouteNotFound } from '@/routes/-components/route-error'
import stylesUrl from '@/styles.css?url'

export const Route = createRootRoute({
  beforeLoad: async () => ({ currentUser: await getCurrentUser() }),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '経費精算' },
    ],
    links: [{ rel: 'stylesheet', href: stylesUrl }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const { currentUser } = Route.useRouteContext()
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 px-4 py-3">
        <Link
          to="/"
          className="rounded text-lg font-bold hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          経費精算
        </Link>
        <CurrentUserIndicator currentUser={currentUser} />
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
