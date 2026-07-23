import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppRouter } from '@/router'
import { RouterProvider } from 'react-router'
import { loadCurrentSession } from '@/modules/pa-eval-login/session'
import { queryClient } from '@/lib/query-client'
import { NavigationProgress } from '@/components/common/navigation-progress'
import './styles/index.css'

async function bootstrap() {
  await loadCurrentSession()

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
