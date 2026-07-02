import { canAssignRole, canManageMembers } from './permissions.ts'
import {
  createOrganizationMemberPayloadSchema,
  type ImportOrganizationMemberFailure,
  type OrganizationRole,
} from './schema.ts'

const CSV_BOM = /^\uFEFF/
const HEADER_ALIASES = {
  name: ['name', '姓名'],
  email: ['email', '邮件地址', '邮箱'],
  role: ['role', '组织角色', '角色'],
} as const

export type ParsedMemberImportRow = {
  row: number
  name: string
  email: string
  role: OrganizationRole
  rawData: string
}

export type MemberImportFailureItem = {
  row: number
  field: 'email' | 'role' | 'row'
  email: string
  reason: string
  rawData: string
}

export type ParsedMemberImportResult = {
  members: ParsedMemberImportRow[]
  failures: MemberImportFailureItem[]
}

export type MemberImportApiResult = {
  total: number
  datas: unknown[]
  failures?: ImportOrganizationMemberFailure[]
}

function splitCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (char === ',' && !quoted) {
      result.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  result.push(current.trim())
  return result.map((value) => value.replace(/^"|"$/g, '').trim())
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase()
}

function getHeaderIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) =>
    aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(header))
  )
}

function getHeaderMapping(lines: string[]) {
  const headers = splitCsvLine(lines[0] ?? '')
  const nameIndex = getHeaderIndex(headers, HEADER_ALIASES.name)
  const emailIndex = getHeaderIndex(headers, HEADER_ALIASES.email)
  const roleIndex = getHeaderIndex(headers, HEADER_ALIASES.role)
  const hasHeader = emailIndex >= 0 && roleIndex >= 0

  return {
    startIndex: hasHeader ? 1 : 0,
    nameIndex: nameIndex >= 0 ? nameIndex : 0,
    emailIndex: emailIndex >= 0 ? emailIndex : 1,
    roleIndex: roleIndex >= 0 ? roleIndex : 2,
  }
}

function buildFailure(
  row: number,
  rawData: string,
  reason: string,
  field: MemberImportFailureItem['field'],
  email = ''
): MemberImportFailureItem {
  return {
    row,
    field,
    email,
    reason,
    rawData,
  }
}

function inferFailureField(
  failure: ImportOrganizationMemberFailure,
  source?: ParsedMemberImportRow
): MemberImportFailureItem['field'] {
  const reason = failure.reason.toLowerCase()

  if (reason.includes('权限') || reason.includes('角色')) {
    return 'role'
  }

  if (failure.email || source?.email) {
    return 'email'
  }

  return 'row'
}

export function parseMemberImportCsv(
  csvText: string,
  actorRole: OrganizationRole
): ParsedMemberImportResult {
  if (!canManageMembers(actorRole)) {
    return {
      members: [],
      failures: [
        buildFailure(1, '', '当前角色不能导入成员', 'role'),
      ],
    }
  }

  const normalizedText = csvText.replace(CSV_BOM, '').replace(/\r\n/g, '\n')
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return {
      members: [],
      failures: [buildFailure(1, '', '导入文件内容为空', 'row')],
    }
  }

  const headerMapping = getHeaderMapping(lines)
  const members: ParsedMemberImportRow[] = []
  const failures: MemberImportFailureItem[] = []

  for (let index = headerMapping.startIndex; index < lines.length; index += 1) {
    const rawData = lines[index]
    const rowNumber = index + 1
    const columns = splitCsvLine(rawData)
    const name = columns[headerMapping.nameIndex] ?? ''
    const email = (columns[headerMapping.emailIndex] ?? '').toLowerCase()
    const roleValue = (columns[headerMapping.roleIndex] ?? '').toUpperCase()

    if (!email) {
      failures.push(buildFailure(rowNumber, rawData, '请输入邮箱地址', 'email'))
      continue
    }

    if (!roleValue) {
      failures.push(
        buildFailure(rowNumber, rawData, '请选择组织角色', 'role', email)
      )
      continue
    }

    const parsedPayload = createOrganizationMemberPayloadSchema.safeParse({
      name,
      email,
      role: roleValue,
    })

    if (!parsedPayload.success) {
      const reason =
        parsedPayload.error.issues[0]?.path[0] === 'role'
          ? '组织角色不合法'
          : '邮箱格式不正确'
      const field =
        parsedPayload.error.issues[0]?.path[0] === 'role' ? 'role' : 'email'
      failures.push(buildFailure(rowNumber, rawData, reason, field, email))
      continue
    }

    if (!canAssignRole(actorRole, parsedPayload.data.role)) {
      failures.push(
        buildFailure(
          rowNumber,
          rawData,
          '当前角色不能授予该权限',
          'role',
          parsedPayload.data.email
        )
      )
      continue
    }

    members.push({
      row: rowNumber,
      name: parsedPayload.data.name ?? '',
      email: parsedPayload.data.email,
      role: parsedPayload.data.role,
      rawData,
    })
  }

  return {
    members,
    failures,
  }
}

export function buildMemberImportResult(
  parsed: ParsedMemberImportResult,
  response: MemberImportApiResult
) {
  const remoteFailures = (response.failures ?? []).map((failure) => {
    const source = parsed.members[failure.row - 1]

    return {
      row: source?.row ?? failure.row,
      field: inferFailureField(failure, source),
      email: failure.email || source?.email || '',
      reason: failure.reason,
      rawData: source?.rawData ?? '',
    } satisfies MemberImportFailureItem
  })

  return {
    successCount: response.total ?? response.datas.length,
    failures: [...parsed.failures, ...remoteFailures],
  }
}
