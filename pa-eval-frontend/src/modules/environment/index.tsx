import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useEnvironmentStore } from '@/stores/environment-store'
import { useOrganizationStore } from '@/stores/organization.store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { environmentOptions } from './environment-options'
import { getEnvironmentPageRedirectPath } from './environment-routing'

export function EnvironmentSelect() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((state) => state.auth.accessToken)
  const environmentCode = useEnvironmentStore((state) => state.environmentCode)
  const setEnvironmentCode = useEnvironmentStore(
    (state) => state.setEnvironmentCode
  )
  const resetOrganizations = useOrganizationStore(
    (state) => state.resetOrganizations
  )

  const handleSelect = (code: (typeof environmentOptions)[number]['code']) => {
    setEnvironmentCode(code)
    resetOrganizations()
    queryClient.clear()
    navigate('/apps', { replace: true })
  }
  const redirectPath = getEnvironmentPageRedirectPath(accessToken)

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />
  }

  return (
    <main className='bg-background text-foreground min-h-svh'>
      <div className='mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-center gap-8 px-4 py-8 md:px-8 lg:px-10'>
        <section className='flex max-w-3xl flex-col gap-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-md text-sm font-semibold'>
              A
            </div>
            <div>
              <div className='text-sm font-medium'>智能评测系统</div>
              <div className='text-muted-foreground text-xs'>
                PA Eval Enterprise Console
              </div>
            </div>
          </div>
          <div className='flex flex-col gap-3'>
            <h1 className='text-3xl font-semibold tracking-normal md:text-4xl'>
              选择工作环境
            </h1>
            <p className='text-muted-foreground max-w-2xl text-sm leading-6'>
              登录成功后先确认本次进入的业务环境，再进入组织和项目管理。
            </p>
          </div>
        </section>

        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {environmentOptions.map((option) => {
            const Icon = option.icon
            const selected = option.code === environmentCode

            return (
              <Card
                key={option.code}
                className={cn(
                  'group hover:border-primary/60 hover:bg-muted/20 min-h-56 transition-colors',
                  selected && 'border-primary bg-primary/5'
                )}
              >
                <CardHeader className='flex flex-row items-start justify-between gap-3'>
                  <div className='bg-background text-primary flex size-11 items-center justify-center rounded-md border'>
                    <Icon className='size-5' />
                  </div>
                  {selected ? (
                    <CheckCircle2 className='text-primary size-5' />
                  ) : null}
                </CardHeader>
                <CardContent className='flex flex-1 flex-col gap-4'>
                  <div className='flex flex-col gap-2'>
                    <CardTitle className='text-lg'>{option.name}</CardTitle>
                    <CardDescription className='text-sm leading-6'>
                      {option.description}
                    </CardDescription>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type='button'
                    variant='ghost'
                    className='text-primary w-full justify-start px-0 hover:px-2'
                    onClick={() => handleSelect(option.code)}
                  >
                    进入环境
                    <ArrowRight
                      data-icon='inline-end'
                      className='transition-transform group-hover:translate-x-0.5'
                    />
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </section>

        <div className='flex justify-start'>
          <Button
            variant='outline'
            type='button'
            onClick={() => navigate('/login', { replace: true })}
          >
            返回登录页
          </Button>
        </div>
      </div>
    </main>
  )
}
