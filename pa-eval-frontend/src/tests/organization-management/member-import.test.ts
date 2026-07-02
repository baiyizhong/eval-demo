import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildMemberImportResult,
  parseMemberImportCsv,
} from '../../modules/organization-management/data/member-import.ts'
import {
  createOrganizationMemberPayloadSchema,
  importOrganizationMembersPayloadSchema,
} from '../../modules/organization-management/data/schema.ts'

test('parseMemberImportCsv 解析中文表头并拦截 ADMIN 不可导入的 OWNER', () => {
  const csv = [
    '姓名,邮件地址,组织角色',
    '张三,zhangsan@example.com,MEMBER',
    '李四,lisi@example.com,OWNER',
  ].join('\n')

  const result = parseMemberImportCsv(csv, 'ADMIN')

  assert.deepEqual(result.members, [
    {
      row: 2,
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'MEMBER',
      rawData: '张三,zhangsan@example.com,MEMBER',
    },
  ])

  assert.deepEqual(result.failures, [
    {
      row: 3,
      field: 'role',
      email: 'lisi@example.com',
      reason: '当前角色不能授予该权限',
      rawData: '李四,lisi@example.com,OWNER',
    },
  ])
})

test('buildMemberImportResult 会把接口失败行号映射回源 CSV 行号并补足字段', () => {
  const csv = [
    'name,email,role',
    '张三,zhangsan@example.com,MEMBER',
    '李四,lisi@example.com,ADMIN',
    '王五,wangwu@example.com,VIEWER',
  ].join('\n')

  const parsed = parseMemberImportCsv(csv, 'OWNER')
  const result = buildMemberImportResult(parsed, {
    total: 1,
    datas: [],
    failures: [
      {
        row: 2,
        email: 'lisi@example.com',
        reason: '该成员已存在',
      },
    ],
  })

  assert.equal(result.successCount, 1)
  assert.deepEqual(result.failures, [
    {
      row: 3,
      field: 'email',
      email: 'lisi@example.com',
      reason: '该成员已存在',
      rawData: '李四,lisi@example.com,ADMIN',
    },
  ])
})

test('成员 payload schema 支持可选 name，且 CSV 解析会保留 name', () => {
  const createPayload = createOrganizationMemberPayloadSchema.safeParse({
    name: '张三',
    email: 'zhangsan@example.com',
    role: 'MEMBER',
  })
  assert.equal(createPayload.success, true)
  if (!createPayload.success) {
    return
  }
  assert.equal(createPayload.data.name, '张三')

  const importPayload = importOrganizationMembersPayloadSchema.safeParse({
    members: [
      {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'MEMBER',
      },
    ],
  })
  assert.equal(importPayload.success, true)
  if (!importPayload.success) {
    return
  }
  assert.equal(importPayload.data.members[0]?.name, '张三')

  const parsed = parseMemberImportCsv(
    ['姓名,邮件地址,组织角色', '张三,zhangsan@example.com,MEMBER'].join('\n'),
    'OWNER'
  )

  assert.deepEqual(parsed.members, [
    {
      row: 2,
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'MEMBER',
      rawData: '张三,zhangsan@example.com,MEMBER',
    },
  ])
})
