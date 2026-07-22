import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/common/confirm-provider'
import { Loading } from '@/components/common/loading'

export function RootLayout() {
  return (
    <>
      <Suspense
        fallback={
          <Loading
            text='页面加载中...'
            className='min-h-svh rounded-none border-0'
          />
        }
      >
        <Outlet />
      </Suspense>
      <ConfirmProvider />
      <Toaster duration={1800} visibleToasts={1} />
    </>
  )
}
