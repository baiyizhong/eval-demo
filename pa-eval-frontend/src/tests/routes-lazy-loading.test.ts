import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const lazyPagesSource = readFileSync('src/routes/lazy-pages.tsx', 'utf8')
const rootLayoutSource = readFileSync(
  'src/components/layout/root-layout.tsx',
  'utf8'
)

test('business route pages are loaded with React.lazy', () => {
  assert.match(lazyPagesSource, /const TraceLogs = lazy\(\(\) =>/)
  assert.match(
    lazyPagesSource,
    /import\('@\/modules\/app-observability\/views\/trace-logs'\)/
  )
  assert.match(lazyPagesSource, /const ProjectDatasets = lazy\(\(\) =>/)
  assert.match(
    lazyPagesSource,
    /import\('@\/modules\/app-evaluation\/views\/datasets'\)/
  )
  assert.match(lazyPagesSource, /const ScheduledJobs = lazy\(\(\) =>/)
  assert.match(lazyPagesSource, /import\('@\/modules\/scheduled-jobs'\)/)
  assert.match(lazyPagesSource, /const BackendManagement = lazy\(\(\) =>/)
  assert.doesNotMatch(
    lazyPagesSource,
    /import \{ TraceLogs \} from '@\/modules\/app-observability\/views\/trace-logs'/
  )
  assert.doesNotMatch(
    lazyPagesSource,
    /import \{ BackendManagement \} from '@\/modules\/system-pages'/
  )
})

test('root layout shows the shared loading state while route chunks load', () => {
  assert.match(
    rootLayoutSource,
    /<Suspense[\s\S]*?<Outlet \/>[\s\S]*?<\/Suspense>/
  )
  assert.match(rootLayoutSource, /<Loading[\s\S]*?text='页面加载中\.\.\.'/)
})
