import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppRouter } from '@/router'
import type { UserSessionPayload } from '@/types/permission'
import { RouterProvider } from 'react-router'
import { useSessionStore } from '@/stores/session.store'
import { queryClient } from '@/lib/query-client'
import { NavigationProgress } from '@/components/common/navigation-progress'
import './styles/index.css'

const defaultSession: UserSessionPayload = {
  user: { name: 'Guest', email: '' },
  superAdmin: false,
  permissions: [],
  orgs: [],
}

async function bootstrap() {
  try {
    const res = await fetch('/api/user/session')
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const result = await res.json()
    const payload = result.data ?? result
    useSessionStore.getState().setSession(payload)
  } catch (err) {
    console.error(
      '[SessionInitializer] 会话数据加载失败，将以默认最小权限继续运行:',
      err
    )
    useSessionStore.getState().setSession(defaultSession)
  }

  const rootElement = document.getElementById('root')!
  if (!rootElement.innerHTML) {
    const router = createAppRouter()
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <NavigationProgress router={router} />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>
    )
    document.getElementById('app-loading')?.remove()
  }
}

bootstrap()
