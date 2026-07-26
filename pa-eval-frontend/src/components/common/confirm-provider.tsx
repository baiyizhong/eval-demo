import { useEffect, useRef, useState } from 'react'
import {
  confirmDialogController,
  type ConfirmDialogRequest,
} from '@/lib/confirm'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

const CLOSE_ANIMATION_MS = 200

export function ConfirmProvider() {
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null)
  const [open, setOpen] = useState(false)
  const requestRef = useRef<ConfirmDialogRequest | null>(null)
  const queuedRequests = useRef<ConfirmDialogRequest[]>([])
  const settledRequestIds = useRef(new Set<number>())
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return confirmDialogController.subscribe((nextRequest) => {
      settledRequestIds.current.delete(nextRequest.id)

      if (requestRef.current) {
        queuedRequests.current.push(nextRequest)
        return
      }

      requestRef.current = nextRequest
      setRequest(nextRequest)
      setOpen(true)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current)
      }
    }
  }, [])

  const settle = (confirmed: boolean) => {
    const currentRequest = requestRef.current

    if (!currentRequest || settledRequestIds.current.has(currentRequest.id)) {
      return
    }

    settledRequestIds.current.add(currentRequest.id)
    currentRequest.resolve(confirmed)
    setOpen(false)

    closeTimer.current = setTimeout(() => {
      const nextRequest = queuedRequests.current.shift() ?? null
      requestRef.current = nextRequest
      setRequest(nextRequest)

      if (nextRequest) {
        setOpen(true)
      }
    }, CLOSE_ANIMATION_MS)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          settle(false)
        }
      }}
      title={request?.options.title ?? ''}
      desc={request?.options.desc ?? ''}
      cancelBtnText={request?.options.cancelBtnText}
      confirmText={request?.options.confirmText}
      destructive={request?.options.destructive}
      className={request?.options.className}
      handleConfirm={() => settle(true)}
    />
  )
}
