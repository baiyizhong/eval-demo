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
  assert.match(source, /root:\s*\{/)
  assert.match(source, /dataSignature/)
  assert.match(source, /node\.name/)
  assert.match(source, /rebuildTree\(\)/)
})

test('reui tree exports expected primitives', () => {
  const source = readFileSync('src/components/reui/tree.tsx', 'utf8')

  assert.match(source, /export function Tree/)
  assert.match(source, /export function TreeItem/)
  assert.match(source, /export function TreeItemLabel/)
})

test('tree view disables dragging while searching', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(
    source,
    /dragDisabled\s*=\s*!draggable\s*\|\|\s*Boolean\(normalizedSearch\)/
  )
  assert.match(source, /onMove/)
})

test('tree view constrains long trees to scroll inside parent height', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /className='flex min-h-0 flex-1 flex-col gap-2'/)
  assert.match(source, /'min-h-0 overflow-auto'/)
})

test('tree view gives nested items a visible indentation step', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /getNodeDepth/)
  assert.doesNotMatch(source, /depth=\{item\.getItemMeta\(\)\.level\}/)
  assert.match(source, /Math\.max\(depth,\s*0\)\s*\*\s*24\s*\+\s*12/)
})

test('tree view supports an optional title', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /title\?: React\.ReactNode/)
  assert.match(source, /\{title \? \(/)
  assert.match(source, /text-sm font-medium/)
  assert.match(source, /title=\{typeof title === 'string' \? title : undefined\}/)
  assert.match(source, /\{title\}/)
})

test('tree view shows node names in the native title on hover', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /title=\{node\.name\}/)
})

test('tree view search input is clearable by default', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /clearable\?: boolean/)
  assert.match(source, /clearable = true/)
  assert.match(source, /import \{[^}]*X[^}]*\} from 'lucide-react'/s)
  assert.match(source, /clearable && searchValue/)
  assert.match(source, /aria-label='清空搜索'/)
  assert.match(source, /onClick=\{\(\) => setSearchValue\(''\)\}/)
})

test('tree view hides row hover actions while editing', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /const visibleActions = editing \? null : actions/)
  assert.match(source, /\{visibleActions \? \(/)
  assert.match(source, /\{visibleActions\}/)
})

test('tree view does not override cursor styles for draggable rows', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.doesNotMatch(source, /cursor-grab/)
  assert.doesNotMatch(source, /cursor-grabbing/)
  assert.doesNotMatch(source, /const \[dragging, setDragging\]/)
  assert.doesNotMatch(source, /dragCursorClassName/)
})
test('tree view exposes target node context when validating drops', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /targetNode:\s*TNode/)
  assert.match(source, /canDrop\(\{\s*node:\s*draggedNode,\s*targetNode/)
})

test('tree view only shows the disclosure arrow for folders with children', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /hasChildren=\{\(data\.children\[node\.id\] \?\? \[\]\)\.length > 0\}/)
  assert.match(source, /hasChildren:\s*boolean/)
  assert.match(source, /const canToggle = isFolder && hasChildren/)
  assert.match(source, /if \(!\(\(data\.children\[node\.id\] \?\? \[\]\)\.length > 0\)\) return/)
  assert.match(source, /if \(canToggle\) onToggle\(\)/)
  assert.match(source, /\{canToggle \? \(/)
  assert.match(source, /expanded && hasChildren \? \(/)
})

test('tree view expands every ancestor while searching child nodes', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /const searchExpandedIds = useMemo/)
  assert.match(source, /if \(!normalizedSearch\) return \[\]/)
  assert.match(source, /getAncestorFolderIds\(filteredNodes\)/)
  assert.match(source, /const resolvedExpandedIds = useMemo/)
  assert.match(source, /\.\.\.\(expandedIds \?\? \[\]\)/)
  assert.match(source, /\.\.\.searchExpandedIds/)
  assert.match(source, /state: \{ expandedItems: resolvedExpandedIds \}/)
})

test('tree view sorts sibling nodes by name', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')

  assert.match(source, /localeCompare\(/)
  assert.match(source, /'zh-Hans-CN'/)
  assert.match(source, /return nameCompare \|\| \(left\?\.order \?\? 0\) - \(right\?\.order \?\? 0\)/)
})

test('tree view gives folder icons semantic colors and file icons by default', () => {
  const source = readFileSync('src/components/common/tree-view.tsx', 'utf8')
  const themeSource = readFileSync('src/styles/theme.css', 'utf8')

  assert.match(source, /FileIcon/)
  assert.match(source, /renderItemIcon\?: \(node: TNode\) => React\.ReactNode/)
  assert.match(source, /itemIcon=\{renderItemIcon\?\.\(node\)\}/)
  assert.match(themeSource, /--color-warning:\s*var\(--warning\)/)
  assert.match(themeSource, /--tree-folder-fill:\s*#ffe590/)
  assert.match(themeSource, /--color-tree-folder-fill:\s*var\(--tree-folder-fill\)/)
  assert.match(source, /<FolderOpenIcon className='fill-tree-folder-fill text-warning size-4 shrink-0'/)
  assert.match(source, /<FolderIcon className='fill-tree-folder-fill text-warning size-4 shrink-0'/)
  assert.match(source, /<FileIcon className='text-muted-foreground size-4 shrink-0'/)
})
