import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/project-settings/views/score-configs.tsx',
  'utf8'
)

test('score configs page uses server pagination through the shared data table', () => {
  assert.match(source, /<DataTable<ScoreConfig/)
  assert.match(source, /listProjectScoreConfigsPage/)
  assert.match(source, /page:\s*state\.page/)
  assert.match(source, /pageSize:\s*state\.pageSize/)
  assert.match(source, /keyword:\s*state\.keyword/)
  assert.match(source, /pageKey:\s*'scoreConfigPage'/)
  assert.match(source, /pageSizeKey:\s*'scoreConfigPageSize'/)
  assert.match(source, /globalFilterKey:\s*'scoreConfigKeyword'/)
  assert.match(source, /searchPlaceholder:\s*'按指标名称搜索'/)
  assert.doesNotMatch(source, /sortedConfigs\.map/)
})

test('score configs page removes recommended metric preparation action', () => {
  assert.doesNotMatch(source, /准备推荐指标/)
  assert.doesNotMatch(source, /ensureDefaultProjectScoreConfig/)
})

test('boolean score configs use Langfuse fixed true and false options', () => {
  assert.match(source, /BOOLEAN_SCORE_OPTIONS/)
  assert.match(source, /value:\s*1,\s*label:\s*'True'/)
  assert.match(source, /value:\s*0,\s*label:\s*'False'/)
  assert.match(source, /dataType === 'BOOLEAN'\s*\?\s*\(\s*<ScoreOptionRows/)
  assert.doesNotMatch(source, /addLabel='新增布尔值'/)
})

test('boolean score configs show concise Langfuse labels to users', () => {
  assert.match(source, /formatBooleanScoreOptions/)
  assert.match(source, /布尔类型固定使用 True=1、False=0。/)
  assert.doesNotMatch(source, /1（是）和 0（否）/)
  assert.doesNotMatch(source, /aria-label=\{`布尔值/)
})

test('score config create form follows Langfuse input defaults', () => {
  assert.doesNotMatch(source, /encodeScoreOption/)
  assert.doesNotMatch(source, /\$\{option\.value\}\|\$\{option\.label/)
  assert.doesNotMatch(source, /toLangfuseBooleanCategories/)
  assert.match(
    source,
    /config\?\.minValue == null \? '' : String\(config\.minValue\)/
  )
  assert.match(
    source,
    /config\?\.maxValue == null \? '' : String\(config\.maxValue\)/
  )
  assert.match(
    source,
    /dataType === 'CATEGORICAL' \|\| dataType === 'BOOLEAN'\s*\?\s*categoryValues\s*:\s*undefined/
  )
  assert.match(source, /\{ value: '0', label: '' \}/)
  assert.doesNotMatch(source, /\{ value: '1', label: '好' \}/)
})

test('categorical values and boolean value-label pairs use the expected readonly rules', () => {
  assert.match(source, /function handleDataTypeChange/)
  assert.match(
    source,
    /getInitialScoreOptionRows\(\{ dataType: nextDataType \}\)/
  )
  assert.match(source, /readOnlyValue/)
  assert.match(source, /readOnlyLabel/)
  assert.match(source, /disabled=\{readOnlyValue\}/)
  assert.match(source, /readOnly=\{readOnlyValue\}/)
  assert.match(source, /readOnly=\{readOnlyLabel\}/)
  assert.match(source, /label='值'/)
  assert.match(source, /label='标签'/)
  assert.match(
    source,
    /dataType === 'BOOLEAN'\s*\?\s*\(\s*<ScoreOptionRows\s*rows=\{categoryRows\}\s*onChange=\{setCategoryRows\}\s*readOnlyValue\s*readOnlyLabel\s*\/>\s*\) : null/
  )
  assert.match(source, /return BOOLEAN_SCORE_OPTIONS\.map/)
})

test('score configs range cell allows wrapping long content', () => {
  assert.match(
    source,
    /<div className='max-w-80 break-words whitespace-normal'>/
  )
  assert.match(source, /max-w-52 truncate/)
})

test('score configs table uses intrinsic width for horizontal scrolling', () => {
  assert.match(source, /minTableWidth='max-content'/)
  assert.doesNotMatch(source, /minTableWidth=\{\d+\}/)
})

test('score config dialog keeps footer visible and scrolls long category forms', () => {
  assert.match(
    source,
    /<DialogContent className='flex max-h-\[calc\(100svh-2rem\)\] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl'>/
  )
  assert.match(
    source,
    /<DialogHeader className='border-b p-6 pb-4 text-start'>/
  )
  assert.match(
    source,
    /<div className='grid min-h-0 flex-1 gap-4 overflow-y-auto p-6'>/
  )
  assert.match(source, /<DialogFooter className='border-t p-6 pt-4'>/)
})

test('score config names keep truncate and description controls tooltip', () => {
  assert.match(source, /TooltipTrigger asChild/)
  assert.match(source, /<span className='max-w-52 truncate font-medium'>/)
  assert.match(source, /config\.description \? \(/)
  assert.match(
    source,
    /<TooltipContent className='max-w-80 break-words whitespace-normal'>\s*\{config\.description\}\s*<\/TooltipContent>/
  )
  assert.doesNotMatch(
    source,
    /<TooltipContent>\{config\.name\}<\/TooltipContent>/
  )
})

test('active score config status badge uses success color', () => {
  assert.match(source, /'border-success\/20 bg-success\/10 text-success'/)
  assert.match(source, /'border-border bg-muted text-muted-foreground'/)
  assert.match(source, /config\.isArchived \? '已归档' : '启用中'/)
})
