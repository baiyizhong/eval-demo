import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const stepperSource = readFileSync('src/components/common/stepper.tsx', 'utf8')

test('Stepper 使用有序步骤语义并标记当前步骤', () => {
  assert.match(stepperSource, /<ol/)
  assert.match(stepperSource, /<li/)
  assert.match(
    stepperSource,
    /aria-current=\{isCurrent \? 'step' : undefined\}/
  )
})

test('Stepper 支持通过回调切换步骤', () => {
  assert.match(stepperSource, /onStepChange\?:/)
  assert.match(stepperSource, /onClick=\{\(\) => onStepChange\?\.\(index\)\}/)
})

test('Stepper 连接线不覆盖步骤内容', () => {
  assert.doesNotMatch(stepperSource, /right-\[calc\(50%\+2rem\)\]/)
  assert.doesNotMatch(stepperSource, /left-\[calc\(-50%\+2rem\)\]/)
  assert.match(stepperSource, /grid-cols-\[1fr_auto_1fr\]/)
})

test('Stepper 步骤项不使用外边框', () => {
  assert.doesNotMatch(stepperSource, /rounded-lg border/)
  assert.doesNotMatch(stepperSource, /isCurrent && 'border-primary/)
  assert.doesNotMatch(stepperSource, /isCompleted && 'border-primary\/40/)
})

test('Stepper 步骤项不使用 hover 和选中背景效果', () => {
  assert.doesNotMatch(stepperSource, /hover:bg-accent/)
  assert.doesNotMatch(stepperSource, /isCurrent && 'bg-primary\/5'/)
})

test('Stepper 步骤之间无间距且步骤项无左右内边距', () => {
  assert.match(stepperSource, /grid gap-0/)
  assert.match(
    stepperSource,
    /gridTemplateColumns: `repeat\(\$\{items\.length\}, minmax\(0, 1fr\)\)`/
  )
  assert.match(stepperSource, /py-3/)
  assert.match(stepperSource, /px-0/)
  assert.doesNotMatch(stepperSource, /grid gap-3 md:grid-cols-3/)
  assert.doesNotMatch(stepperSource, /md:grid-cols-3/)
  assert.doesNotMatch(stepperSource, /rounded-lg p-3/)
})

test('Stepper 连接线不使用完成态颜色', () => {
  assert.doesNotMatch(stepperSource, /isCompleted && 'bg-primary'/)
  assert.doesNotMatch(stepperSource, /index < currentStep && 'bg-primary'/)
})
