import { expect, test, type Locator, type Page } from '@playwright/test'

const HANAKO = { name: '佐藤 花子', roles: '作業者' }
const NAOKI = { name: '伊藤 直樹', roles: '作業者・承認者' }

// ヘッダーから選択ボタンまでの要素数より十分大きい上限
const MAX_TAB_PRESSES = 20

function header(page: Page) {
  return page.getByRole('banner')
}

function currentUserRegion(page: Page) {
  return page.getByRole('region', { name: '現在のユーザー' })
}

function selectButton(page: Page, name: string) {
  return page.getByRole('button', { name: `${name} を選択` })
}

async function isFocused(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element === document.activeElement)
}

// Tab キーだけで対象にフォーカスを移す
async function tabUntilFocused(page: Page, target: Locator) {
  for (let i = 0; i < MAX_TAB_PRESSES; i++) {
    await page.keyboard.press('Tab')
    if (await isFocused(target)) break
  }
  await expect(target).toBeFocused()
}

// フォーカスリングが消されていないこと（focus-visible の outline が描かれていること）
async function expectVisibleFocusRing(target: Locator) {
  const outlineStyle = await target.evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  )
  expect(outlineStyle).not.toBe('none')
}

async function expectHeaderLinks(page: Page) {
  const appNameLink = header(page).getByRole('link', {
    name: '経費精算',
    exact: true,
  })
  await expect(appNameLink).toBeVisible()
  await expect(appNameLink).toHaveAttribute('href', '/')
  const switchLink = header(page).getByRole('link', {
    name: 'ユーザーを切り替える',
  })
  await expect(switchLink).toBeVisible()
  await expect(switchLink).toHaveAttribute('href', '/select-user')
}

test('ユーザー選択画面とトップ画面の両方で、ヘッダーにアプリ名と切替リンクがある', async ({
  page,
}) => {
  await page.goto('/select-user')
  await expectHeaderLinks(page)

  await selectButton(page, HANAKO.name).click()
  await expect(page).toHaveURL('/')
  await expectHeaderLinks(page)
})

test('キーボードだけでユーザーを選択し、ヘッダーの切替リンクから選択画面に戻れる', async ({
  page,
}) => {
  await page.goto('/select-user')
  const naokiButton = selectButton(page, NAOKI.name)
  // ハイドレーション前は無効なので、有効になってから操作する
  await expect(naokiButton).toBeEnabled()

  await tabUntilFocused(page, naokiButton)
  await expectVisibleFocusRing(naokiButton)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/')
  await expect(currentUserRegion(page)).toContainText(NAOKI.name)

  const switchLink = header(page).getByRole('link', {
    name: 'ユーザーを切り替える',
  })
  await tabUntilFocused(page, switchLink)
  await expectVisibleFocusRing(switchLink)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/select-user')
})

test('「現在のユーザー」領域から現在ユーザーの表示名とロールが読み取れる', async ({
  page,
}) => {
  await page.goto('/select-user')
  await expect(currentUserRegion(page)).toContainText('ユーザー未選択')

  await selectButton(page, NAOKI.name).click()
  await expect(page).toHaveURL('/')

  const region = currentUserRegion(page)
  await expect(region).toBeVisible()
  await expect(region).toContainText(NAOKI.name)
  await expect(region).toContainText(NAOKI.roles)
  await expect(region).not.toContainText('ユーザー未選択')
})
