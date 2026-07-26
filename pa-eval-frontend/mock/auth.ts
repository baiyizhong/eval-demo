const authCookieName =
  process.env.VITE_AUTH_COOKIE_NAME || 'thisisjustarandomstring'

function createMockAccessToken() {
  const payload = {
    provider: 'github',
    sub: 'mock-github-user',
    login: 'mock-user',
    langfuseUserId: 'user_admin',
    email: 'admin@example.com',
    name: '测试用户',
    iat: Math.floor(Date.now() / 1000),
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )
  return `pa.${encoded}.mock-signature`
}

export default [
  {
    url: '/api/auth/github/login',
    method: 'get',
    rawResponse: (_req: any, res: any) => {
      res.statusCode = 302
      res.setHeader('Location', '/')
      res.setHeader(
        'Set-Cookie',
        `${authCookieName}=${createMockAccessToken()}; Path=/; Max-Age=86400; SameSite=Lax`
      )
      res.end()
    },
  },
]
