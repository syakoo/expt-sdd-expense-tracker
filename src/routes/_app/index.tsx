import { createFileRoute } from '@tanstack/react-router'
import { TopPageView } from './-components/top-page-view'

export const Route = createFileRoute('/_app/')({
  component: TopPage,
})

function TopPage() {
  const { user } = Route.useRouteContext()
  return <TopPageView user={user} />
}
