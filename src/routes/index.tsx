import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: TopPage,
})

function TopPage() {
  return (
    <h1 className="p-4 text-2xl font-bold text-blue-700">
      経費精算（仮のトップ画面）
    </h1>
  )
}
