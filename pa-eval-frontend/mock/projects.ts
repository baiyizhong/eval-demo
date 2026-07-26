import { db } from './_data.ts'
import {
  body,
  id,
  keywordIncludes,
  nowIso,
  paginate,
  pathParam,
  success,
} from './_utils.ts'

const projectId = (req: any) => pathParam(req, 'projectId')

const findModelSettings = (pid: string) => {
  let settings = db.modelSettings.find((item) => item.projectId === pid)
  if (!settings) {
    settings = {
      projectId: pid,
      defaultModel: null,
      llmConnections: [],
      modelDefinitions: [],
    }
    db.modelSettings.push(settings)
  }
  return settings
}

export default [
  {
    url: '/api/projects/:projectId/settings/api-keys/:keyId',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      const index = db.apiKeys.findIndex(
        (item) => item.id === pathParam(req, 'keyId') && item.projectId === projectId(req)
      )
      if (index >= 0) {
        db.apiKeys[index] = { ...db.apiKeys[index], ...input, updatedAt: nowIso() }
      }
      return success(db.apiKeys[index] ?? { id: pathParam(req, 'keyId') })
    },
  },
  {
    url: '/api/projects/:projectId/settings/api-keys/:keyId',
    method: 'delete',
    response: (req: any) => {
      const keyId = pathParam(req, 'keyId')
      db.apiKeys = db.apiKeys.filter((item) => item.id !== keyId)
      return success({ id: keyId })
    },
  },
  {
    url: '/api/projects/:projectId/settings/members/:memberId',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      const index = db.projectMembers.findIndex(
        (item) => item.id === pathParam(req, 'memberId') && item.projectId === projectId(req)
      )
      if (index >= 0) {
        db.projectMembers[index] = {
          ...db.projectMembers[index],
          role: input.role ?? db.projectMembers[index].role,
          updatedAt: nowIso(),
        }
      }
      return success(db.projectMembers[index] ?? { id: pathParam(req, 'memberId') })
    },
  },
  {
    url: '/api/projects/:projectId/settings/members/:memberId',
    method: 'delete',
    response: (req: any) => {
      const memberId = pathParam(req, 'memberId')
      db.projectMembers = db.projectMembers.filter((item) => item.id !== memberId)
      return success({ id: memberId })
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/llm-connections/:connectionId',
    method: 'patch',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      const index = settings.llmConnections.findIndex(
        (item: any) => item.id === pathParam(req, 'connectionId')
      )
      if (index >= 0) {
        settings.llmConnections[index] = {
          ...settings.llmConnections[index],
          ...body(req),
          updatedAt: nowIso(),
        }
      }
      return success(settings.llmConnections[index] ?? { id: pathParam(req, 'connectionId') })
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/llm-connections/:connectionId',
    method: 'delete',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      const connectionId = pathParam(req, 'connectionId')
      settings.llmConnections = settings.llmConnections.filter(
        (item: any) => item.id !== connectionId
      )
      return success({ id: connectionId })
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/definitions/:modelId',
    method: 'patch',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      const index = settings.modelDefinitions.findIndex(
        (item: any) => item.id === pathParam(req, 'modelId')
      )
      if (index >= 0) {
        settings.modelDefinitions[index] = {
          ...settings.modelDefinitions[index],
          ...body(req),
          updatedAt: nowIso(),
        }
      }
      return success(settings.modelDefinitions[index] ?? { id: pathParam(req, 'modelId') })
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/definitions/:modelId',
    method: 'delete',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      const modelId = pathParam(req, 'modelId')
      settings.modelDefinitions = settings.modelDefinitions.filter(
        (item: any) => item.id !== modelId
      )
      return success({ id: modelId })
    },
  },
  {
    url: '/api/projects/:projectId/archive',
    method: 'post',
    response: (req: any) => updateProjectStatus(projectId(req), 'archived'),
  },
  {
    url: '/api/projects/:projectId/restore',
    method: 'post',
    response: (req: any) => updateProjectStatus(projectId(req), 'active'),
  },
  {
    url: '/api/projects/:projectId/settings/api-keys',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.apiKeys.filter((item) => item.projectId === projectId(req)),
          req.query,
          10
        )
      ),
  },
  {
    url: '/api/projects/:projectId/settings/api-keys',
    method: 'post',
    response: (req: any) => {
      const key = {
        id: id('key'),
        projectId: projectId(req),
        note: body(req).note ?? '',
        publicKey: `pk-lf-${id('mock')}`,
        secretKey: `sk-lf-${id('mock')}`,
        displaySecretKey: 'sk-lf-****mock',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.apiKeys.unshift(key)
      return success(key)
    },
  },
  {
    url: '/api/projects/:projectId/settings/members',
    method: 'get',
    response: (req: any) =>
      success(
        db.projectMembers.filter((item) => item.projectId === projectId(req))
      ),
  },
  {
    url: '/api/projects/:projectId/settings/members',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const member = {
        id: id('member'),
        userId: id('user'),
        projectId: projectId(req),
        name: input.email,
        email: input.email,
        role: input.role ?? 'MEMBER',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.projectMembers.unshift(member)
      return success(member)
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/default',
    method: 'patch',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      settings.defaultModel = body(req)
      return success(settings.defaultModel)
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/llm-connections',
    method: 'post',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      const connection = {
        id: id('conn'),
        ...body(req),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      settings.llmConnections.unshift(connection)
      return success(connection)
    },
  },
  {
    url: '/api/projects/:projectId/settings/models/definitions',
    method: 'post',
    response: (req: any) => {
      const settings = findModelSettings(projectId(req))
      const model = {
        id: id('model'),
        ...body(req),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      settings.modelDefinitions.unshift(model)
      return success(model)
    },
  },
  {
    url: '/api/projects/:projectId/settings/models',
    method: 'get',
    response: (req: any) => success(findModelSettings(projectId(req))),
  },
  {
    url: '/api/projects/:projectId',
    method: 'patch',
    response: (req: any) => {
      const index = db.projects.findIndex((item) => item.id === projectId(req))
      if (index >= 0) {
        db.projects[index] = { ...db.projects[index], ...body(req), updatedAt: nowIso() }
      }
      return success(db.projects[index] ?? { id: projectId(req) })
    },
  },
  {
    url: '/api/projects',
    method: 'get',
    response: ({ query }: any) => {
      let rows = db.projects.filter((item) => keywordIncludes(item, query?.keyword))
      if (query?.organizationId) {
        rows = rows.filter((item) => item.organizationId === query.organizationId)
      }
      if (query?.status) {
        rows = rows.filter((item) => item.status === query.status)
      }
      return success(paginate(rows, query, 10))
    },
  },
  {
    url: '/api/projects',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const org = db.organizations.find((item) => item.id === input.organizationId)
      const project = {
        id: id('proj'),
        name: input.name,
        description: input.description ?? '',
        organizationId: input.organizationId ?? db.organizations[0].id,
        organizationName: org?.name ?? db.organizations[0].name,
        status: 'active',
        retentionDays: input.retentionDays ?? 14,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.projects.unshift(project)
      return success(project)
    },
  },
]

function updateProjectStatus(pid: string, status: string) {
  const index = db.projects.findIndex((item) => item.id === pid)
  if (index >= 0) {
    db.projects[index] = { ...db.projects[index], status, updatedAt: nowIso() }
  }
  return success(db.projects[index] ?? { id: pid, status })
}
