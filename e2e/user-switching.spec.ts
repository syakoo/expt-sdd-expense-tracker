import { expect, test, type Page } from '@playwright/test'

// シードユーザー（src/identity/seed.server.ts）の表示名とロールラベル
const SEED_USERS = [
  { name: '佐藤 花子', roles: '作業者' },
  { name: '鈴木 一郎', roles: '作業者' },
  { name: '田中 美咲', roles: '承認者' },
  { name: '高橋 健', roles: '承認者' },
  { name: '伊藤 直樹', roles: '作業者・承認者' },
] as const

const HANAKO = SEED_USERS[0]
const NAOKI = SEED_USERS[4]

function currentUserRegion(page: Page) {
  return page.getByRole('region', { name: '現在のユーザー' })
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

// ヘッダーとトップ画面の両方が指定ユーザーの表示になっていることを確かめる
async function expectShowingUser(
  page: Page,
  user: { name: string; roles: string },
) {
  await expect(currentUserRegion(page)).toContainText(
    `現在のユーザー：${user.name}（${user.roles}）`,
  )
  await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
    `ようこそ、${user.name} さん`,
  )
  await expect(main(page)).toContainText(
    `${user.name} さんのロール：${user.roles}`,
  )
}

async function expectNotShowingUser(page: Page, name: string) {
  await expect(currentUserRegion(page)).not.toContainText(name)
  await expect(main(page)).not.toContainText(name)
}

test('Cookie なしで / にアクセスするとユーザー選択画面に移り、トップ画面の内容を表示しない', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveURL('/select-user')
  await expect(
    main(page).getByRole('heading', { name: 'ユーザーを選択' }),
  ).toBeVisible()
  await expect(main(page)).not.toContainText('ようこそ')
  await expect(main(page)).not.toContainText('さんのロール')
  await expect(currentUserRegion(page)).toContainText('ユーザー未選択')
})

test('選択画面に 5 名が表示名とロール付きで並び、パスワード入力欄がない', async ({
  page,
}) => {
  await page.goto('/select-user')

  const items = main(page).getByRole('listitem')
  await expect(items).toHaveCount(SEED_USERS.length)
  for (const [index, user] of SEED_USERS.entries()) {
    const item = items.nth(index)
    await expect(item.getByText(user.name, { exact: true })).toBeVisible()
    await expect(item.getByText(user.roles, { exact: true })).toBeVisible()
    await expect(
      item.getByRole('button', { name: `${user.name} を選択` }),
    ).toBeVisible()
  }
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
})

test('ユーザーを選ぶとトップに移ってヘッダーとトップ画面に表示され、再読み込み後も維持される', async ({
  page,
}) => {
  await page.goto('/')
  await selectUser(page, HANAKO.name)

  await expectShowingUser(page, HANAKO)

  await page.reload()
  await expect(page).toHaveURL('/')
  await expectShowingUser(page, HANAKO)
})

test('ヘッダーの切替リンクから別のユーザーを選ぶと、古い表示が残らず新しいユーザーの表示に変わる', async ({
  page,
}) => {
  await page.goto('/')
  await selectUser(page, HANAKO.name)
  await expectShowingUser(page, HANAKO)

  await currentUserRegion(page)
    .getByRole('link', { name: 'ユーザーを切り替える' })
    .click()
  await selectUser(page, NAOKI.name)

  await expectShowingUser(page, NAOKI)
  await expectNotShowingUser(page, HANAKO.name)
})

test('2 つのブラウザコンテキストでは別々のユーザーが独立に保たれる', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  try {
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    await pageA.goto('/')
    await selectUser(pageA, HANAKO.name)
    await pageB.goto('/')
    await selectUser(pageB, NAOKI.name)

    await pageA.reload()
    await expectShowingUser(pageA, HANAKO)
    await expectNotShowingUser(pageA, NAOKI.name)

    await pageB.reload()
    await expectShowingUser(pageB, NAOKI)
    await expectNotShowingUser(pageB, HANAKO.name)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})

test('同じコンテキストの別タブで切り替えた後にトップ画面へ遷移すると、ヘッダーとトップ画面の両方が新しいユーザーになる', async ({
  context,
}) => {
  const tabA = await context.newPage()
  await tabA.goto('/')
  await selectUser(tabA, HANAKO.name)
  await expectShowingUser(tabA, HANAKO)

  const tabB = await context.newPage()
  await tabB.goto('/select-user')
  await selectUser(tabB, NAOKI.name)
  await expectShowingUser(tabB, NAOKI)

  // タブ A は再読み込みせず、ヘッダーのアプリ名リンクでトップ画面へクライアント遷移する
  await tabA.getByRole('banner').getByRole('link', { name: '経費精算' }).click()
  await expect(tabA).toHaveURL('/')
  await expectShowingUser(tabA, NAOKI)
  await expectNotShowingUser(tabA, HANAKO.name)
})

test('存在しない ID の Cookie ではユーザー選択画面に移る', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: 'current_user_id', value: 'unknown', url: baseURL },
  ])

  await page.goto('/')

  await expect(page).toHaveURL('/select-user')
  await expect(main(page)).not.toContainText('ようこそ')
  await expect(currentUserRegion(page)).toContainText('ユーザー未選択')
})
