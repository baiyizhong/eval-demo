import assert from 'node:assert/strict'
import test from 'node:test'
import scheduledJobRoutes from '../../../mock/scheduled-jobs.ts'

function route(url: string, method: string) {
  const match = scheduledJobRoutes.find(
    (item) => item.url === url && item.method === method
  )
  assert.ok(match)
  return match
}

test('scheduled jobs mock returns project-scoped tasks for proj_b', () => {
  const response = route(
    '/api/projects/:projectId/scheduled-jobs',
    'get'
  ).response({ params: { projectId: 'proj_b' }, query: {} })

  assert.equal(response.code, 0)
  assert.ok(response.data.datas.length > 0)
  assert.ok(
    response.data.datas.every(
      (task: { projectId: string }) => task.projectId === 'proj_b'
    )
  )
})

test('scheduled job logs mock returns project-scoped links for proj_b', () => {
  const response = route(
    '/api/projects/:projectId/scheduled-job-logs',
    'get'
  ).response({ params: { projectId: 'proj_b' }, query: {} })

  assert.equal(response.code, 0)
  assert.ok(response.data.datas.length > 0)
  assert.ok(
    response.data.datas.every(
      (log: { projectId: string; autoEvaluationTaskPath: string }) =>
        log.projectId === 'proj_b' &&
        log.autoEvaluationTaskPath.startsWith('/projects/proj_b/')
    )
  )
})
