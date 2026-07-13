import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/project-settings/views/score-configs.tsx',
  'utf8'
)

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
  assert.match(source, /布尔类型固定为 True \/ False，不支持自定义修改。/)
  assert.doesNotMatch(source, /1（是）和 0（否）/)
  assert.doesNotMatch(source, /aria-label=\{`布尔值/)
})

test('score config create form follows Langfuse input defaults', () => {
  assert.doesNotMatch(source, /encodeScoreOption/)
  assert.doesNotMatch(source, /\$\{option\.value\}\|\$\{option\.label/)
  assert.doesNotMatch(source, /toLangfuseBooleanCategories/)
  assert.match(source, /config\?\.minValue == null \? '' : String\(config\.minValue\)/)
  assert.match(source, /config\?\.maxValue == null \? '' : String\(config\.maxValue\)/)
  assert.match(source, /dataType === 'CATEGORICAL'\s*\?\s*categoryValues\s*:\s*undefined/)
  assert.match(source, /\{ value: '0', label: '' \}/)
  assert.doesNotMatch(source, /\{ value: '1', label: '好' \}/)
})

test('categorical and boolean score options expose readonly value and labels', () => {
  assert.match(source, /function handleDataTypeChange/)
  assert.match(source, /getInitialScoreOptionRows\(\{ dataType: nextDataType \}\)/)
  assert.match(source, /readOnlyValue/)
  assert.match(source, /readOnlyLabel/)
  assert.match(source, /disabled=\{readOnlyValue\}/)
  assert.match(source, /readOnly=\{readOnlyValue\}/)
  assert.match(source, /readOnly=\{readOnlyLabel\}/)
  assert.match(source, /label='值'/)
  assert.match(source, /label='标签'/)
  assert.match(source, /dataType === 'BOOLEAN'\s*\?\s*\(\s*<ScoreOptionRows/)
})

test('score configs range cell allows wrapping long content', () => {
  assert.match(
    source,
    /<TableCell className='max-w-80 whitespace-normal break-words'>/
  )
  assert.match(source, /max-w-52 truncate/)
})

test('score config names keep truncate and description controls tooltip', () => {
  assert.match(source, /TooltipTrigger asChild/)
  assert.match(source, /<span className='max-w-52 truncate font-medium'>/)
  assert.match(source, /config\.description \? \(/)
  assert.match(
    source,
    /<TooltipContent className='max-w-80 whitespace-normal break-words'>\s*\{config\.description\}\s*<\/TooltipContent>/
  )
  assert.doesNotMatch(source, /<TooltipContent>\{config\.name\}<\/TooltipContent>/)
})

test('active score config status badge uses success color', () => {
  assert.match(source, /'border-success\/20 bg-success\/10 text-success'/)
  assert.match(source, /'border-border bg-muted text-muted-foreground'/)
  assert.match(source, /config\.isArchived \? '已归档' : '启用中'/)
})
