import { env } from '@/config/env'
import { routes } from '@/routes'
import { createBrowserRouter } from 'react-router'

export function createAppRouter() {
  return createBrowserRouter(routes, {
    basename: env.appBasePath,
  })
}
