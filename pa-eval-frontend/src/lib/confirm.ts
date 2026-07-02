export type ConfirmDialogOptions = {
  title: React.ReactNode
  desc: React.ReactNode
  cancelBtnText?: string
  confirmText?: React.ReactNode
  destructive?: boolean
  className?: string
}

export type ConfirmDialogRequest = {
  id: number
  options: ConfirmDialogOptions
  resolve: (confirmed: boolean) => void
}

type ConfirmDialogListener = (request: ConfirmDialogRequest) => void

let requestId = 0
const listeners = new Set<ConfirmDialogListener>()

export const confirmDialogController = {
  subscribe(listener: ConfirmDialogListener) {
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  },

  emit(request: ConfirmDialogRequest) {
    listeners.forEach((listener) => listener(request))
  },
}

export function confirm(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialogController.emit({
      id: ++requestId,
      options,
      resolve,
    })
  })
}
