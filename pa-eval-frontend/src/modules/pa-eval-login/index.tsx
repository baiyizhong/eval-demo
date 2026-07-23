import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { env } from '@/config/env'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { IconGithub } from '@/assets/brand-icons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getAuthOptions,
  loginWithEnterprisePassword,
  type AuthProviderOption,
} from './auth-api'
import { buildAuthLoginUrl } from './login-url'

const errorMessages: Record<string, string> = {
  github_auth_failed: 'GitHub 授权未完成，请重新发起登录。',
  sso_auth_failed: '企业 SSO 授权未完成，请重新发起登录。',
  user_not_found: '当前邮箱未匹配到平台账号，请联系管理员开通。',
  github_config_missing: 'GitHub 登录暂不可用，请联系管理员检查 OAuth 配置。',
  session_config_missing: '登录会话暂不可用，请联系管理员检查认证密钥配置。',
}

function hasProvider(
  providers: AuthProviderOption[],
  id: AuthProviderOption['id']
) {
  return providers.some((provider) => provider.id === id)
}

export function Login() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [providers, setProviders] = useState<AuthProviderOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const error = searchParams.get('error')
  const errorMessage = error ? errorMessages[error] : null
  const githubLoginUrl = useMemo(
    () => buildAuthLoginUrl('github', env.apiBaseURL, env.authBaseURL),
    []
  )
  const oidcLoginUrl = useMemo(
    () => buildAuthLoginUrl('oidc', env.apiBaseURL, env.authBaseURL),
    []
  )
  const enterprisePasswordEnabled = hasProvider(
    providers,
    'enterprise_password'
  )
  const oidcEnabled = hasProvider(providers, 'oidc')
  const githubEnabled = hasProvider(providers, 'github')
  const noProviderAvailable = !optionsLoading && providers.length === 0

  useEffect(() => {
    void getAuthOptions()
      .then((data) => {
        setProviders(data.providers)
        setOptionsError(false)
      })
      .catch(() => {
        setProviders([])
        setOptionsError(true)
      })
      .finally(() => {
        setOptionsLoading(false)
      })
  }, [])

  const handleEnterpriseLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      const result = await loginWithEnterprisePassword({ username, password })
      navigate(result.redirectTo || '/environment', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

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
              <div className='bg-background text-muted-foreground inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-xs'>
                <ShieldCheck className='text-primary size-3.5' />
                Enterprise Auth Gateway
              </div>
              <div className='flex flex-col gap-3'>
                <h1 className='text-3xl font-semibold tracking-normal md:text-4xl'>
                  登录后进入评测工作台
                </h1>
                <p className='text-muted-foreground max-w-lg text-sm leading-6'>
                  认证能力由 PA Eval Login
                  模块统一承载，业务模块只消费会话与权限结果。
                </p>
              </div>
            </div>
          </div>

          <div className='grid gap-3 pt-8 sm:grid-cols-3'>
            {['身份源适配', '统一会话', '权限闭环'].map((item) => (
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
                选择企业账号、企业 SSO 或 OAuth 继续访问 PA Eval。
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
              {optionsLoading ? (
                <div className='text-muted-foreground flex min-h-11 items-center justify-center rounded-md border text-sm'>
                  <Loader2
                    data-icon='inline-start'
                    className='mr-2 animate-spin'
                  />
                  正在读取登录方式
                </div>
              ) : null}

              {noProviderAvailable ? (
                <Alert variant={optionsError ? 'destructive' : 'default'}>
                  <AlertCircle className='size-4' />
                  <AlertTitle>暂无可用登录方式</AlertTitle>
                  <AlertDescription>
                    {optionsError
                      ? '登录配置读取失败，请确认后端服务可访问。'
                      : '已启用的认证方式缺少必要配置，请联系管理员补全。'}
                  </AlertDescription>
                </Alert>
              ) : null}

              {enterprisePasswordEnabled ? (
                <form
                  className='flex flex-col gap-4'
                  onSubmit={handleEnterpriseLogin}
                >
                  <div className='grid gap-2'>
                    <Label htmlFor='enterprise-username'>企业账号</Label>
                    <Input
                      id='enterprise-username'
                      autoComplete='username'
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder='请输入企业账号'
                      required
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label htmlFor='enterprise-password'>密码</Label>
                    <Input
                      id='enterprise-password'
                      type='password'
                      autoComplete='current-password'
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder='请输入密码'
                      required
                    />
                  </div>
                  <Button
                    type='submit'
                    size='lg'
                    className='h-11 w-full'
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2
                        data-icon='inline-start'
                        className='animate-spin'
                      />
                    ) : (
                      <KeyRound data-icon='inline-start' />
                    )}
                    企业账号登录
                    <ArrowRight data-icon='inline-end' />
                  </Button>
                </form>
              ) : null}

              {oidcEnabled ? (
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className='h-11 w-full'
                >
                  <a href={oidcLoginUrl}>
                    <Building2 data-icon='inline-start' />
                    企业 SSO 登录
                    <ArrowRight data-icon='inline-end' />
                  </a>
                </Button>
              ) : null}

              {githubEnabled ? (
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className='h-11 w-full'
                >
                  <a href={githubLoginUrl}>
                    <IconGithub data-icon='inline-start' />
                    GitHub OAuth 登录
                    <ArrowRight data-icon='inline-end' />
                  </a>
                </Button>
              ) : null}

              <div className='bg-muted/30 text-muted-foreground rounded-md border p-3 text-xs leading-5'>
                认证请求由 PA Eval
                后端代理发起，企业密码不会写入前端存储或业务模块。
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
