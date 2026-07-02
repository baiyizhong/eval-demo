import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
}

export function GeneralError({
  className,
  minimal = false,
}: GeneralErrorProps) {
  const navigate = useNavigate()

  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>系统出现异常</span>
        <p className='text-muted-foreground text-center'>
          很抱歉给你带来不便。 <br />
          请稍后再试。
        </p>
        {!minimal && (
          <div className='mt-6 flex gap-4'>
            <Button variant='outline' onClick={() => navigate(-1)}>
              返回上一页
            </Button>
            <Button onClick={() => navigate('/')}>返回首页</Button>
          </div>
        )}
      </div>
    </div>
  )
}
