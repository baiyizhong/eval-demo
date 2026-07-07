import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const mockRoot = new URL('../../mock', import.meta.url)
const realApiRoutePatterns = [
  '/api/organizations',
  '/api/projects',
  '/api/sidebar',
]

test('mock mode does not intercept real organization project and sidebar APIs', () => {
  const offenders: string[] = []

  for (const filePath of walk(mockRoot.pathname)) {
    const content = readFileSync(filePath, 'utf8')
    for (const route of realApiRoutePatterns) {
      if (content.includes(route)) {
        offenders.push(`${filePath}: ${route}`)
      }
    }
  }

  assert.deepEqual(offenders, [])
})

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
