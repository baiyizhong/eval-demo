import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppRouter } from '@/router'
import type { UserPermissionPayload } from '@/types/permission'
import { RouterProvider } from 'react-router'
import { usePermissionStore } from '@/stores/permission.store'
import { queryClient } from '@/lib/query-client'
import { NavigationProgress } from '@/components/common/navigation-progress'
import './styles/index.css'

const defaultPermissions: UserPermissionPayload = {
  user: { id: 0, name: 'Guest' },
  superAdmin: false,
  orgs: [],
}

async function bootstrap() {
  try {
    const res = await fetch('/api/permissions')
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const result = await res.json()
    const payload = result.data ?? result
    usePermissionStore.getState().setPermissions(payload)
  } catch (err) {
    console.error(
      '[PermissionInitializer] 权限数据加载失败，权限数据加载失败，将以默认最小权限继续运行:',
      err
    )
    usePermissionStore.getState().setPermissions(defaultPermissions)
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
