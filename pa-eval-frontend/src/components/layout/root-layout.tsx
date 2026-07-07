import { Outlet } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/common/confirm-provider'

export function RootLayout() {
  return (
    <>
      <Outlet />
      <ConfirmProvider />
      <Toaster duration={4000} />
    </>
  )
}
