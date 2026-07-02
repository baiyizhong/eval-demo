import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  confirm,
  confirmDialogController,
  type ConfirmDialogRequest,
} from './confirm.ts'

test('confirm notifies the provider and resolves true on accept', async () => {
  const requests: ConfirmDialogRequest[] = []
  const unsubscribe = confirmDialogController.subscribe((nextRequest) => {
    requests.push(nextRequest)
  })

  const result = confirm({
    title: '确认操作',
    desc: '确定要继续吗？',
  })

  const request = requests[0]
  assert.ok(request)
  assert.equal(request.options.title, '确认操作')
  request.resolve(true)

  assert.equal(await result, true)
  unsubscribe()
})

test('confirm resolves false on cancel', async () => {
  const requests: ConfirmDialogRequest[] = []
  const unsubscribe = confirmDialogController.subscribe((nextRequest) => {
    requests.push(nextRequest)
  })

  const result = confirm({
    title: '确认操作',
    desc: '确定要取消吗？',
  })

  const request = requests[0]
  assert.ok(request)
  request.resolve(false)

  assert.equal(await result, false)
  unsubscribe()
})
