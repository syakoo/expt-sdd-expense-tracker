import type { ErrorComponentProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <section role="alert" className="space-y-2 p-4">
      <h1 className="text-xl font-bold">データを読み込めませんでした</h1>
      {import.meta.env.DEV && (
        <pre className="text-sm whitespace-pre-wrap text-red-700">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
    </section>
  )
}

export function RouteNotFound() {
  return (
    <section className="space-y-2 p-4">
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <Link
        to="/"
        className="rounded text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        トップへ戻る
      </Link>
    </section>
  )
}
