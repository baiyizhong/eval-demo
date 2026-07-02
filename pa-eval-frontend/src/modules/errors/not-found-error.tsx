import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundError() {
  const navigate = useNavigate()

  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>404</h1>
        <span className='font-medium'>页面未找到</span>
        <p className='text-muted-foreground text-center'>
          你访问的页面不存在，或已被移除。
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
