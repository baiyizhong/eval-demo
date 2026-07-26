import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function showSubmittedData(
  data: unknown,
  title: string = 'You submitted the following values:'
) {
  const toastId = toast.message(title, {
    description: (
      <div className='flex flex-col gap-3'>
        <pre className='bg-foreground mt-2 w-full overflow-x-auto rounded-md p-4'>
          <code className='text-background'>
            {JSON.stringify(data, null, 2)}
          </code>
        </pre>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='self-end'
          onClick={() => toast.dismiss(toastId)}
        >
          关闭
        </Button>
      </div>
    ),
  })
}
