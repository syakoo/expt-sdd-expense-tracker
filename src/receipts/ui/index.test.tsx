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
import {
  formatReceiptDate,
  formatYen,
  LockedNotice,
  ReceiptDetails,
  ReceiptList,
  ReceiptNotFound,
  WorkerRoleRequired,
} from '@/receipts/ui'

// サーバー描画（ハイドレーション前）の HTML を得る。Link と useRouter のためにメモリ上のルーターで包む
async function renderInRouter(node: ReactNode): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

const LOCKED_RECEIPT: Receipt = {
  id: 'receipt-01' as ReceiptId,
  ownerId: 'user-01' as UserId,
  date: '2026-10-16',
  amount: 1234,
  payee: '東京駅前タクシー',
  category: 'transportation',
  memo: '顧客訪問',
  locked: true,
}

describe('formatYen', () => {
  it('桁区切りと「円」を付ける', () => {
    expect(formatYen(1234)).toBe('1,234円')
    expect(formatYen(1)).toBe('1円')
    expect(formatYen(9999999)).toBe('9,999,999円')
  })
})

describe('formatReceiptDate', () => {
  it('YYYY-MM-DD を YYYY/MM/DD にする', () => {
    expect(formatReceiptDate('2026-10-16')).toBe('2026/10/16')
  })
})

describe('WorkerRoleRequired', () => {
  it('作業者ロールが必要であることと、ユーザー切替画面へのリンクを出す', async () => {
    const html = await renderInRouter(<WorkerRoleRequired />)
    expect(html).toContain('領収書を管理するには作業者ロールが必要です')
    expect(html).toMatch(/<a[^>]*href="\/select-user"[^>]*>[^<]+<\/a>/)
  })
})

describe('ReceiptNotFound', () => {
  it('領収書が見つからないことと、一覧へのリンクを出す', async () => {
    const html = await renderInRouter(<ReceiptNotFound />)
    expect(html).toContain('領収書が見つかりません')
    expect(html).toMatch(/<a[^>]*href="\/receipts"[^>]*>[^<]+<\/a>/)
  })
})

describe('LockedNotice', () => {
  it('ロック中のため編集・削除できないことを role="status" で出す', async () => {
    const html = await renderInRouter(<LockedNotice />)
    expect(html).toMatch(
      /<[a-z]+[^>]*role="status"[^>]*>この領収書はロック中のため、編集・削除できません</,
    )
  })
})

describe('ReceiptDetails', () => {
  it('5 項目を読み取り専用の dl で表示する', async () => {
    const html = await renderInRouter(
      <ReceiptDetails receipt={LOCKED_RECEIPT} />,
    )
    expect(html).toMatch(/<dl[\s>]/)
    for (const term of ['日付', '金額', '支払先', '費目', 'メモ']) {
      expect(html).toMatch(new RegExp(`<dt[^>]*>${term}</dt>`))
    }
    expect(html).toMatch(/<dd[^>]*>2026\/10\/16<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>1,234円<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>東京駅前タクシー<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>交通費<\/dd>/)
    expect(html).toMatch(/<dd[^>]*>顧客訪問<\/dd>/)
  })

  it('メモが空なら「なし」と表示する', async () => {
    const html = await renderInRouter(
      <ReceiptDetails receipt={{ ...LOCKED_RECEIPT, memo: '' }} />,
    )
    expect(html).toMatch(/<dt[^>]*>メモ<\/dt><dd[^>]*>なし<\/dd>/)
  })

  it('ロック中の表示に更新・削除の操作（ボタン・入力欄・フォーム）を置かない', async () => {
    const html = await renderInRouter(
      <>
        <LockedNotice />
        <ReceiptDetails receipt={LOCKED_RECEIPT} />
      </>,
    )
    expect(html).not.toMatch(/<button|<input|<textarea|<select|<form/)
    expect(html).not.toContain('更新する')
    expect(html).not.toContain('削除する')
    expect(html).not.toContain('この領収書を削除')
  })
})

describe('ReceiptList', () => {
  const UNLOCKED_RECEIPT: Receipt = {
    id: 'receipt-02' as ReceiptId,
    ownerId: 'user-01' as UserId,
    date: '2026-09-01',
    amount: 500,
    payee: '文具店',
    category: 'supplies',
    memo: '',
    locked: false,
  }

  /** `<tr>...</tr>` を順に取り出す（先頭は見出し行） */
  function rowsOf(html: string): string[] {
    return html.match(/<tr[\s>].*?<\/tr>/g) ?? []
  }

  it('0 件なら領収書がないことと、登録画面へのリンクを出し、表は出さない', async () => {
    const html = await renderInRouter(<ReceiptList receipts={[]} />)
    expect(html).toContain('登録された領収書はありません')
    expect(html).toMatch(
      /<a[^>]*href="\/receipts\/new"[^>]*>領収書を登録する<\/a>/,
    )
    expect(html).not.toContain('<table')
  })

  it('1 件以上なら見出し付きの表で 6 列を出す', async () => {
    const html = await renderInRouter(
      <ReceiptList receipts={[LOCKED_RECEIPT, UNLOCKED_RECEIPT]} />,
    )
    expect(html).toMatch(/<table[\s>]/)
    expect(html).toMatch(/<caption[^>]*>自分の領収書<\/caption>/)
    for (const column of ['日付', '金額', '支払先', '費目', '状態', '操作']) {
      expect(html).toMatch(
        new RegExp(`<th[^>]*scope="col"[^>]*>${column}</th>`),
      )
    }
    expect(html).not.toContain('登録された領収書はありません')
  })

  it('各行に日付・金額・支払先・費目のラベルを書式付きで、受け取った順に出す', async () => {
    const html = await renderInRouter(
      <ReceiptList receipts={[UNLOCKED_RECEIPT, LOCKED_RECEIPT]} />,
    )
    const [, first, second] = rowsOf(html)
    expect(rowsOf(html)).toHaveLength(3)
    expect(first).toContain('2026/09/01')
    expect(first).toMatch(/>500円</)
    expect(first).toContain('文具店')
    expect(first).toMatch(/>消耗品費</)
    expect(second).toContain('2026/10/16')
    expect(second).toMatch(/>1,234円</)
    expect(second).toContain('東京駅前タクシー')
    expect(second).toMatch(/>交通費</)
  })

  it('ロック中の行だけ状態列に「ロック中」と出す', async () => {
    const html = await renderInRouter(
      <ReceiptList receipts={[LOCKED_RECEIPT, UNLOCKED_RECEIPT]} />,
    )
    const [, locked, unlocked] = rowsOf(html)
    expect(locked).toContain('ロック中')
    expect(unlocked).not.toContain('ロック中')
  })

  it('各行に、日付と支払先を含む名前で編集画面へのリンクを出す（ロック中でも出す）', async () => {
    const html = await renderInRouter(
      <ReceiptList receipts={[LOCKED_RECEIPT, UNLOCKED_RECEIPT]} />,
    )
    const [, locked, unlocked] = rowsOf(html)
    // 属性の並びに依存しないよう、行の中の <a> 開始タグを取り出して属性ごとに確かめる
    const lockedLink = locked?.match(/<a\s[^>]*>/)?.[0]
    expect(lockedLink).toContain('href="/receipts/receipt-01/edit"')
    expect(lockedLink).toContain(
      'aria-label="2026/10/16 東京駅前タクシー の領収書を開く"',
    )
    const unlockedLink = unlocked?.match(/<a\s[^>]*>/)?.[0]
    expect(unlockedLink).toContain('href="/receipts/receipt-02/edit"')
    expect(unlockedLink).toContain(
      'aria-label="2026/09/01 文具店 の領収書を開く"',
    )
  })
})
