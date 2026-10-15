import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (context.currentUser.status === 'none') {
      throw redirect({ to: '/select-user' })
    }
    return { user: context.currentUser.user }
  },
  component: Outlet,
})
