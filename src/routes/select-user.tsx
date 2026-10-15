import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/select-user')({
  component: SelectUserPage,
})

function SelectUserPage() {
  return <h1 className="p-4 text-2xl font-bold">ユーザーを選択（仮の画面）</h1>
}
