import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkProjectAnnotationQueueNameAvailability } from '../../modules/app-evaluation/api/annotation-api.ts'
import { checkProjectDatasetNameAvailability } from '../../modules/app-evaluation/api/dataset-api.ts'
import { createAvailableResourceNameSchema } from '../../modules/app-evaluation/lib/name-availability.ts'

test('dataset and annotation name availability helpers submit trimmed names', async () => {
  const calls: Array<[string, unknown]> = []
  const api = {
    async getProjectDatasetNameAvailability(options: unknown) {
      calls.push(['dataset', options])
      return { available: false }
    },
    async getProjectAnnotationQueueNameAvailability(options: unknown) {
      calls.push(['annotation', options])
      return { available: true }
    },
  }

  assert.equal(
    await checkProjectDatasetNameAvailability(
      api as never,
      'project-1',
      '  回归数据集  '
    ),
    false
  )
  assert.equal(
    await checkProjectAnnotationQueueNameAvailability(
      api as never,
      'project-1',
      '  人工复核  '
    ),
    true
  )
  assert.deepEqual(calls, [
    [
      'dataset',
      { path: { projectId: 'project-1' }, query: { name: '回归数据集' } },
    ],
    [
      'annotation',
      { path: { projectId: 'project-1' }, query: { name: '人工复核' } },
    ],
  ])
})

test('resource name schema trims input and reports duplicate names', async () => {
  const checkedNames: string[] = []
  const schema = createAvailableResourceNameSchema({
    requiredMessage: '请输入名称',
    duplicateMessage: '名称已存在，请修改名称',
    checkAvailability: async (name) => {
      checkedNames.push(name)
      return name !== '重复名称'
    },
  })

  const duplicate = await schema.safeParseAsync('  重复名称  ')
  const available = await schema.safeParseAsync('  可用名称  ')

  assert.equal(duplicate.success, false)
  assert.equal(duplicate.error?.issues[0]?.message, '名称已存在，请修改名称')
  assert.deepEqual(available, { success: true, data: '可用名称' })
  assert.deepEqual(checkedNames, ['重复名称', '可用名称'])
})

test('resource name schema validates the configured maximum length', async () => {
  const schema = createAvailableResourceNameSchema({
    requiredMessage: '请输入名称',
    duplicateMessage: '名称已存在，请修改名称',
    maxLength: 3,
    maxLengthMessage: '名称不能超过3个字',
    checkAvailability: async () => true,
  })

  const result = await schema.safeParseAsync('四个字符')

  assert.equal(result.success, false)
  assert.equal(result.error?.issues[0]?.message, '名称不能超过3个字')
})

test('dataset create and edit drawers limit the name and description fields', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-form-drawer.tsx',
    'utf8'
  )

  assert.match(source, /DATASET_NAME_MAX_LENGTH = 30/)
  assert.match(source, /DATASET_DESCRIPTION_MAX_LENGTH = 200/)
  assert.match(source, /max\(DATASET_NAME_MAX_LENGTH/)
  assert.match(source, /max\(DATASET_DESCRIPTION_MAX_LENGTH/)
  assert.match(source, /maxLength=\{DATASET_NAME_MAX_LENGTH\}/)
  assert.match(source, /maxLength=\{DATASET_DESCRIPTION_MAX_LENGTH\}/)
  assert.doesNotMatch(source, /dataset \? undefined : DATASET_.*_MAX_LENGTH/)
})

test('all dataset and annotation create forms validate names before submit', () => {
  const sources = [
    'src/modules/app-evaluation/components/dataset-form-drawer.tsx',
    'src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx',
    'src/modules/app-observability/components/trace-dataset-dialog.tsx',
    'src/modules/app-observability/components/trace-annotation-dialog.tsx',
  ].map((path) => readFileSync(path, 'utf8'))

  for (const source of sources) {
    assert.match(source, /createAvailableResourceNameSchema/)
    assert.match(source, /form\.trigger\('name'\)/)
  }

  assert.match(
    readFileSync('src/modules/app-evaluation/views/datasets.tsx', 'utf8'),
    /checkProjectDatasetNameAvailability/
  )
  const flowbackSource = readFileSync(
    'src/modules/app-evaluation/components/evaluation-report-flowback-dialog.tsx',
    'utf8'
  )
  assert.match(flowbackSource, /checkProjectDatasetNameAvailability/)
  assert.match(flowbackSource, /onBlur=.*checkDatasetNameAvailability/s)
  assert.match(
    readFileSync(
      'src/modules/app-evaluation/views/annotation-queues.tsx',
      'utf8'
    ),
    /checkProjectAnnotationQueueNameAvailability/
  )
})
