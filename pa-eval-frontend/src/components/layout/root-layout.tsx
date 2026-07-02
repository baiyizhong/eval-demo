import { Outlet } from 'react-router'
import { ConfirmProvider } from '@/components/common/confirm-provider'
import { Toaster } from '@/components/ui/sonner'

export function RootLayout() {
  return (
    <>
      <Outlet />
      <ConfirmProvider />
      <Toaster duration={4000} />
    </>
  )
}
