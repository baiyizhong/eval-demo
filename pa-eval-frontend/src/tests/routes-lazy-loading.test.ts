import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const routesSource = readFileSync('src/routes/index.tsx', 'utf8')
const rootLayoutSource = readFileSync(
  'src/components/layout/root-layout.tsx',
  'utf8'
)

test('business route pages are loaded with React.lazy', () => {
  assert.match(routesSource, /const TraceLogs = lazy\(\(\) =>/)
  assert.match(
    routesSource,
    /import\('@\/modules\/app-observability\/views\/trace-logs'\)/
  )
  assert.match(routesSource, /const ProjectDatasets = lazy\(\(\) =>/)
  assert.match(
    routesSource,
    /import\('@\/modules\/app-evaluation\/views\/datasets'\)/
  )
  assert.match(routesSource, /const ScheduledJobs = lazy\(\(\) =>/)
  assert.match(routesSource, /import\('@\/modules\/scheduled-jobs'\)/)
  assert.match(routesSource, /const BackendManagement = lazy\(\(\) =>/)
  assert.doesNotMatch(
    routesSource,
    /import \{ TraceLogs \} from '@\/modules\/app-observability\/views\/trace-logs'/
  )
  assert.doesNotMatch(
    routesSource,
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
