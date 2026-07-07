import { useMemo } from 'react'
import { env } from '@/config/env'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { useSearchParams } from 'react-router'
import { IconGithub } from '@/assets/brand-icons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { buildGithubLoginUrl } from './login-url'

const errorMessages: Record<string, string> = {
  github_auth_failed: 'GitHub 授权未完成，请重新发起登录。',
  user_not_found: '当前 GitHub 邮箱未匹配到平台账号，请联系管理员开通。',
  github_config_missing: 'GitHub 登录暂不可用，请联系管理员检查 OAuth 配置。',
  session_config_missing: '登录会话暂不可用，请联系管理员检查认证密钥配置。',
}

export function Login() {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const errorMessage = error ? errorMessages[error] : null
  const githubLoginUrl = useMemo(
    () => buildGithubLoginUrl(env.apiBaseURL, env.authBaseURL),
    []
  )

  return (
    <main className='bg-background text-foreground min-h-svh'>
      <div className='mx-auto grid min-h-svh w-full max-w-6xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[1.05fr_0.95fr] md:px-8 lg:px-10'>
        <section className='bg-card flex min-h-[420px] flex-col justify-between rounded-lg border p-6 shadow-sm md:p-8'>
          <div className='flex flex-col gap-8'>
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

            <div className='flex max-w-xl flex-col gap-4'>
              <div className='bg-background text-muted-foreground inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs'>
                <ShieldCheck className='text-primary size-3.5' />
                GitHub OAuth
              </div>
              <div className='flex flex-col gap-3'>
                <h1 className='text-3xl font-semibold tracking-normal md:text-4xl'>
                  登录后进入评测工作台
                </h1>
                <p className='text-muted-foreground max-w-lg text-sm leading-6'>
                  使用 GitHub
                  身份完成认证，进入项目管理、组织管理和评测任务配置。
                </p>
              </div>
            </div>
          </div>

          <div className='grid gap-3 pt-8 sm:grid-cols-3'>
            {['身份认证', '组织上下文', '评测资源'].map((item) => (
              <div
                key={item}
                className='bg-background rounded-md border p-3 text-sm'
              >
                <CheckCircle2 className='text-primary mb-3 size-4' />
                <div className='font-medium'>{item}</div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  登录后自动启用
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className='flex items-center'>
          <div className='bg-card w-full rounded-lg border p-6 shadow-sm md:p-8'>
            <div className='flex flex-col gap-2'>
              <h2 className='text-xl font-semibold tracking-normal'>
                欢迎回来
              </h2>
              <p className='text-muted-foreground text-sm'>
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

            <div className='mt-8 flex flex-col gap-4'>
              <Button asChild size='lg' className='h-11 w-full'>
                <a href={githubLoginUrl}>
                  <IconGithub data-icon='inline-start' />
                  使用 GitHub 登录
                  <ArrowRight data-icon='inline-end' />
                </a>
              </Button>

              <div className='bg-muted/30 text-muted-foreground rounded-md border p-3 text-xs leading-5'>
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
