import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

// 現在ユーザーは Cookie で決まるため、同じ URL でもユーザーによって応答が変わる。
// HTML も Server Function の応答も、どこにもキャッシュさせない
const noStoreMiddleware = createMiddleware().server(({ next }) => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [noStoreMiddleware],
}))
