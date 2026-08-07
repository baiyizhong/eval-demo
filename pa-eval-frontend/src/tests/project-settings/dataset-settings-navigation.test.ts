import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('project settings exposes dataset settings nav item and route', () => {
  const navSource = readFileSync('src/modules/project-settings/nav.tsx', 'utf8')
  const routesSource = readFileSync('src/routes/sidebar-routes.tsx', 'utf8')
  const lazySource = readFileSync('src/routes/lazy-pages.tsx', 'utf8')

  assert.match(navSource, /title:\s*'数据设置'/)
  assert.match(navSource, /href:\s*`\$\{basePath\}\/datasets`/)
  assert.match(navSource, /project:dataset:view/)
  assert.match(routesSource, /path:\s*'datasets'/)
  assert.match(routesSource, /ProjectDatasetSettings/)
  assert.match(lazySource, /ProjectDatasetSettings/)
})

test('dataset settings page renders dataset tab with left aligned tree', () => {
  const source = readFileSync(
    'src/modules/project-settings/views/dataset-settings.tsx',
    'utf8'
  )

  assert.match(source, /title='数据设置'/)
  assert.match(source, /Tabs[^>]+defaultValue='datasets'/)
  assert.match(
    source,
    /TabsList className='h-10 w-full max-w-xl justify-start rounded-none border-b bg-transparent p-0'/
  )
  assert.match(source, /className='[^']*flex-none/)
  assert.match(source, /className='[^']*rounded-none/)
  assert.match(source, /className='[^']*border-0/)
  assert.match(source, /className='[^']*border-b-2/)
  assert.match(source, /className='[^']*bg-transparent/)
  assert.match(source, /className='[^']*px-0/)
  assert.match(source, /data-\[state=active\]:border-primary/)
  assert.match(source, /data-\[state=active\]:bg-transparent/)
  assert.match(source, /data-\[state=active\]:shadow-none/)
  assert.match(source, /value='datasets'/)
  assert.match(source, />\s*数据集[^<]*<\/TabsTrigger>/)
  assert.match(source, /title='新建子目录'/)
  assert.match(source, /aria-label='新建子目录'/)
  assert.match(source, /title='重命名目录'/)
  assert.match(source, /aria-label='重命名目录'/)
  assert.match(source, /title='删除目录'/)
  assert.match(source, /aria-label='删除目录'/)
  assert.doesNotMatch(source, /mx-auto/)
})
