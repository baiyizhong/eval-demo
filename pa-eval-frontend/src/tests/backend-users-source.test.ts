import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const topbarRoutesSource = readFileSync('src/routes/topbar-routes.tsx', 'utf8')
const systemPagesSource = readFileSync(
  'src/modules/system-pages/index.tsx',
  'utf8'
)
const systemApiSource = readFileSync(
  'src/modules/system-pages/api/index.ts',
  'utf8'
)

test('backend management uses sidebar subpages for overview and users', () => {
  assert.match(topbarRoutesSource, /path:\s*'backend'[\s\S]*children:/)
  assert.match(topbarRoutesSource, /Navigate to='overview'/)
  assert.match(topbarRoutesSource, /path:\s*'users'/)
  assert.match(systemPagesSource, /SidebarNav/)
  assert.match(systemPagesSource, /后台分组/)
})

test('backend users page exposes detail drawer and admin-only mutation actions', () => {
  assert.match(systemPagesSource, /BackendUsers/)
  assert.match(systemPagesSource, /UserRoleBindingsDrawer/)
  assert.match(systemPagesSource, /getAdminUserRoleBindings/)
  assert.match(systemPagesSource, /patchAdminUserAdmin/)
  assert.match(systemPagesSource, /唯一可操作字段/)
  assert.doesNotMatch(systemPagesSource, /页面权限/)
})

test('system page api registers backend user endpoints', () => {
  assert.match(systemApiSource, /listAdminUsers/)
  assert.match(systemApiSource, /getAdminUserRoleBindings/)
  assert.match(systemApiSource, /patchAdminUserAdmin/)
})
