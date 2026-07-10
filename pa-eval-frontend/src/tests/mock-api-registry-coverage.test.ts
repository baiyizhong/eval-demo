import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

type RegistryEndpoint = {
  alias: string
  method: string
  url: string
  responseType?: string
}

const mockRoot = new URL('../../mock', import.meta.url)
const sourceRoot = new URL('../', import.meta.url)
const apiDefinitionFiles = [
  'api/registry.ts',
  'modules/organization-management/api/index.ts',
  'modules/system-pages/api/index.ts',
  'modules/app-observability/api/index.ts',
]
const extraMockEndpoints: RegistryEndpoint[] = [
  {
    alias: 'githubLogin',
    method: 'GET',
    url: '/auth/github/login',
  },
]

test('mock routes cover every non-download API registry endpoint', () => {
  const mockRoutes = readMockRoutes()
  const missing = [...readRegistryEndpoints(), ...extraMockEndpoints]
    .filter((endpoint) => endpoint.responseType !== 'blob')
    .filter((endpoint) => !hasMockRoute(mockRoutes, endpoint))
    .map((endpoint) => {
      return `${endpoint.alias}: ${endpoint.method.toUpperCase()} /api${endpoint.url}`
    })

  assert.deepEqual(missing, [])
})

function readRegistryEndpoints(): RegistryEndpoint[] {
  return apiDefinitionFiles.flatMap((filePath) => {
    const content = readFileSync(join(sourceRoot.pathname, filePath), 'utf8')
    const endpointRe =
      /(\w+):\s*{\s*method:\s*'(\w+)',\s*url:\s*'([^']+)'(?:,\s*responseType:\s*'([^']+)')?/g
    const endpoints: RegistryEndpoint[] = []
    let match: RegExpExecArray | null

    while ((match = endpointRe.exec(content))) {
      endpoints.push({
        alias: match[1],
        method: match[2],
        url: match[3],
        responseType: match[4],
      })
    }

    return endpoints
  })
}

function readMockRoutes(): string {
  return walk(mockRoot.pathname)
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')
}

function hasMockRoute(mockRoutes: string, endpoint: RegistryEndpoint): boolean {
  const fullPath = `/api${endpoint.url}`
  const method = endpoint.method.toLowerCase()

  return (
    mockRoutes.includes(`url: '${fullPath}'`) &&
    mockRoutes.includes(`method: '${method}'`)
  )
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const filePath = join(dir, name)
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        return walk(filePath)
      }
      return filePath
    })
    .filter((filePath) => /\.(ts|mjs)$/.test(filePath))
}
