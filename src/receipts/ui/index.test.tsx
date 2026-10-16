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
  DeleteReceiptSection,
  formatReceiptDate,
  formatYen,
  LockedNotice,
  ReceiptDetails,
  ReceiptForm,
  ReceiptList,
  ReceiptNotFound,
  WorkerRoleRequired,
} from '@/receipts/ui'
import { DeleteReceiptSectionView } from './delete-receipt-section'
import { ReceiptFormView } from './receipt-form'
import {
  DELETE_FAILED_MESSAGE,
  SAVE_FAILED_MESSAGE,
  toDeleteReceiptOutcome,
  toReceiptFormOutcome,
} from './receipt-form-outcome'

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

describe('ReceiptForm', () => {
  const FIELDS = [
    { id: 'date', label: '日付', tag: 'input' },
    { id: 'amount', label: '金額', tag: 'input' },
    { id: 'payee', label: '支払先', tag: 'input' },
    { id: 'category', label: '費目', tag: 'select' },
    { id: 'memo', label: 'メモ', tag: 'textarea' },
  ] as const

  /** `<label for="...">` の for を、ラベルの文字（先頭）で探す */
  function labelTargetOf(html: string, label: string): string | undefined {
    return html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}`))?.[1]
  }

  /** id で入力欄の開始タグを取り出す */
  function controlTagOf(html: string, id: string): string | undefined {
    return html.match(
      new RegExp(`<(?:input|select|textarea)[^>]*id="${id}"[^>]*>`),
    )?.[0]
  }

  it('5 つの入力欄を、ラベルで名前を付けて出す。必須の 4 つは aria-required と見える印、メモは任意と明記', async () => {
    const html = await renderInRouter(<ReceiptForm mode="create" />)
    for (const field of FIELDS) {
      const id = labelTargetOf(html, field.label)
      expect(id, field.label).toBeDefined()
      const tag = controlTagOf(html, id ?? '')
      expect(tag, field.label).toBeDefined()
      expect(tag?.startsWith(`<${field.tag}`)).toBe(true)
      if (field.id === 'memo') {
        expect(tag).not.toContain('aria-required')
      } else {
        expect(tag).toContain('aria-required="true"')
      }
    }
    expect(html.match(/必須/g)).toHaveLength(4)
    expect(html).toContain('任意')
    expect(controlTagOf(html, labelTargetOf(html, '日付') ?? '')).toContain(
      'type="date"',
    )
    const amountTag = controlTagOf(html, labelTargetOf(html, '金額') ?? '')
    expect(amountTag).toContain('type="text"')
    expect(amountTag).toContain('inputMode="numeric"')
    expect(html).toMatch(/>円</)
  })

  it('費目は「選択してください」（値が空）の後に 7 種類をこの順で並べる', async () => {
    const html = await renderInRouter(<ReceiptForm mode="create" />)
    const select = html.match(/<select[\s\S]*?<\/select>/)?.[0] ?? ''
    const options = [
      ...select.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g),
    ].map(([, value, label]) => [value, label])
    expect(options).toEqual([
      ['', '選択してください'],
      ['transportation', '交通費'],
      ['lodging', '宿泊費'],
      ['meeting', '会議費'],
      ['entertainment', '交際費'],
      ['supplies', '消耗品費'],
      ['communication', '通信費'],
      ['other', 'その他'],
    ])
  })

  it('登録では入力欄が空で、ハイドレーション前は「登録する」ボタンが無効。キャンセルで一覧へ戻れる', async () => {
    const html = await renderInRouter(<ReceiptForm mode="create" />)
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*disabled=""[^>]*>登録する<\/button>/,
    )
    expect(html).toMatch(/<a[^>]*href="\/receipts"[^>]*>キャンセル<\/a>/)
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('aria-invalid=')
  })

  it('編集では現在の内容を初期値にし、ハイドレーション前は「更新する」ボタンが無効', async () => {
    const html = await renderInRouter(
      <ReceiptForm
        mode="edit"
        receipt={{ ...LOCKED_RECEIPT, locked: false }}
      />,
    )
    expect(controlTagOf(html, labelTargetOf(html, '日付') ?? '')).toContain(
      'value="2026-10-16"',
    )
    expect(controlTagOf(html, labelTargetOf(html, '金額') ?? '')).toContain(
      'value="1234"',
    )
    expect(controlTagOf(html, labelTargetOf(html, '支払先') ?? '')).toContain(
      'value="東京駅前タクシー"',
    )
    expect(html).toMatch(/<option[^>]*value="transportation"[^>]*selected=""/)
    expect(html).toMatch(/<textarea[^>]*>顧客訪問<\/textarea>/)
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*disabled=""[^>]*>更新する<\/button>/,
    )
  })
})

describe('ReceiptFormView（入力の誤りの表示）', () => {
  it('誤りのある入力欄に aria-invalid と、エラー文を指す aria-describedby を付け、先頭に警告を出す', async () => {
    const html = await renderInRouter(
      <ReceiptFormView
        mode="create"
        values={{
          date: '2026-10-16',
          amount: 'abc',
          payee: '',
          category: 'meeting',
          memo: '',
        }}
        errors={{
          amount: '金額は 1 以上 9,999,999 以下の整数で入力してください',
          payee: '支払先を入力してください',
        }}
        alert="入力内容を確認してください"
        submitDisabled={false}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    )
    expect(html).toMatch(
      /<[a-z]+[^>]*role="alert"[^>]*>入力内容を確認してください</,
    )
    // 警告はフォームの先頭（最初の入力欄より前）
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('<input'))

    for (const [label, message] of [
      ['金額', '金額は 1 以上 9,999,999 以下の整数で入力してください'],
      ['支払先', '支払先を入力してください'],
    ] as const) {
      const id =
        html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}`))?.[1] ??
        ''
      const tag =
        html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? ''
      expect(tag, label).toContain('aria-invalid="true"')
      const describedBy = tag.match(/aria-describedby="([^"]+)"/)?.[1] ?? ''
      const errorIds = describedBy.split(' ')
      expect(
        errorIds.some((errorId) =>
          new RegExp(`id="${errorId}"[^>]*>${message}<`).test(html),
        ),
        label,
      ).toBe(true)
    }
    // 入力は保持される
    expect(html).toMatch(/<input[^>]*value="abc"/)
    expect(html).toMatch(/<option[^>]*value="meeting"[^>]*selected=""/)

    const dateId = html.match(/<label[^>]*for="([^"]+)"[^>]*>日付/)?.[1] ?? ''
    const dateTag = html.match(
      new RegExp(`<input[^>]*id="${dateId}"[^>]*>`),
    )?.[0]
    expect(dateTag).not.toContain('aria-invalid=')
    expect(html).toMatch(
      /<button[^>]*type="submit"(?![^>]*disabled=)[^>]*>登録する<\/button>/,
    )
  })
})

describe('toReceiptFormOutcome', () => {
  it('created / updated は保存済みとして一覧へ遷移する', () => {
    expect(
      toReceiptFormOutcome({ status: 'created', receipt: LOCKED_RECEIPT }),
    ).toEqual({ kind: 'saved' })
    expect(
      toReceiptFormOutcome({ status: 'updated', receipt: LOCKED_RECEIPT }),
    ).toEqual({ kind: 'saved' })
  })

  it('invalid は項目ごとのエラーと「入力内容を確認してください」、最初の誤りの欄（入力欄の順）を返す', () => {
    expect(
      toReceiptFormOutcome({
        status: 'invalid',
        errors: {
          memo: 'メモの誤り',
          amount: '金額の誤り',
          category: '費目の誤り',
        },
      }),
    ).toEqual({
      kind: 'invalid',
      errors: {
        memo: 'メモの誤り',
        amount: '金額の誤り',
        category: '費目の誤り',
      },
      alert: '入力内容を確認してください',
      focus: 'amount',
    })
  })

  it('locked はロック中の警告を出して読み直す。not-found・forbidden はそれぞれの警告を出す', () => {
    expect(toReceiptFormOutcome({ status: 'locked' })).toEqual({
      kind: 'rejected',
      alert: 'この領収書はロック中のため、編集・削除できません',
      reload: true,
    })
    expect(toReceiptFormOutcome({ status: 'not-found' })).toEqual({
      kind: 'rejected',
      alert: '領収書が見つかりません',
      reload: false,
    })
    expect(toReceiptFormOutcome({ status: 'forbidden' })).toEqual({
      kind: 'rejected',
      alert: '領収書を管理するには作業者ロールが必要です',
      reload: false,
    })
  })

  it('例外時の警告文', () => {
    expect(SAVE_FAILED_MESSAGE).toBe(
      '保存できませんでした。時間をおいてもう一度お試しください',
    )
  })
})

describe('DeleteReceiptSection', () => {
  it('初期表示は「この領収書を削除」ボタンだけで、確認領域を出さない。ハイドレーション前は無効', async () => {
    const html = await renderInRouter(
      <DeleteReceiptSection receiptId={'receipt-01' as ReceiptId} />,
    )
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*disabled=""[^>]*>この領収書を削除<\/button>/,
    )
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).not.toContain('role="group"')
    expect(html).not.toContain('この領収書を削除しますか？')
    expect(html).not.toContain('削除する')
    expect(html).not.toContain('キャンセル')
    expect(html).not.toContain('role="alert"')
  })
})

describe('DeleteReceiptSectionView（確認領域を開いた表示）', () => {
  function renderOpen(props: { busy: boolean; alert?: string }) {
    return renderInRouter(
      <DeleteReceiptSectionView
        open
        alert={props.alert}
        busy={props.busy}
        onOpen={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
  }

  it('見出し「この領収書を削除しますか？」を aria-labelledby で指す group に「削除する」「キャンセル」を置く。見出しはフォーカスを受けられる', async () => {
    const html = await renderOpen({ busy: false })
    const group = html.match(/<[a-z]+[^>]*role="group"[^>]*>/)?.[0] ?? ''
    expect(group).not.toBe('')
    const labelledBy = group.match(/aria-labelledby="([^"]+)"/)?.[1] ?? ''
    expect(labelledBy).not.toBe('')
    const heading = html.match(
      new RegExp(`<h[2-6][^>]*id="${labelledBy}"[^>]*>([^<]*)<`),
    )
    expect(heading?.[1]).toBe('この領収書を削除しますか？')
    expect(heading?.[0]).toContain('tabindex="-1"')
    expect(html).toMatch(
      /<button[^>]*type="button"(?![^>]*disabled=)[^>]*>削除する<\/button>/,
    )
    expect(html).toMatch(
      /<button[^>]*type="button"(?![^>]*disabled=)[^>]*>キャンセル<\/button>/,
    )
    expect(html).not.toContain('role="alert"')
  })

  it('送信中は「削除する」「キャンセル」の両方を無効にし、警告は role="alert" で出す', async () => {
    const html = await renderOpen({ busy: true, alert: DELETE_FAILED_MESSAGE })
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*disabled=""[^>]*>削除する<\/button>/,
    )
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*disabled=""[^>]*>キャンセル<\/button>/,
    )
    expect(html).toMatch(
      new RegExp(`<[a-z]+[^>]*role="alert"[^>]*>${DELETE_FAILED_MESSAGE}<`),
    )
  })
})

describe('toDeleteReceiptOutcome', () => {
  it('deleted は削除済みとして一覧へ遷移する', () => {
    expect(toDeleteReceiptOutcome({ status: 'deleted' })).toEqual({
      kind: 'deleted',
    })
  })

  it('locked は警告を出して読み直す。not-found・forbidden は登録・更新と同じ警告を出す', () => {
    for (const status of ['locked', 'not-found', 'forbidden'] as const) {
      expect(toDeleteReceiptOutcome({ status }), status).toEqual(
        toReceiptFormOutcome({ status }),
      )
    }
    expect(toDeleteReceiptOutcome({ status: 'locked' })).toEqual({
      kind: 'rejected',
      alert: 'この領収書はロック中のため、編集・削除できません',
      reload: true,
    })
  })

  it('例外時の警告文', () => {
    expect(DELETE_FAILED_MESSAGE).toBe(
      '削除できませんでした。時間をおいてもう一度お試しください',
    )
  })
})
