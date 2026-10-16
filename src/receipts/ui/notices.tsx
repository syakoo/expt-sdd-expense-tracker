import { Link } from '@tanstack/react-router'

const LINK_CLASS_NAME =
  'rounded text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'

export function WorkerRoleRequired() {
  return (
    <div className="flex flex-col gap-2">
      <p>領収書を管理するには作業者ロールが必要です</p>
      <p>
        <Link to="/select-user" className={LINK_CLASS_NAME}>
          ユーザーを切り替える
        </Link>
      </p>
    </div>
  )
}

export function ReceiptNotFound() {
  return (
    <div className="flex flex-col gap-2">
      <p>領収書が見つかりません</p>
      <p>
        <Link to="/receipts" className={LINK_CLASS_NAME}>
          領収書一覧に戻る
        </Link>
      </p>
    </div>
  )
}

export function LockedNotice() {
  return (
    <p
      role="status"
      className="rounded border border-amber-700 bg-amber-50 px-3 py-2 text-amber-900"
    >
      この領収書はロック中のため、編集・削除できません
    </p>
  )
}
