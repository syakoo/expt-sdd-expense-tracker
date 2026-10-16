import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

// 独自の startInstance を定義すると既定の CSRF ミドルウェアが外れるため、明示的に登録する。
// Server Function の呼び出しだけを対象に、同一オリジン以外からの要求を 403 で拒否する
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

// 現在ユーザーは Cookie で決まるため、同じ URL でもユーザーによって応答が変わる。
// HTML も Server Function の応答も、どこにもキャッシュさせない
const noStoreMiddleware = createMiddleware().server(({ next }) => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, noStoreMiddleware],
}))
