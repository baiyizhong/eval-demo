import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

export function ForbiddenError() {
  const navigate = useNavigate()

  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>403</h1>
        <span className='font-medium'>禁止访问</span>
        <p className='text-muted-foreground text-center'>
          你没有查看该资源所需的权限。
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => navigate(-1)}>
            返回上一页
          </Button>
          <Button onClick={() => navigate('/')}>返回首页</Button>
        </div>
      </div>
    </div>
  )
}
