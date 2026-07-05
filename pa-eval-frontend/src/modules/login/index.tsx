import { AlertCircle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { IconGithub } from '@/assets/brand-icons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { env } from '@/config/env'

const errorMessages: Record<string, string> = {
  github_auth_failed: 'GitHub 授权未完成，请重新发起登录。',
  user_not_found: '当前 GitHub 邮箱未匹配到平台账号，请联系管理员开通。',
  github_config_missing: 'GitHub 登录暂不可用，请联系管理员检查 OAuth 配置。',
  session_config_missing: '登录会话暂不可用，请联系管理员检查认证密钥配置。',
}

const buildGithubLoginUrl = () => {
  const baseUrl = env.apiBaseURL.endsWith('/')
    ? env.apiBaseURL.slice(0, -1)
    : env.apiBaseURL

  return `${baseUrl}/auth/github/login`
}

export function Login() {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const errorMessage = error ? errorMessages[error] : null
  const githubLoginUrl = useMemo(() => buildGithubLoginUrl(), [])

  return (
    <main className='bg-background text-foreground min-h-svh'>
      <div className='mx-auto grid min-h-svh w-full max-w-6xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[1.05fr_0.95fr] md:px-8 lg:px-10'>
        <section className='flex min-h-[420px] flex-col justify-between rounded-lg border bg-card p-6 shadow-sm md:p-8'>
          <div className='space-y-8'>
            <div className='flex items-center gap-3'>
              <div className='flex size-10 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground'>
                A
              </div>
              <div>
                <div className='text-sm font-medium'>智能评测系统</div>
                <div className='text-xs text-muted-foreground'>
                  PA Eval Enterprise Console
                </div>
              </div>
            </div>

            <div className='max-w-xl space-y-4'>
              <div className='inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground'>
                <ShieldCheck className='size-3.5 text-primary' />
                GitHub OAuth
              </div>
              <div className='space-y-3'>
                <h1 className='text-3xl font-semibold tracking-normal md:text-4xl'>
                  登录后进入评测工作台
                </h1>
                <p className='max-w-lg text-sm leading-6 text-muted-foreground'>
                  使用 GitHub 身份完成认证，进入项目管理、组织管理和评测任务配置。
                </p>
              </div>
            </div>
          </div>

          <div className='grid gap-3 pt-8 sm:grid-cols-3'>
            {['身份认证', '组织上下文', '评测资源'].map((item) => (
              <div
                key={item}
                className='rounded-md border bg-background p-3 text-sm'
              >
                <CheckCircle2 className='mb-3 size-4 text-primary' />
                <div className='font-medium'>{item}</div>
                <div className='mt-1 text-xs text-muted-foreground'>
                  登录后自动启用
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className='flex items-center'>
          <div className='w-full rounded-lg border bg-card p-6 shadow-sm md:p-8'>
            <div className='space-y-2'>
              <h2 className='text-xl font-semibold tracking-normal'>欢迎回来</h2>
              <p className='text-sm text-muted-foreground'>
                选择 GitHub 继续访问 PA Eval。
              </p>
            </div>

            {errorMessage ? (
              <Alert variant='destructive' className='mt-6'>
                <AlertCircle className='size-4' />
                <AlertTitle>登录失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className='mt-8 space-y-4'>
              <Button asChild size='lg' className='h-11 w-full'>
                <a href={githubLoginUrl}>
                  <IconGithub className='size-4' />
                  使用 GitHub 登录
                  <ArrowRight className='size-4' />
                </a>
              </Button>

              <div className='rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground'>
                认证请求将由 PA Eval 后端发起，GitHub Client Secret
                不会暴露到浏览器。
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
