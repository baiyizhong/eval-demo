import { CircleCheck, X } from 'lucide-react'
import { Link } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export type TraceOperationSuccessNotice = {
  title: string
  summary: string
  linkLabel: string
  to?: string
}

type TraceOperationSuccessAlertProps = {
  notice: TraceOperationSuccessNotice
  onClose: () => void
}

export function TraceOperationSuccessAlert({
  notice,
  onClose,
}: TraceOperationSuccessAlertProps) {
  return (
    <div className='fixed inset-x-4 top-20 z-40 sm:right-6 sm:left-auto sm:w-full sm:max-w-md'>
      <Alert variant='success' className='pr-12 shadow-lg'>
        <CircleCheck />
        <AlertTitle>{notice.title}</AlertTitle>
        <AlertDescription>
          <span>{notice.summary}</span>
          {notice.to ? (
            <Link
              to={notice.to}
              className='focus-visible:ring-ring rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
              onClick={onClose}
            >
              {notice.linkLabel}
            </Link>
          ) : null}
        </AlertDescription>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='absolute top-1.5 right-1.5'
          aria-label='关闭成功提示'
          onClick={onClose}
        >
          <X data-icon='inline-start' />
        </Button>
      </Alert>
    </div>
  )
}
