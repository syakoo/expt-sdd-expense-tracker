import { expect, test, type Page } from '@playwright/test'

const HANAKO = '佐藤 花子'
const ICHIRO = '鈴木 一郎'
const MISAKI = '田中 美咲'

// 前回の実行のデータが残るため、実行ごとに一意な支払先名を使い、自分が作った行だけを検証する
function uniquePayee(label = '文具店') {
  return `E2E ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

function main(page: Page) {
  return page.getByRole('main')
}

async function selectUser(page: Page, name: string) {
  await expect(page).toHaveURL('/select-user')
  // ハイドレーション前は無効なので、click が有効になるまで待つ
  await page.getByRole('button', { name: `${name} を選択` }).click()
  await expect(page).toHaveURL('/')
}

async function startAs(page: Page, name: string) {
  await page.goto('/')
  await selectUser(page, name)
}

async function switchUser(page: Page, name: string) {
  await page
    .getByRole('region', { name: '現在のユーザー' })
    .getByRole('link', { name: 'ユーザーを切り替える' })
    .click()
  await selectUser(page, name)
}

interface ReceiptInput {
  date: string
  amount: string
  payee: string
  category: string
  memo?: string
}

async function fillForm(page: Page, input: Partial<ReceiptInput>) {
  // 送信ボタンはハイドレーション後に有効になる。その前の入力は初期値に戻されるため待つ
  await expect(
    page.getByRole('button', { name: /^(登録する|更新する)$/ }),
  ).toBeEnabled()
  if (input.date !== undefined) {
    await page.getByLabel('日付').fill(input.date)
  }
  if (input.amount !== undefined) {
    await page.getByLabel('金額').fill(input.amount)
  }
  if (input.payee !== undefined) {
    await page.getByLabel('支払先').fill(input.payee)
  }
  if (input.category !== undefined) {
    await page.getByLabel('費目').selectOption({ label: input.category })
  }
  if (input.memo !== undefined) {
    await page.getByLabel('メモ').fill(input.memo)
  }
}

// ハイドレーション前は登録ボタンが無効なので、click が有効になるまで待たれる
async function submitForm(page: Page, name: '登録する' | '更新する') {
  await page.getByRole('button', { name }).click()
}

function rowOf(page: Page, payee: string) {
  return main(page).getByRole('row').filter({ hasText: payee })
}

async function createReceipt(page: Page, input: ReceiptInput) {
  await page.goto('/receipts/new')
  await expect(
    main(page).getByRole('heading', { name: '領収書を登録' }),
  ).toBeVisible()
  await fillForm(page, input)
  await submitForm(page, '登録する')
  await expect(page).toHaveURL('/receipts')
  await expect(rowOf(page, input.payee)).toBeVisible()
}

test('佐藤 花子がトップの導線から領収書を登録すると、一覧に日付・金額・支払先・費目が表示される', async ({
  page,
}) => {
  const payee = uniquePayee()
  await startAs(page, HANAKO)

  await main(page).getByRole('link', { name: '領収書を管理する' }).click()
  await expect(page).toHaveURL('/receipts')
  await expect(
    main(page).getByRole('heading', { name: '領収書', exact: true }),
  ).toBeVisible()

  // 一覧が 0 件でも 1 件以上でも、登録画面への導線から開く
  await main(page).getByRole('link', { name: '領収書を登録する' }).click()
  await expect(page).toHaveURL('/receipts/new')
  await expect(
    main(page).getByRole('heading', { name: '領収書を登録' }),
  ).toBeVisible()

  await fillForm(page, {
    date: '2026-01-15',
    amount: '1234',
    payee,
    category: '消耗品費',
    memo: 'E2E のメモ',
  })
  await submitForm(page, '登録する')

  await expect(page).toHaveURL('/receipts')
  const row = rowOf(page, payee)
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('2026/01/15')
  await expect(row).toContainText('1,234円')
  await expect(row).toContainText('消耗品費')
})

test('金額が不正で支払先が未入力のまま登録すると、両方のエラーが出て、日付と費目が残り、一覧に増えない', async ({
  page,
}) => {
  await startAs(page, HANAKO)
  await page.goto('/receipts')
  const rowsBefore = await main(page).getByRole('row').count()

  await page.goto('/receipts/new')
  await fillForm(page, {
    date: '2026-02-03',
    amount: 'abc',
    category: '交通費',
  })
  await submitForm(page, '登録する')

  await expect(page.getByRole('alert')).toHaveText('入力内容を確認してください')
  const amount = page.getByLabel('金額')
  const payee = page.getByLabel('支払先')
  await expect(
    page.getByText('金額は半角数字の整数で入力してください'),
  ).toBeVisible()
  await expect(page.getByText('支払先を入力してください')).toBeVisible()
  await expect(amount).toHaveAttribute('aria-invalid', 'true')
  await expect(payee).toHaveAttribute('aria-invalid', 'true')
  // 最初の誤りの項目にフォーカスが移る
  await expect(amount).toBeFocused()

  // 入力した値が残る
  await expect(page).toHaveURL('/receipts/new')
  await expect(page.getByLabel('日付')).toHaveValue('2026-02-03')
  await expect(page.getByLabel('費目')).toHaveValue('transportation')
  await expect(amount).toHaveValue('abc')

  // 一覧に増えていない
  await page.goto('/receipts')
  await expect(main(page).getByRole('row')).toHaveCount(rowsBefore)
})

test('登録した領収書を一覧から開いて金額を変えて更新すると、一覧の金額が変わる', async ({
  page,
}) => {
  const payee = uniquePayee()
  await startAs(page, HANAKO)
  await createReceipt(page, {
    date: '2026-03-10',
    amount: '1000',
    payee,
    category: '会議費',
  })
  await expect(rowOf(page, payee)).toContainText('1,000円')

  await rowOf(page, payee)
    .getByRole('link', { name: /の領収書を開く$/ })
    .click()
  await expect(
    main(page).getByRole('heading', { name: '領収書を編集' }),
  ).toBeVisible()
  await expect(page.getByLabel('金額')).toHaveValue('1000')
  await expect(page.getByLabel('支払先')).toHaveValue(payee)

  await fillForm(page, { amount: '2500' })
  await submitForm(page, '更新する')

  await expect(page).toHaveURL('/receipts')
  await expect(rowOf(page, payee)).toContainText('2,500円')
  await expect(rowOf(page, payee)).not.toContainText('1,000円')
})

test('削除の確認領域を開くと見出しにフォーカスが移り、キャンセルで元のボタンに戻って領収書が残り、削除するで一覧から消える', async ({
  page,
}) => {
  const payee = uniquePayee()
  await startAs(page, HANAKO)
  await createReceipt(page, {
    date: '2026-04-01',
    amount: '800',
    payee,
    category: '通信費',
  })
  await rowOf(page, payee)
    .getByRole('link', { name: /の領収書を開く$/ })
    .click()
  await expect(
    main(page).getByRole('heading', { name: '領収書を編集' }),
  ).toBeVisible()

  const openButton = page.getByRole('button', { name: 'この領収書を削除' })
  const confirmHeading = page.getByRole('heading', {
    name: 'この領収書を削除しますか？',
  })

  // 開く → 見出しにフォーカス
  await openButton.click()
  await expect(confirmHeading).toBeFocused()
  await expect(page.getByRole('button', { name: '削除する' })).toBeVisible()

  // キャンセル → 元のボタンにフォーカス、領収書は残る
  await page.getByRole('button', { name: 'キャンセル' }).click()
  await expect(confirmHeading).toHaveCount(0)
  await expect(openButton).toBeFocused()
  await page.goto('/receipts')
  await expect(rowOf(page, payee)).toHaveCount(1)

  // もう一度開いて削除する → 一覧から消える
  await rowOf(page, payee)
    .getByRole('link', { name: /の領収書を開く$/ })
    .click()
  await page.getByRole('button', { name: 'この領収書を削除' }).click()
  await page.getByRole('button', { name: '削除する' }).click()

  await expect(page).toHaveURL('/receipts')
  await expect(
    main(page).getByRole('heading', { name: '領収書', exact: true }),
  ).toBeVisible()
  await expect(rowOf(page, payee)).toHaveCount(0)
})

test('ユーザーを切り替えると他人の領収書は一覧に出ず、編集 URL を直接開いても見つからない', async ({
  page,
}) => {
  const payee = uniquePayee()
  await startAs(page, HANAKO)
  await createReceipt(page, {
    date: '2026-05-20',
    amount: '3000',
    payee,
    category: '宿泊費',
  })
  await rowOf(page, payee)
    .getByRole('link', { name: /の領収書を開く$/ })
    .click()
  await expect(
    main(page).getByRole('heading', { name: '領収書を編集' }),
  ).toBeVisible()
  const editUrl = page.url()
  expect(editUrl).toMatch(/\/receipts\/.+\/edit$/)

  await switchUser(page, ICHIRO)
  await page.goto('/receipts')
  await expect(
    main(page).getByRole('heading', { name: '領収書', exact: true }),
  ).toBeVisible()
  await expect(main(page)).not.toContainText(payee)

  await page.goto(editUrl)
  await expect(main(page)).toContainText('領収書が見つかりません')
  await expect(main(page)).not.toContainText(payee)
  await expect(page.getByLabel('支払先')).toHaveCount(0)
})

test('承認者のみの田中 美咲にはトップに導線がなく、/receipts を直接開くと作業者ロールが必要と表示され、内容は出ない', async ({
  page,
  browser,
}) => {
  // 他のユーザーが登録した領収書があっても、内容が出ないことを確かめる
  const payee = uniquePayee()
  const workerContext = await browser.newContext()
  try {
    const workerPage = await workerContext.newPage()
    await startAs(workerPage, HANAKO)
    await createReceipt(workerPage, {
      date: '2026-06-01',
      amount: '500',
      payee,
      category: '交際費',
    })
  } finally {
    await workerContext.close()
  }

  await startAs(page, MISAKI)
  await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
    `ようこそ、${MISAKI} さん`,
  )
  await expect(
    main(page).getByRole('link', { name: '領収書を管理する' }),
  ).toHaveCount(0)

  await page.goto('/receipts')
  await expect(main(page)).toContainText(
    '領収書を管理するには作業者ロールが必要です',
  )
  await expect(main(page)).not.toContainText(payee)
  await expect(main(page).getByRole('table')).toHaveCount(0)

  await page.goto('/receipts/new')
  await expect(main(page)).toContainText(
    '領収書を管理するには作業者ロールが必要です',
  )
  await expect(page.getByLabel('支払先')).toHaveCount(0)
})

test.describe('キーボード', () => {
  test.use({ locale: 'ja-JP' })

  test('キーボード（Tab / Enter / 文字入力 / 矢印キー）だけで登録を完了して一覧へ戻れる', async ({
    page,
  }) => {
    const payee = uniquePayee('キーボード')
    await startAs(page, HANAKO)
    await page.goto('/receipts/new')
    await expect(
      main(page).getByRole('heading', { name: '領収書を登録' }),
    ).toBeVisible()
    // ハイドレーション（登録ボタンが有効になる）を待つ
    await expect(page.getByRole('button', { name: '登録する' })).toBeEnabled()

    // フォーカスをフォームの直前に置き、以降は Tab だけで移動する
    await page.getByLabel('日付').focus()
    await expect(page.getByLabel('日付')).toBeFocused()

    // 日付（ロケールの並びに依存しないよう、年月日を日本語ロケールで固定する）
    await page.keyboard.type('2026')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('07')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('04')
    await expect(page.getByLabel('日付')).toHaveValue('2026-07-04')

    // 日付欄の中（年月日の欄・カレンダーのボタン）を抜けるまで Tab を押す
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      if (
        await page
          .getByLabel('金額')
          .evaluate((e) => e === document.activeElement)
      )
        break
    }
    await expect(page.getByLabel('金額')).toBeFocused()
    await page.keyboard.type('4567')

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('支払先')).toBeFocused()
    await page.keyboard.type(payee)

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('費目')).toBeFocused()
    // 費目は標準の選択欄。矢印キーでの選択は OS ごとの挙動（macOS ではネイティブの一覧が開き、
    // Playwright のキー入力が届かない）に依存するため、フォーカスはキーボードで移したうえで値の選択だけ selectOption で行う
    await page.getByLabel('費目').selectOption({ label: '交通費' })
    await expect(page.getByLabel('費目')).toHaveValue('transportation')

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('メモ')).toBeFocused()
    await page.keyboard.type('キーボードだけ')

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '登録する' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL('/receipts')
    const row = rowOf(page, payee)
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('2026/07/04')
    await expect(row).toContainText('4,567円')
    await expect(row).toContainText('交通費')
  })
})

test('領収書の Server Function の応答に Cache-Control: private, no-store が付く', async ({
  page,
}) => {
  const payee = uniquePayee()
  const serverFnResponses: Array<{ method: string; cacheControl?: string }> = []
  page.on('response', (response) => {
    if (response.url().includes('/_serverFn/')) {
      serverFnResponses.push({
        method: response.request().method(),
        cacheControl: response.headers()['cache-control'],
      })
    }
  })

  await startAs(page, HANAKO)
  serverFnResponses.length = 0

  // 一覧の取得（クライアント遷移）、登録（POST）、一覧の再取得を発生させる
  await main(page).getByRole('link', { name: '領収書を管理する' }).click()
  await expect(page).toHaveURL('/receipts')
  await createReceipt(page, {
    date: '2026-08-08',
    amount: '100',
    payee,
    category: '消耗品費',
  })

  expect(serverFnResponses.length).toBeGreaterThanOrEqual(2)
  expect(serverFnResponses.some((r) => r.method === 'POST')).toBe(true)
  for (const { cacheControl } of serverFnResponses) {
    expect(cacheControl).toBe('private, no-store')
  }
})

test('別オリジンからの領収書登録の Server Function の呼び出しは 403 で拒否する', async ({
  page,
}) => {
  const payee = uniquePayee()
  await startAs(page, HANAKO)

  // 画面からの通常の登録（同一オリジンの POST）で、登録の Server Function の URL と本文を得る
  const registerRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes('/_serverFn/') && request.method() === 'POST',
  )
  await createReceipt(page, {
    date: '2026-08-09',
    amount: '100',
    payee,
    category: '消耗品費',
  })
  const registerRequest = await registerRequestPromise

  const headers = await registerRequest.allHeaders()
  const data = registerRequest.postDataBuffer() ?? undefined

  const crossOriginResponse = await page.request.post(registerRequest.url(), {
    headers: {
      ...headers,
      origin: 'http://evil.example',
      'sec-fetch-site': 'cross-site',
    },
    data,
  })
  expect(crossOriginResponse.status()).toBe(403)

  // 拒否された呼び出しでは登録されない（支払先が一覧に 1 件のまま）
  await page.goto('/receipts')
  await expect(rowOf(page, payee)).toHaveCount(1)
})
