import { createRouter } from '@tanstack/react-router'
import { RouteError, RouteNotFound } from '@/routes/-components/route-error'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false,
    defaultGcTime: 0,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  })
}
