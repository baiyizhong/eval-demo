# Dataset Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `@headless-tree` based tree component, add project dataset directory settings, and add a left dataset tree selector to the dataset item list page in mock frontend mode.

**Architecture:** Add `@headless-tree/core` and `@headless-tree/react`, then wrap them in project UI primitives and a business-neutral `TreeView`. Mock API stores dataset directories and `DatasetRecord.directoryId`; project settings manages folder nodes, while dataset detail uses the tree as an in-place dataset selector.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/Radix UI, React Query, React Router 8, `@headless-tree/core`, `@headless-tree/react`, `node:test`.

---

## Scope And Constraints

- Only modify `pa-eval-frontend/` frontend code plus plan/spec docs.
- Do not modify `langfuse/` or `dify/`.
- Do not run `git commit` unless the user explicitly asks. This overrides the generic skill recommendation for frequent commits.
- Use `npm run dev:mock` behavior as the data target; no backend work.
- Use existing `toast`, `confirm`, `ConfirmDialog`, `DatasetFormDrawer`, `Page`, `PageAction`, `ContentSection`, and `DataTable` patterns.
- Put tests under `pa-eval-frontend/src/tests`.

## File Map

Create:

- `pa-eval-frontend/src/components/reui/tree.tsx`: low-level tree UI primitives exported as `Tree`, `TreeItem`, `TreeItemLabel`.
- `pa-eval-frontend/src/components/common/tree-view.tsx`: reusable controlled tree composition using `@headless-tree`.
- `pa-eval-frontend/src/modules/app-evaluation/components/dataset-tree-panel.tsx`: business adapter for directories + datasets.
- `pa-eval-frontend/src/modules/project-settings/views/dataset-settings.tsx`: project settings dataset directory page.
- `pa-eval-frontend/src/modules/app-evaluation/lib/dataset-tree.ts`: pure helpers for building tree nodes, filtering, selecting defaults, and computing moves.
- `pa-eval-frontend/src/tests/app-evaluation/dataset-tree-utils.test.ts`: helper tests.
- `pa-eval-frontend/src/tests/app-evaluation/dataset-directory-api.test.ts`: API wrapper tests.
- `pa-eval-frontend/src/tests/project-settings/dataset-settings-navigation.test.ts`: route/nav source tests.
- `pa-eval-frontend/src/tests/app-evaluation/dataset-detail-tree-source.test.ts`: source-level behavior guard for detail integration.

Modify:

- `pa-eval-frontend/package.json` and `pa-eval-frontend/package-lock.json`: add `@headless-tree/core` and `@headless-tree/react`.
- `pa-eval-frontend/src/modules/app-evaluation/types.ts`: add `DatasetDirectoryRecord`, `DatasetTreeNode`, and `DatasetRecord.directoryId`.
- `pa-eval-frontend/src/api/registry.ts`: register dataset directory endpoints.
- `pa-eval-frontend/src/modules/app-evaluation/api/dataset-api.ts`: add directory API wrappers and allow `directoryId` in dataset form input.
- `pa-eval-frontend/mock/_data.ts`: seed `datasetDirectories` and add `directoryId` to datasets.
- `pa-eval-frontend/mock/datasets.ts`: implement mock directory routes and dataset `directoryId` handling.
- `pa-eval-frontend/src/routes/lazy-pages.tsx`: add lazy export for `ProjectDatasetSettings`.
- `pa-eval-frontend/src/routes/sidebar-routes.tsx`: add settings child route.
- `pa-eval-frontend/src/modules/project-settings/nav.tsx`: add “数据集设置”.
- `pa-eval-frontend/src/modules/app-evaluation/views/dataset-detail.tsx`: integrate left tree, current dataset selection, dataset create/edit/delete from tree, and empty table behavior.

## Task 1: Add Dependency And Type/API Contract Tests

**Files:**

- Modify: `pa-eval-frontend/package.json`
- Modify: `pa-eval-frontend/package-lock.json`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/dataset-api.ts`
- Modify: `pa-eval-frontend/src/api/registry.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/dataset-directory-api.test.ts`

- [ ] **Step 1: Install tree dependencies**

Run from `pa-eval-frontend/`:

```bash
npm install @headless-tree/core @headless-tree/react
```

Expected: `package.json` and `package-lock.json` include both dependencies. If network is blocked, request escalation for this exact install command.

- [ ] **Step 2: Write failing API wrapper tests**

Create `src/tests/app-evaluation/dataset-directory-api.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProjectDatasetDirectory,
  deleteProjectDatasetDirectory,
  listProjectDatasetDirectories,
  updateProjectDatasetDirectory,
  updateProjectDatasetDirectoryOrder,
} from '../../modules/app-evaluation/api/dataset-api.ts'

test('dataset directory wrappers call project scoped endpoints', async () => {
  const calls: unknown[] = []
  const api = {
    async getProjectDatasetDirectories(options: unknown) {
      calls.push(['list', options])
      return [{ id: 'dir-1' }]
    },
    async createProjectDatasetDirectory(options: unknown) {
      calls.push(['create', options])
      return { id: 'dir-2' }
    },
    async updateProjectDatasetDirectory(options: unknown) {
      calls.push(['update', options])
      return { id: 'dir-1' }
    },
    async deleteProjectDatasetDirectory(options: unknown) {
      calls.push(['delete', options])
      return { id: 'dir-1' }
    },
    async updateProjectDatasetDirectoryOrder(options: unknown) {
      calls.push(['order', options])
      return [{ id: 'dir-1' }]
    },
  }

  await listProjectDatasetDirectories(api as never, 'project-1')
  await createProjectDatasetDirectory(api as never, 'project-1', {
    name: '一级目录',
    parentId: null,
  })
  await updateProjectDatasetDirectory(api as never, 'project-1', 'dir-1', {
    name: '重命名目录',
  })
  await deleteProjectDatasetDirectory(api as never, 'project-1', 'dir-1')
  await updateProjectDatasetDirectoryOrder(api as never, 'project-1', [
    { id: 'dir-1', parentId: null, order: 0 },
  ])

  assert.deepEqual(calls, [
    ['list', { path: { projectId: 'project-1' } }],
    [
      'create',
      {
        path: { projectId: 'project-1' },
        body: { name: '一级目录', parentId: null },
      },
    ],
    [
      'update',
      {
        path: { projectId: 'project-1', directoryId: 'dir-1' },
        body: { name: '重命名目录' },
      },
    ],
    [
      'delete',
      { path: { projectId: 'project-1', directoryId: 'dir-1' } },
    ],
    [
      'order',
      {
        path: { projectId: 'project-1' },
        body: { directories: [{ id: 'dir-1', parentId: null, order: 0 }] },
      },
    ],
  ])
})
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-directory-api.test.ts
```

Expected: fail because exported directory wrapper functions do not exist.

- [ ] **Step 4: Add types**

In `src/modules/app-evaluation/types.ts`, add:

```ts
export type DatasetDirectoryRecord = {
  id: string
  projectId: string
  parentId: string | null
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export type DatasetDirectoryFormInput = {
  name: string
  parentId: string | null
}

export type DatasetDirectoryUpdateInput = Partial<DatasetDirectoryFormInput>

export type DatasetDirectoryOrderInput = {
  id: string
  parentId: string | null
  order: number
}
```

Update `DatasetRecord`:

```ts
export type DatasetRecord = {
  id: string
  projectId: string
  directoryId?: string | null
  name: string
  description: string
  type: DatasetType
  metadata: JsonObject & { type: DatasetType }
  inputSchema: JsonObject
  expectedOutputSchema: JsonObject
  itemCount: number
  runCount: number
  createdAt: string
  updatedAt: string
}
```

Update `DatasetFormInput`:

```ts
export type DatasetFormInput = {
  name: string
  type: DatasetType
  description: string
  metadata: JsonObject
  inputSchema: JsonObject
  expectedOutputSchema: JsonObject
  directoryId?: string | null
}
```

- [ ] **Step 5: Register API endpoints**

In `src/api/registry.ts`, add beside dataset endpoints:

```ts
getProjectDatasetDirectories: {
  method: 'GET',
  url: '/projects/:projectId/dataset-directories',
},
createProjectDatasetDirectory: {
  method: 'POST',
  url: '/projects/:projectId/dataset-directories',
},
updateProjectDatasetDirectory: {
  method: 'PATCH',
  url: '/projects/:projectId/dataset-directories/:directoryId',
},
deleteProjectDatasetDirectory: {
  method: 'DELETE',
  url: '/projects/:projectId/dataset-directories/:directoryId',
},
updateProjectDatasetDirectoryOrder: {
  method: 'PATCH',
  url: '/projects/:projectId/dataset-directories/order',
},
```

- [ ] **Step 6: Implement API wrappers**

In `src/modules/app-evaluation/api/dataset-api.ts`, import the new types and extend `DatasetApiClient`:

```ts
getProjectDatasetDirectories: ApiMethod
createProjectDatasetDirectory: ApiMethod
updateProjectDatasetDirectory: ApiMethod
deleteProjectDatasetDirectory: ApiMethod
updateProjectDatasetDirectoryOrder: ApiMethod
```

Add exports:

```ts
export function listProjectDatasetDirectories(
  api: DatasetApiClient,
  projectId: string
) {
  return api.getProjectDatasetDirectories<DatasetDirectoryRecord[]>({
    path: { projectId },
  })
}

export function createProjectDatasetDirectory(
  api: DatasetApiClient,
  projectId: string,
  input: DatasetDirectoryFormInput
) {
  return api.createProjectDatasetDirectory<DatasetDirectoryRecord>({
    path: { projectId },
    body: input,
  })
}

export function updateProjectDatasetDirectory(
  api: DatasetApiClient,
  projectId: string,
  directoryId: string,
  input: DatasetDirectoryUpdateInput
) {
  return api.updateProjectDatasetDirectory<DatasetDirectoryRecord>({
    path: { projectId, directoryId },
    body: input,
  })
}

export function deleteProjectDatasetDirectory(
  api: DatasetApiClient,
  projectId: string,
  directoryId: string
) {
  return api.deleteProjectDatasetDirectory<{ id: string }>({
    path: { projectId, directoryId },
  })
}

export function updateProjectDatasetDirectoryOrder(
  api: DatasetApiClient,
  projectId: string,
  directories: DatasetDirectoryOrderInput[]
) {
  return api.updateProjectDatasetDirectoryOrder<DatasetDirectoryRecord[]>({
    path: { projectId },
    body: { directories },
  })
}
```

- [ ] **Step 7: Verify API wrapper test passes**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-directory-api.test.ts
```

Expected: pass.

- [ ] **Step 8: Checkpoint**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: typecheck passes. Do not commit unless the user asks.

## Task 2: Implement Mock Directory Data And Routes

**Files:**

- Modify: `pa-eval-frontend/mock/_data.ts`
- Modify: `pa-eval-frontend/mock/datasets.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/dataset-directory-mock-source.test.ts`

- [ ] **Step 1: Write source-level mock behavior test**

Create `src/tests/app-evaluation/dataset-directory-mock-source.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('mock data seeds dataset directories and dataset directoryId', () => {
  const source = readFileSync('mock/_data.ts', 'utf8')

  assert.match(source, /datasetDirectories:\s*\[/)
  assert.match(source, /id:\s*'dir_customer_service'/)
  assert.match(source, /directoryId:\s*'dir_customer_service'/)
})

test('mock dataset routes support directory crud and move deleted datasets to uncategorized', () => {
  const source = readFileSync('mock/datasets.ts', 'utf8')

  assert.match(source, /\/api\/projects\/:projectId\/dataset-directories/)
  assert.match(source, /updateProjectDatasetDirectoryOrder|directories/)
  assert.match(source, /directoryId:\s*null/)
  assert.match(source, /collectDescendantDirectoryIds/)
})
```

- [ ] **Step 2: Run failing mock source test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-directory-mock-source.test.ts
```

Expected: fail because mock directory data/routes are not present.

- [ ] **Step 3: Seed directories and dataset directoryId**

In `mock/_data.ts`, add `datasetDirectories` near `datasets`:

```ts
datasetDirectories: [
  {
    id: 'dir_customer_service',
    projectId: 'proj_a',
    parentId: null,
    name: '客服场景',
    order: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'dir_regression',
    projectId: 'proj_a',
    parentId: null,
    name: '回归验证',
    order: 1,
    createdAt: now,
    updatedAt: now,
  },
],
```

Update existing `dataset_qa`:

```ts
directoryId: 'dir_customer_service',
```

- [ ] **Step 4: Add mock helpers**

In `mock/datasets.ts`, add helpers after `withItemCount`:

```ts
const directoryId = (req: any) => pathParam(req, 'directoryId')

const sortDirectories = (directories: any[]) =>
  [...directories].sort((left, right) => {
    if (left.parentId === right.parentId) return left.order - right.order
    return String(left.parentId ?? '').localeCompare(String(right.parentId ?? ''))
  })

const collectDescendantDirectoryIds = (
  directories: any[],
  rootId: string
) => {
  const ids = new Set<string>([rootId])
  let changed = true

  while (changed) {
    changed = false
    for (const directory of directories) {
      if (directory.parentId && ids.has(directory.parentId) && !ids.has(directory.id)) {
        ids.add(directory.id)
        changed = true
      }
    }
  }

  return ids
}
```

- [ ] **Step 5: Add directory mock routes before dataset detail routes**

In `mock/datasets.ts`, add route objects before `/api/projects/:projectId/datasets/:datasetId` entries:

```ts
{
  url: '/api/projects/:projectId/dataset-directories',
  method: 'get',
  response: (req: any) =>
    success(
      sortDirectories(
        db.datasetDirectories.filter(
          (directory) => directory.projectId === projectId(req)
        )
      )
    ),
},
{
  url: '/api/projects/:projectId/dataset-directories',
  method: 'post',
  response: (req: any) => {
    const input = body(req)
    const siblings = db.datasetDirectories.filter(
      (directory) =>
        directory.projectId === projectId(req) &&
        (directory.parentId ?? null) === (input.parentId ?? null)
    )
    const directory = {
      id: id('dir'),
      projectId: projectId(req),
      parentId: input.parentId ?? null,
      name: String(input.name ?? '').trim() || '未命名目录',
      order: siblings.length,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    db.datasetDirectories.push(directory)
    return success(directory)
  },
},
{
  url: '/api/projects/:projectId/dataset-directories/order',
  method: 'patch',
  response: (req: any) => {
    const input = body(req)
    const updates = Array.isArray(input.directories) ? input.directories : []
    for (const update of updates) {
      const index = db.datasetDirectories.findIndex(
        (directory) =>
          directory.projectId === projectId(req) &&
          directory.id === update.id
      )
      if (index >= 0) {
        db.datasetDirectories[index] = {
          ...db.datasetDirectories[index],
          parentId: update.parentId ?? null,
          order: Number(update.order ?? 0),
          updatedAt: nowIso(),
        }
      }
    }
    return success(
      sortDirectories(
        db.datasetDirectories.filter(
          (directory) => directory.projectId === projectId(req)
        )
      )
    )
  },
},
{
  url: '/api/projects/:projectId/dataset-directories/:directoryId',
  method: 'patch',
  response: (req: any) => {
    const input = body(req)
    const index = db.datasetDirectories.findIndex(
      (directory) =>
        directory.projectId === projectId(req) &&
        directory.id === directoryId(req)
    )
    if (index >= 0) {
      db.datasetDirectories[index] = {
        ...db.datasetDirectories[index],
        ...('name' in input ? { name: String(input.name ?? '').trim() } : {}),
        ...('parentId' in input ? { parentId: input.parentId ?? null } : {}),
        updatedAt: nowIso(),
      }
    }
    return success(db.datasetDirectories[index] ?? { id: directoryId(req) })
  },
},
{
  url: '/api/projects/:projectId/dataset-directories/:directoryId',
  method: 'delete',
  response: (req: any) => {
    const ids = collectDescendantDirectoryIds(
      db.datasetDirectories.filter(
        (directory) => directory.projectId === projectId(req)
      ),
      directoryId(req)
    )
    db.datasetDirectories = db.datasetDirectories.filter(
      (directory) => !ids.has(directory.id)
    )
    db.datasets = db.datasets.map((dataset) =>
      dataset.projectId === projectId(req) && ids.has(dataset.directoryId)
        ? { ...dataset, directoryId: null, updatedAt: nowIso() }
        : dataset
    )
    return success({ id: directoryId(req) })
  },
},
```

- [ ] **Step 6: Preserve dataset directoryId in mock dataset create/update**

In mock dataset create route, add:

```ts
directoryId: input.directoryId ?? null,
```

The existing patch route spreads `body(req)` and will preserve updates. Ensure list/detail responses use `withItemCount` so `directoryId` remains present.

- [ ] **Step 7: Verify mock source tests**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-directory-mock-source.test.ts
```

Expected: pass.

## Task 3: Add Pure Dataset Tree Helpers

**Files:**

- Create: `pa-eval-frontend/src/modules/app-evaluation/lib/dataset-tree.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/dataset-tree-utils.test.ts`

- [ ] **Step 1: Write helper tests**

Create `src/tests/app-evaluation/dataset-tree-utils.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildDatasetTreeNodes,
  getNextDatasetId,
  getVisibleTreeNodeIds,
} from '../../modules/app-evaluation/lib/dataset-tree.ts'

const directories = [
  {
    id: 'dir-a',
    projectId: 'project-1',
    parentId: null,
    name: '一级目录',
    order: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'dir-b',
    projectId: 'project-1',
    parentId: 'dir-a',
    name: '子目录',
    order: 0,
    createdAt: '',
    updatedAt: '',
  },
]

const datasets = [
  {
    id: 'dataset-a',
    projectId: 'project-1',
    directoryId: 'dir-b',
    name: '问答集',
    description: '',
    type: 'evaluation' as const,
    metadata: { type: 'evaluation' as const },
    inputSchema: {},
    expectedOutputSchema: {},
    itemCount: 0,
    runCount: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'dataset-free',
    projectId: 'project-1',
    directoryId: null,
    name: '未分类数据集',
    description: '',
    type: 'evaluation' as const,
    metadata: { type: 'evaluation' as const },
    inputSchema: {},
    expectedOutputSchema: {},
    itemCount: 0,
    runCount: 0,
    createdAt: '',
    updatedAt: '',
  },
]

test('buildDatasetTreeNodes includes directory nodes, dataset nodes, and uncategorized group', () => {
  const nodes = buildDatasetTreeNodes({ directories, datasets })

  assert.equal(nodes[0].id, 'dir-a')
  assert.equal(nodes.find((node) => node.id === 'dataset-a')?.parentId, 'dir-b')
  assert.equal(
    nodes.find((node) => node.id === 'dataset-free')?.parentId,
    'uncategorized'
  )
})

test('getVisibleTreeNodeIds keeps matching ancestors', () => {
  const nodes = buildDatasetTreeNodes({ directories, datasets })

  assert.deepEqual(getVisibleTreeNodeIds(nodes, '问答').sort(), [
    'dataset-a',
    'dir-a',
    'dir-b',
  ])
})

test('getNextDatasetId chooses current id, first categorized dataset, or first dataset', () => {
  assert.equal(getNextDatasetId(directories, datasets, 'dataset-a'), 'dataset-a')
  assert.equal(getNextDatasetId(directories, datasets, 'missing'), 'dataset-a')
  assert.equal(getNextDatasetId([], [datasets[1]], null), 'dataset-free')
  assert.equal(getNextDatasetId([], [], null), null)
})
```

- [ ] **Step 2: Run failing helper tests**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-tree-utils.test.ts
```

Expected: fail because helper file does not exist.

- [ ] **Step 3: Implement helper file**

Create `src/modules/app-evaluation/lib/dataset-tree.ts`:

```ts
import type {
  DatasetDirectoryRecord,
  DatasetRecord,
} from '../types'

export const UNCATEGORIZED_TREE_NODE_ID = 'uncategorized'

export type DatasetTreeNodeKind = 'folder' | 'dataset'

export type DatasetTreeNode = {
  id: string
  parentId: string | null
  name: string
  kind: DatasetTreeNodeKind
  order: number
  directoryId?: string | null
  datasetId?: string
  virtual?: boolean
}

export function buildDatasetTreeNodes({
  directories,
  datasets,
  includeUncategorized = true,
}: {
  directories: DatasetDirectoryRecord[]
  datasets: DatasetRecord[]
  includeUncategorized?: boolean
}): DatasetTreeNode[] {
  const directoryIds = new Set(directories.map((directory) => directory.id))
  const directoryNodes = [...directories]
    .sort((left, right) => left.order - right.order)
    .map((directory) => ({
      id: directory.id,
      parentId: directory.parentId,
      name: directory.name,
      kind: 'folder' as const,
      order: directory.order,
      directoryId: directory.id,
    }))
  const datasetNodes = datasets.map((dataset, index) => {
    const parentId =
      dataset.directoryId && directoryIds.has(dataset.directoryId)
        ? dataset.directoryId
        : includeUncategorized
          ? UNCATEGORIZED_TREE_NODE_ID
          : null

    return {
      id: dataset.id,
      parentId,
      name: dataset.name,
      kind: 'dataset' as const,
      order: index,
      datasetId: dataset.id,
      directoryId: dataset.directoryId ?? null,
    }
  })
  const hasUncategorizedDatasets = datasetNodes.some(
    (node) => node.parentId === UNCATEGORIZED_TREE_NODE_ID
  )
  const uncategorizedNode =
    includeUncategorized && hasUncategorizedDatasets
      ? [
          {
            id: UNCATEGORIZED_TREE_NODE_ID,
            parentId: null,
            name: '未分类',
            kind: 'folder' as const,
            order: Number.MAX_SAFE_INTEGER,
            directoryId: null,
            virtual: true,
          },
        ]
      : []

  return [...directoryNodes, ...uncategorizedNode, ...datasetNodes]
}

export function getVisibleTreeNodeIds(
  nodes: DatasetTreeNode[],
  keyword: string
) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return nodes.map((node) => node.id)

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visibleIds = new Set<string>()

  for (const node of nodes) {
    if (!node.name.toLowerCase().includes(normalizedKeyword)) continue
    let current: DatasetTreeNode | undefined = node
    while (current) {
      visibleIds.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }

  return [...visibleIds]
}

export function getNextDatasetId(
  directories: DatasetDirectoryRecord[],
  datasets: DatasetRecord[],
  currentDatasetId: string | null | undefined
) {
  if (currentDatasetId && datasets.some((dataset) => dataset.id === currentDatasetId)) {
    return currentDatasetId
  }

  const directoryIds = new Set(directories.map((directory) => directory.id))
  const categorized = datasets.find(
    (dataset) => dataset.directoryId && directoryIds.has(dataset.directoryId)
  )

  return categorized?.id ?? datasets[0]?.id ?? null
}
```

- [ ] **Step 4: Verify helper tests**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-tree-utils.test.ts
```

Expected: pass.

## Task 4: Build Reusable Tree UI Components

**Files:**

- Create: `pa-eval-frontend/src/components/reui/tree.tsx`
- Create: `pa-eval-frontend/src/components/common/tree-view.tsx`
- Create: `pa-eval-frontend/src/tests/app-evaluation/tree-view-source.test.ts`

- [ ] **Step 1: Write source-level tree component test**

Create `src/tests/app-evaluation/tree-view-source.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('tree view uses headless-tree and exposes search/edit/drag extension points', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /@headless-tree\/react/)
  assert.match(source, /@headless-tree\/core/)
  assert.match(source, /searchable/)
  assert.match(source, /editable/)
  assert.match(source, /draggable/)
  assert.match(source, /canDrag/)
  assert.match(source, /canDrop/)
  assert.match(source, /renderActions/)
  assert.match(source, /onMove/)
  assert.match(source, /searchValue\.trim\(\)/)
})

test('reui tree exports expected primitives', () => {
  const source = readFileSync('src/components/reui/tree.tsx', 'utf8')

  assert.match(source, /export function Tree/)
  assert.match(source, /export function TreeItem/)
  assert.match(source, /export function TreeItemLabel/)
})
```

- [ ] **Step 2: Run failing source test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/tree-view-source.test.ts
```

Expected: fail because component files do not exist.

- [ ] **Step 3: Implement `reui/tree.tsx` primitives**

Create `src/components/reui/tree.tsx` with semantic tokens and no business logic:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Tree({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role='tree'
      className={cn('flex min-w-0 flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  )
}

export function TreeItem({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      role='treeitem'
      aria-selected={selected}
      className={cn(
        'group/tree-item flex min-w-0 items-center rounded-md outline-none',
        selected && 'bg-accent text-accent-foreground',
        className
      )}
      {...props}
    />
  )
}

export function TreeItemLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5',
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 4: Implement `TreeView`**

Create `src/components/common/tree-view.tsx`. Keep it controlled, generic, and business-neutral. Use `useTree`, `syncDataLoaderFeature`, and `hotkeysCoreFeature` imports as the dependency proof, but expose only current business props:

```tsx
import { useMemo, useState } from 'react'
import {
  hotkeysCoreFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import {
  ChevronRight,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tree, TreeItem, TreeItemLabel } from '@/components/reui/tree'

export type TreeViewNode = {
  id: string
  parentId: string | null
  name: string
  kind: 'folder' | 'item'
  order: number
  disabled?: boolean
}

export type TreeViewMoveInput = {
  id: string
  parentId: string | null
  order: number
}

type TreeViewProps<TNode extends TreeViewNode> = {
  nodes: TNode[]
  selectedId?: string | null
  searchable?: boolean
  editable?: boolean
  draggable?: boolean
  searchPlaceholder?: string
  createLabel?: string
  emptyText?: string
  selectableKinds?: TNode['kind'][]
  editingId?: string | null
  onEditingIdChange?: (id: string | null) => void
  onSelect?: (node: TNode) => void
  onCreate?: (parentId: string | null) => void
  onRename?: (node: TNode, name: string) => Promise<void> | void
  onDelete?: (node: TNode) => void
  onMove?: (moves: TreeViewMoveInput[]) => Promise<void> | void
  canDrag?: (node: TNode) => boolean
  canDrop?: (args: { node: TNode; parentId: string | null }) => boolean
  renderActions?: (node: TNode) => React.ReactNode
}

export function TreeView<TNode extends TreeViewNode>({
  nodes,
  selectedId,
  searchable = false,
  editable = false,
  draggable = false,
  searchPlaceholder = '搜索名称',
  createLabel,
  emptyText = '暂无数据',
  selectableKinds,
  editingId,
  onEditingIdChange,
  onSelect,
  onCreate,
  onRename,
  renderActions,
}: TreeViewProps<TNode>) {
  const [searchValue, setSearchValue] = useState('')
  const normalizedSearch = searchValue.trim().toLowerCase()
  const filteredNodes = useMemo(
    () => filterNodesWithAncestors(nodes, normalizedSearch),
    [nodes, normalizedSearch]
  )
  const data = useMemo(() => toHeadlessTreeData(filteredNodes), [filteredNodes])
  const tree = useTree({
    rootItemId: 'root',
    getItemName: (item) => data.items[item.getId()]?.name ?? '',
    isItemFolder: (item) => data.items[item.getId()]?.kind === 'folder',
    dataLoader: {
      getItem: (itemId) => data.items[itemId],
      getChildren: (itemId) => data.children[itemId] ?? [],
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  })
  const dragDisabled = !draggable || Boolean(normalizedSearch)

  return (
    <div className='flex min-h-0 flex-col gap-2'>
      {(searchable || createLabel) && (
        <div className='flex items-center gap-2'>
          {searchable ? (
            <Input
              value={searchValue}
              placeholder={searchPlaceholder}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          ) : null}
          {createLabel ? (
            <Button size='sm' onClick={() => onCreate?.(selectedId ?? null)}>
              {createLabel}
            </Button>
          ) : null}
        </div>
      )}
      <Tree className={cn('min-h-0 overflow-auto', dragDisabled && 'cursor-default')}>
        {tree.getItems().length > 0 ? (
          tree.getItems().map((item) => {
            const node = data.items[item.getId()] as TNode | undefined
            if (!node) return null
            const isSelected = selectedId === node.id
            const canSelect =
              !selectableKinds || selectableKinds.includes(node.kind)
            const isEditing = editable && editingId === node.id
            return (
              <TreeViewRow
                key={node.id}
                node={node}
                selected={isSelected}
                editing={isEditing}
                depth={item.getItemMeta().level}
                expanded={item.isExpanded()}
                canSelect={canSelect}
                onToggle={() => item.toggleExpanded()}
                onSelect={() => {
                  if (node.kind === 'folder' && !canSelect) {
                    item.toggleExpanded()
                    return
                  }
                  if (canSelect) onSelect?.(node)
                }}
                onRename={async (name) => {
                  if (!name.trim()) {
                    toast.error('名称不能为空')
                    return
                  }
                  await onRename?.(node, name.trim())
                  onEditingIdChange?.(null)
                }}
                onCancelEdit={() => onEditingIdChange?.(null)}
                actions={renderActions?.(node)}
              />
            )
          })
        ) : (
          <div className='text-muted-foreground px-2 py-6 text-center text-sm'>
            {emptyText}
          </div>
        )}
      </Tree>
    </div>
  )
}

function TreeViewRow<TNode extends TreeViewNode>({
  node,
  selected,
  editing,
  depth,
  expanded,
  canSelect,
  onToggle,
  onSelect,
  onRename,
  onCancelEdit,
  actions,
}: {
  node: TNode
  selected: boolean
  editing: boolean
  depth: number
  expanded: boolean
  canSelect: boolean
  onToggle: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onCancelEdit: () => void
  actions?: React.ReactNode
}) {
  const [draft, setDraft] = useState(node.name)
  const isFolder = node.kind === 'folder'

  return (
    <TreeItem selected={selected}>
      <TreeItemLabel style={{ paddingLeft: `${Math.max(depth - 1, 0) * 16 + 8}px` }}>
        <button
          type='button'
          className='text-muted-foreground flex size-4 shrink-0 items-center justify-center'
          onClick={(event) => {
            event.stopPropagation()
            if (isFolder) onToggle()
          }}
        >
          {isFolder ? (
            <ChevronRight
              className={cn('size-4 transition-transform', expanded && 'rotate-90')}
            />
          ) : null}
        </button>
        {isFolder ? (
          expanded ? <FolderOpenIcon className='size-4 shrink-0' /> : <FolderIcon className='size-4 shrink-0' />
        ) : (
          <FileIcon className='size-4 shrink-0' />
        )}
        {editing ? (
          <Input
            value={draft}
            autoFocus
            className='h-7 min-w-0 flex-1'
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => onRename(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRename(draft)
              if (event.key === 'Escape') onCancelEdit()
            }}
          />
        ) : (
          <button
            type='button'
            className={cn(
              'min-w-0 flex-1 truncate text-left',
              !canSelect && 'cursor-default'
            )}
            onClick={onSelect}
          >
            {node.name}
          </button>
        )}
        {actions ? (
          <div className='ml-auto flex shrink-0 items-center gap-1 opacity-0 group-hover/tree-item:opacity-100 group-focus-within/tree-item:opacity-100'>
            {actions}
          </div>
        ) : null}
      </TreeItemLabel>
    </TreeItem>
  )
}

function filterNodesWithAncestors<TNode extends TreeViewNode>(
  nodes: TNode[],
  keyword: string
) {
  if (!keyword) return nodes
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visibleIds = new Set<string>()

  for (const node of nodes) {
    if (!node.name.toLowerCase().includes(keyword)) continue
    let current: TNode | undefined = node
    while (current) {
      visibleIds.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }

  return nodes.filter((node) => visibleIds.has(node.id))
}

function toHeadlessTreeData<TNode extends TreeViewNode>(nodes: TNode[]) {
  const items: Record<string, TNode> = {}
  const children: Record<string, string[]> = { root: [] }

  for (const node of nodes) {
    items[node.id] = node
    const parentId = node.parentId ?? 'root'
    children[parentId] = children[parentId] ?? []
    children[parentId].push(node.id)
  }

  for (const childIds of Object.values(children)) {
    childIds.sort((leftId, rightId) => {
      const left = items[leftId]
      const right = items[rightId]
      return (left?.order ?? 0) - (right?.order ?? 0)
    })
  }

  return { items, children }
}
```

After writing the file, run typecheck. The implementation contract is that any compile fix stays inside the `useTree` adapter block; the public `TreeView` props listed in this task remain unchanged.

- [ ] **Step 5: Verify source test and typecheck**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/tree-view-source.test.ts
npm run typecheck
```

Expected: source test passes and typecheck passes.

## Task 5: Add Project Settings Dataset Directory Page

**Files:**

- Create: `pa-eval-frontend/src/modules/project-settings/views/dataset-settings.tsx`
- Modify: `pa-eval-frontend/src/modules/project-settings/nav.tsx`
- Modify: `pa-eval-frontend/src/routes/lazy-pages.tsx`
- Modify: `pa-eval-frontend/src/routes/sidebar-routes.tsx`
- Create: `pa-eval-frontend/src/tests/project-settings/dataset-settings-navigation.test.ts`

- [ ] **Step 1: Write navigation and route tests**

Create `src/tests/project-settings/dataset-settings-navigation.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('project settings exposes dataset settings nav item and route', () => {
  const navSource = readFileSync('src/modules/project-settings/nav.tsx', 'utf8')
  const routesSource = readFileSync('src/routes/sidebar-routes.tsx', 'utf8')
  const lazySource = readFileSync('src/routes/lazy-pages.tsx', 'utf8')

  assert.match(navSource, /title:\s*'数据集设置'/)
  assert.match(navSource, /href:\s*`\$\{basePath\}\/datasets`/)
  assert.match(navSource, /project:dataset:view/)
  assert.match(routesSource, /path:\s*'datasets'/)
  assert.match(routesSource, /ProjectDatasetSettings/)
  assert.match(lazySource, /ProjectDatasetSettings/)
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/project-settings/dataset-settings-navigation.test.ts
```

Expected: fail because the nav item and route do not exist.

- [ ] **Step 3: Add lazy route export**

In `src/routes/lazy-pages.tsx`, add:

```tsx
export const ProjectDatasetSettings = lazy(() =>
  import('@/modules/project-settings/views/dataset-settings').then((module) => ({
    default: module.ProjectDatasetSettings,
  }))
)
```

- [ ] **Step 4: Add sidebar route**

In `src/routes/sidebar-routes.tsx`, import `ProjectDatasetSettings` and add under project settings children:

```tsx
{
  path: 'datasets',
  element: (
    <ProjectRouteGuard access='project:dataset:view'>
      <ProjectDatasetSettings />
    </ProjectRouteGuard>
  ),
},
```

- [ ] **Step 5: Add settings nav item**

In `src/modules/project-settings/nav.tsx`, import `FolderTree` from `lucide-react` and add:

```tsx
{
  title: '数据集设置',
  href: `${basePath}/datasets`,
  icon: createElement(FolderTree, { size: 18 }),
  access: 'project:dataset:view',
  scope: { type: 'project', projectId },
},
```

- [ ] **Step 6: Implement dataset settings page**

Create `src/modules/project-settings/views/dataset-settings.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'
import { TreeView, type TreeViewMoveInput } from '@/components/common/tree-view'
import {
  createProjectDatasetDirectory,
  deleteProjectDatasetDirectory,
  listProjectDatasetDirectories,
  updateProjectDatasetDirectory,
  updateProjectDatasetDirectoryOrder,
} from '@/modules/app-evaluation/api/dataset-api'
import type { DatasetDirectoryRecord } from '@/modules/app-evaluation/types'

const DEFAULT_PROJECT_ID = 'project_customer_agent'

export function ProjectDatasetSettings() {
  const { projectId = DEFAULT_PROJECT_ID } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEdit = can('project:dataset:edit')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const queryKey = ['project-dataset-directories', $api, projectId]

  const directoriesQuery = useQuery({
    queryKey,
    queryFn: () => listProjectDatasetDirectories($api, projectId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['project-dataset-directories'] })

  const createMutation = useMutation({
    mutationFn: (parentId: string | null) =>
      createProjectDatasetDirectory($api, projectId, {
        name: '未命名目录',
        parentId,
      }),
    onSuccess: async (directory) => {
      await invalidate()
      setSelectedId(directory.id)
      setEditingId(directory.id)
      toast.success('目录已创建')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateProjectDatasetDirectory($api, projectId, id, { name }),
    onSuccess: async () => {
      await invalidate()
      toast.success('目录已保存')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteProjectDatasetDirectory($api, projectId, id),
    onSuccess: async (_, id) => {
      await invalidate()
      setSelectedId((current) => (current === id ? null : current))
      toast.success('目录已删除，数据集已移动到未分类')
    },
  })

  const orderMutation = useMutation({
    mutationFn: (moves: TreeViewMoveInput[]) =>
      updateProjectDatasetDirectoryOrder($api, projectId, moves),
    onSuccess: async () => {
      await invalidate()
      toast.success('目录顺序已保存')
    },
  })

  const nodes = useMemo(
    () =>
      (directoriesQuery.data ?? []).map((directory) => ({
        id: directory.id,
        parentId: directory.parentId,
        name: directory.name,
        kind: 'folder' as const,
        order: directory.order,
      })),
    [directoriesQuery.data]
  )

  return (
    <ContentSection
      title='数据集设置'
      desc='维护当前项目的数据集目录结构。'
    >
      {directoriesQuery.isLoading ? (
        <Loading text='加载数据集目录中...' className='min-h-40' />
      ) : (
        <TreeView
          nodes={nodes}
          selectedId={selectedId}
          searchable
          editable={canEdit}
          draggable={canEdit}
          createLabel={canEdit ? '新建目录' : undefined}
          editingId={editingId}
          onEditingIdChange={setEditingId}
          onSelect={(node) => setSelectedId(node.id)}
          onCreate={(parentId) => {
            if (!canEdit) return
            void createMutation.mutateAsync(parentId)
          }}
          onRename={(node, name) => {
            if (!canEdit) return
            return renameMutation.mutateAsync({ id: node.id, name })
          }}
          onMove={(moves) => {
            if (!canEdit) return
            return orderMutation.mutateAsync(moves)
          }}
          renderActions={(node) =>
            canEdit ? (
              <>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={(event) => {
                    event.stopPropagation()
                    void createMutation.mutateAsync(node.id)
                  }}
                >
                  <Plus className='size-4' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={(event) => {
                    event.stopPropagation()
                    setEditingId(node.id)
                  }}
                >
                  <Edit2 className='size-4' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleDeleteDirectory(node as DatasetDirectoryRecord)
                  }}
                >
                  <Trash2 className='size-4' />
                </Button>
              </>
            ) : null
          }
        />
      )}
    </ContentSection>
  )

  async function handleDeleteDirectory(directory: { id: string; name: string }) {
    if (
      await confirm({
        title: '删除目录',
        desc: `确定删除目录「${directory.name}」及其子目录吗？目录下的数据集会移动到未分类。`,
        confirmText: '删除',
        destructive: true,
      })
    ) {
      await deleteMutation.mutateAsync(directory.id)
    }
  }
}
```

Define this local node type above the component and use it for `TreeView` nodes so `renderActions` does not need a `DatasetDirectoryRecord` cast:

```ts
type DirectoryTreeNode = {
  id: string
  parentId: string | null
  name: string
  kind: 'folder'
  order: number
}
```

- [ ] **Step 7: Verify navigation test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/project-settings/dataset-settings-navigation.test.ts
npm run typecheck
```

Expected: test and typecheck pass.

## Task 6: Build Dataset Tree Panel Business Component

**Files:**

- Create: `pa-eval-frontend/src/modules/app-evaluation/components/dataset-tree-panel.tsx`
- Create: `pa-eval-frontend/src/tests/app-evaluation/dataset-tree-panel-source.test.ts`

- [ ] **Step 1: Write source-level panel test**

Create `src/tests/app-evaluation/dataset-tree-panel-source.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('dataset tree panel supports directory create and dataset edit/delete hover actions', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-tree-panel.tsx',
    'utf8'
  )

  assert.match(source, /listProjectDatasetDirectories/)
  assert.match(source, /listProjectDatasets/)
  assert.match(source, /buildDatasetTreeNodes/)
  assert.match(source, /UNCATEGORIZED_TREE_NODE_ID/)
  assert.match(source, /onCreateDataset/)
  assert.match(source, /onEditDataset/)
  assert.match(source, /onDeleteDataset/)
  assert.match(source, /selectableKinds=\{\['item'\]\}/)
})
```

- [ ] **Step 2: Run failing panel source test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-tree-panel-source.test.ts
```

Expected: fail because component does not exist.

- [ ] **Step 3: Implement panel component**

Create `src/modules/app-evaluation/components/dataset-tree-panel.tsx`:

```tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/common/loading'
import { TreeView } from '@/components/common/tree-view'
import {
  listProjectDatasetDirectories,
  listProjectDatasets,
} from '../api/dataset-api'
import {
  buildDatasetTreeNodes,
  UNCATEGORIZED_TREE_NODE_ID,
  type DatasetTreeNode,
} from '../lib/dataset-tree'
import type { DatasetRecord } from '../types'

type DatasetTreePanelProps = {
  api: Parameters<typeof listProjectDatasetDirectories>[0]
  projectId: string
  selectedDatasetId: string | null
  canEdit: boolean
  onSelectDataset: (datasetId: string) => void
  onCreateDataset: (directoryId: string | null) => void
  onEditDataset: (dataset: DatasetRecord) => void
  onDeleteDataset: (dataset: DatasetRecord) => void
}

export function DatasetTreePanel({
  api,
  projectId,
  selectedDatasetId,
  canEdit,
  onSelectDataset,
  onCreateDataset,
  onEditDataset,
  onDeleteDataset,
}: DatasetTreePanelProps) {
  const directoriesQuery = useQuery({
    queryKey: ['project-dataset-directories', api, projectId],
    queryFn: () => listProjectDatasetDirectories(api, projectId),
  })
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets-tree', api, projectId],
    queryFn: () =>
      listProjectDatasets(
        api,
        projectId,
        { page: 1, pageSize: 500, keyword: '', filters: {} },
        'all'
      ),
  })
  const datasets = datasetsQuery.data?.datas ?? []
  const datasetById = useMemo(
    () => new Map(datasets.map((dataset) => [dataset.id, dataset])),
    [datasets]
  )
  const nodes = useMemo(
    () =>
      buildDatasetTreeNodes({
        directories: directoriesQuery.data ?? [],
        datasets,
      }).map((node) => ({
        ...node,
        kind: node.kind === 'dataset' ? ('item' as const) : ('folder' as const),
      })),
    [datasets, directoriesQuery.data]
  )

  if (directoriesQuery.isLoading || datasetsQuery.isLoading) {
    return <Loading text='加载数据集目录中...' className='min-h-32' />
  }

  return (
    <TreeView
      nodes={nodes}
      selectedId={selectedDatasetId}
      searchable
      selectableKinds={['item']}
      emptyText='暂无数据集'
      onSelect={(node) => {
        if (node.kind === 'item') onSelectDataset(node.id)
      }}
      renderActions={(node) => {
        const treeNode = node as typeof node & DatasetTreeNode
        if (treeNode.kind === 'folder') {
          if (!canEdit) return null
          return (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7'
              onClick={(event) => {
                event.stopPropagation()
                onCreateDataset(
                  treeNode.id === UNCATEGORIZED_TREE_NODE_ID ? null : treeNode.id
                )
              }}
            >
              <Plus className='size-4' />
            </Button>
          )
        }

        const dataset = datasetById.get(treeNode.id)
        if (!dataset || !canEdit) return null

        return (
          <>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7'
              onClick={(event) => {
                event.stopPropagation()
                onEditDataset(dataset)
              }}
            >
              <Edit2 className='size-4' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7'
              onClick={(event) => {
                event.stopPropagation()
                onDeleteDataset(dataset)
              }}
            >
              <Trash2 className='size-4' />
            </Button>
          </>
        )
      }}
    />
  )
}
```

Use this local API client type for `DatasetTreePanelProps.api`:

```ts
type DatasetTreeApiClient = {
  getProjectDatasetDirectories: Parameters<typeof listProjectDatasetDirectories>[0]['getProjectDatasetDirectories']
  getProjectDatasets: Parameters<typeof listProjectDatasets>[0]['getProjectDatasets']
}
```

If TypeScript cannot index the structural parameter type, define the type explicitly with `ApiMethod` imported from `@/api/types`.

- [ ] **Step 4: Verify panel source test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-tree-panel-source.test.ts
npm run typecheck
```

Expected: source test and typecheck pass.

## Task 7: Integrate Tree Into Dataset Detail Page

**Files:**

- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/dataset-detail.tsx`
- Create: `pa-eval-frontend/src/tests/app-evaluation/dataset-detail-tree-source.test.ts`

- [ ] **Step 1: Write detail integration source test**

Create `src/tests/app-evaluation/dataset-detail-tree-source.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('dataset detail integrates dataset tree selector and keeps empty table behavior', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/views/dataset-detail.tsx',
    'utf8'
  )

  assert.match(source, /DatasetTreePanel/)
  assert.match(source, /treeVisible/)
  assert.match(source, /显示/)
  assert.match(source, /隐藏/)
  assert.match(source, /setEditingDataset/)
  assert.match(source, /createProjectDataset/)
  assert.match(source, /deleteProjectDataset/)
  assert.match(source, /getNextDatasetId/)
  assert.match(source, /effectiveDatasetId/)
  assert.match(source, /emptyText='当前筛选条件下暂无数据项'/)
})
```

- [ ] **Step 2: Run failing integration test**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-detail-tree-source.test.ts
```

Expected: fail because the detail page does not yet include tree integration.

- [ ] **Step 3: Add imports and state**

In `src/modules/app-evaluation/views/dataset-detail.tsx`, add imports:

```tsx
import { Eye, EyeOff } from 'lucide-react'
import {
  checkProjectDatasetNameAvailability,
  createProjectDataset,
  deleteProjectDataset,
  listProjectDatasetDirectories,
  listProjectDatasets,
  updateProjectDataset,
} from '../api/dataset-api'
import { DatasetTreePanel } from '../components/dataset-tree-panel'
import { DatasetFormDrawer } from '../components/dataset-form-drawer'
import { getNextDatasetId } from '../lib/dataset-tree'
import type { DatasetFormInput } from '../types'
```

Avoid duplicate imports by merging with existing dataset-api imports.

Add state:

```tsx
const routeDatasetId = datasetId
const [effectiveDatasetId, setEffectiveDatasetId] = useState(routeDatasetId)
const [treeVisible, setTreeVisible] = useState(true)
const [creatingDirectoryId, setCreatingDirectoryId] = useState<string | null>(null)
const [editingDataset, setEditingDataset] = useState<DatasetRecord | null>(null)
const [deletingDataset, setDeletingDataset] = useState<DatasetRecord | null>(null)
```

Then replace query usage of `datasetId` with `effectiveDatasetId` for detail, metrics, status counts, items, item create/update/archive/delete/export.

- [ ] **Step 4: Add tree data queries and default selection effect**

Add:

```tsx
const directoriesQuery = useQuery({
  queryKey: ['project-dataset-directories', $api, projectId],
  queryFn: () => listProjectDatasetDirectories($api, projectId),
})
const treeDatasetsQuery = useQuery({
  queryKey: ['project-datasets-tree', $api, projectId],
  queryFn: () =>
    listProjectDatasets(
      $api,
      projectId,
      { page: 1, pageSize: 500, keyword: '', filters: {} },
      'all'
    ),
})
```

Add an effect:

```tsx
useEffect(() => {
  const datasets = treeDatasetsQuery.data?.datas ?? []
  const nextDatasetId = getNextDatasetId(
    directoriesQuery.data ?? [],
    datasets,
    effectiveDatasetId
  )

  if (!nextDatasetId) {
    setEffectiveDatasetId('')
    return
  }

  if (nextDatasetId !== effectiveDatasetId) {
    setEffectiveDatasetId(nextDatasetId)
    navigate(`/projects/${projectId}/evaluation/datasets/${nextDatasetId}`, {
      replace: true,
    })
  }
}, [
  directoriesQuery.data,
  effectiveDatasetId,
  navigate,
  projectId,
  treeDatasetsQuery.data,
])
```

- [ ] **Step 5: Add dataset tree create/edit/delete mutations**

Add:

```tsx
const checkDatasetNameAvailability = useCallback(
  (name: string) =>
    checkProjectDatasetNameAvailability($api, projectId, name),
  [$api, projectId]
)

const saveDatasetMutation = useMutation({
  mutationFn: (input: DatasetFormInput) =>
    editingDataset
      ? updateProjectDataset($api, projectId, editingDataset.id, input)
      : createProjectDataset($api, projectId, {
          ...input,
          directoryId: creatingDirectoryId,
        }),
  onSuccess: async (dataset) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project-datasets'] }),
      queryClient.invalidateQueries({ queryKey: ['project-datasets-tree'] }),
      queryClient.invalidateQueries({ queryKey: ['project-dataset'] }),
    ])
    setEditingDataset(null)
    setCreatingDirectoryId(null)
    setEffectiveDatasetId(dataset.id)
    navigate(`/projects/${projectId}/evaluation/datasets/${dataset.id}`)
    toast.success(editingDataset ? '数据集已保存' : '数据集已创建')
  },
})

const deleteDatasetMutation = useMutation({
  mutationFn: (dataset: DatasetRecord) =>
    deleteProjectDataset($api, projectId, dataset.id),
  onSuccess: async (_, deletedDataset) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project-datasets'] }),
      queryClient.invalidateQueries({ queryKey: ['project-datasets-tree'] }),
    ])
    setDeletingDataset(null)
    const remaining = (treeDatasetsQuery.data?.datas ?? []).filter(
      (dataset) => dataset.id !== deletedDataset.id
    )
    const nextDatasetId = getNextDatasetId(
      directoriesQuery.data ?? [],
      remaining,
      null
    )
    setEffectiveDatasetId(nextDatasetId ?? '')
    if (nextDatasetId) {
      navigate(`/projects/${projectId}/evaluation/datasets/${nextDatasetId}`)
    }
    toast.success('数据集已删除')
  },
})
```

- [ ] **Step 6: Add left tree layout and show/hide button**

Wrap the existing right content with a horizontal layout:

```tsx
<div className='flex min-h-0 flex-1 gap-4'>
  {treeVisible ? (
    <aside className='bg-card text-card-foreground flex min-h-0 w-[280px] shrink-0 flex-col rounded-lg border p-3'>
      <DatasetTreePanel
        api={$api}
        projectId={projectId}
        selectedDatasetId={effectiveDatasetId || null}
        canEdit={canEditDataset}
        onSelectDataset={(nextDatasetId) => {
          setEffectiveDatasetId(nextDatasetId)
          navigate(`/projects/${projectId}/evaluation/datasets/${nextDatasetId}`)
        }}
        onCreateDataset={(directoryId) => setCreatingDirectoryId(directoryId)}
        onEditDataset={setEditingDataset}
        onDeleteDataset={setDeletingDataset}
      />
    </aside>
  ) : null}
  <div className='flex min-w-0 flex-1 flex-col gap-4'>
    {/* existing PageAction, detail summary, and DataTable move here */}
  </div>
</div>
```

Add show/hide button to `PageAction.buttonGroups.buttons` before create item:

```tsx
{
  id: 'toggle-tree',
  label: treeVisible ? '隐藏' : '显示',
  icon: treeVisible ? EyeOff : Eye,
  iconPosition: 'start',
  variant: 'outline',
  size: 'sm',
  onClick: () => setTreeVisible((visible) => !visible),
},
```

- [ ] **Step 7: Keep empty list behavior when no dataset is selected**

Ensure `DataTable` remains mounted and uses:

```tsx
request={{
  queryKey: (state) => [
    'project-dataset-items',
    $api,
    projectId,
    effectiveDatasetId,
    state,
  ],
  queryFn: (state) =>
    effectiveDatasetId
      ? listProjectDatasetItems($api, projectId, effectiveDatasetId, state)
      : Promise.resolve({ total: 0, datas: [] }),
  enabled: true,
}}
emptyText='当前筛选条件下暂无数据项'
```

Skip detail and metric sections when `dataset` or `metrics` is absent.

- [ ] **Step 8: Add dataset form drawer and delete confirm**

Near existing `DatasetItemFormDrawer`, add:

```tsx
<DatasetFormDrawer
  open={Boolean(creatingDirectoryId) || Boolean(editingDataset)}
  dataset={editingDataset}
  checkNameAvailability={checkDatasetNameAvailability}
  onOpenChange={(open) => {
    if (!open) {
      setCreatingDirectoryId(null)
      setEditingDataset(null)
    }
  }}
  onSubmit={(input) => saveDatasetMutation.mutateAsync(input)}
/>
<ConfirmDialog
  open={Boolean(deletingDataset)}
  onOpenChange={(open) => {
    if (!open) setDeletingDataset(null)
  }}
  title='删除数据集'
  desc={
    <>
      删除后将移除数据集
      {deletingDataset ? `「${deletingDataset.name}」` : ''}
      及其关联数据项，此操作不可撤销。
    </>
  }
  destructive
  confirmText='删除'
  isLoading={deleteDatasetMutation.isPending}
  handleConfirm={() => {
    if (deletingDataset) void deleteDatasetMutation.mutateAsync(deletingDataset)
  }}
/>
```

- [ ] **Step 9: Verify detail integration**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-detail-tree-source.test.ts
npm run typecheck
```

Expected: source test and typecheck pass.

## Task 8: Polish Tree Drag/Move Semantics

**Files:**

- Modify: `pa-eval-frontend/src/components/common/tree-view.tsx`
- Modify: `pa-eval-frontend/src/modules/project-settings/views/dataset-settings.tsx`
- Modify: `pa-eval-frontend/src/tests/app-evaluation/tree-view-source.test.ts`

- [ ] **Step 1: Strengthen drag source test**

Extend `tree-view-source.test.ts`:

```ts
test('tree view disables dragging while searching', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /dragDisabled\s*=\s*!draggable\s*\|\|\s*Boolean\(normalizedSearch\)/)
  assert.match(source, /onMove/)
})
```

- [ ] **Step 2: Implement concrete move callback**

Implement the drag/drop behavior with native HTML drag events in `TreeView`:

- Use native HTML drag events on `TreeItem`.
- Only enable `draggable={!dragDisabled && (!canDrag || canDrag(node))}`.
- Store dragged node id in component state.
- On drop over a folder, compute sibling order for the new parent and call `onMove`.
- On drop over an item, treat it as same parent reorder.

The move payload must be:

```ts
type TreeViewMoveInput = {
  id: string
  parentId: string | null
  order: number
}
```

Project settings should pass `canDrag={() => true}` and `canDrop={() => true}`.

- [ ] **Step 3: Verify drag source test and typecheck**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/tree-view-source.test.ts
npm run typecheck
```

Expected: pass.

## Task 9: Final Verification And Manual Smoke Test

**Files:**

- All files touched by prior tasks.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd pa-eval-frontend
node --test --experimental-strip-types src/tests/app-evaluation/dataset-directory-api.test.ts
node --test --experimental-strip-types src/tests/app-evaluation/dataset-directory-mock-source.test.ts
node --test --experimental-strip-types src/tests/app-evaluation/dataset-tree-utils.test.ts
node --test --experimental-strip-types src/tests/app-evaluation/tree-view-source.test.ts
node --test --experimental-strip-types src/tests/project-settings/dataset-settings-navigation.test.ts
node --test --experimental-strip-types src/tests/app-evaluation/dataset-tree-panel-source.test.ts
node --test --experimental-strip-types src/tests/app-evaluation/dataset-detail-tree-source.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run project quality gates**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 3: Start mock dev server**

Run:

```bash
cd pa-eval-frontend
npm run dev:mock
```

Expected: Vite starts and prints a local URL.

- [ ] **Step 4: Manual browser verification**

Open the Vite URL and verify:

- `/projects/proj_a/settings/datasets` shows “数据集设置”.
- Search filters directory names and preserves ancestor folders.
- New root directory works.
- New child directory works.
- Directory rename works.
- Directory delete asks for confirmation and moves datasets to “未分类”.
- Dragging directories works when search is empty.
- Dragging is disabled while search has text.
- `/projects/proj_a/evaluation/datasets/dataset_qa` shows left tree and right data item table.
- “显示/隐藏” toggles the tree.
- Clicking a folder only expands/collapses.
- Clicking a dataset updates the right data item table and syncs the URL.
- Folder hover plus opens `DatasetFormDrawer`.
- Dataset hover edit opens `DatasetFormDrawer`.
- Dataset hover delete asks for confirmation.
- Deleting the selected dataset selects the next available dataset or keeps the right table as an empty list.

- [ ] **Step 5: Check worktree**

Run:

```bash
cd /Users/panpan/Project/eval-demo
git status --short
```

Expected: only intended frontend files and docs are modified. Do not commit unless the user explicitly asks.

## Plan Self-Review

- Spec coverage: covered reusable tree components, `@headless-tree` dependency, mock directory API, project settings directory page, dataset detail tree selector, no context menu, no directory delete in detail page, uncategorized dataset edit/delete, default selection, empty table behavior, and verification.
- Placeholder scan: no `TBD`, `TODO`, or intentionally blank implementation steps remain.
- Type consistency: directory types use `DatasetDirectoryRecord`, dataset association uses `DatasetRecord.directoryId`, tree UI uses `TreeViewNode.kind = 'folder' | 'item'`, and business tree helpers use `DatasetTreeNode.kind = 'folder' | 'dataset'` before adapter mapping.
