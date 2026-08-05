import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(scriptDir, '..')
const repoRoot = resolve(frontendRoot, '..')

const config = {
  frontendUrl: process.env.PA_E2E_FRONTEND_URL ?? 'http://127.0.0.1:5173',
  backendUrl: process.env.PA_E2E_BACKEND_URL ?? 'http://127.0.0.1:8000',
  backendDir: process.env.PA_E2E_BACKEND_DIR ?? resolve(repoRoot, 'pa-eval-backend'),
  userEmail: process.env.PA_E2E_USER_EMAIL ?? '774319634@qq.com',
  langfuseBaseUrl:
    process.env.PA_E2E_LANGFUSE_BASE_URL ??
    process.env.LANGFUSE_BASE_URL ??
    process.env.LANGFUSE_HOST ??
    'http://127.0.0.1:3000',
  webhookHost: process.env.PA_E2E_WEBHOOK_HOST ?? '127.0.0.1',
  webhookPort: Number(process.env.PA_E2E_WEBHOOK_PORT ?? 8099),
  webhookTokenRef: process.env.PA_E2E_WEBHOOK_TOKEN_REF ?? 'PA_E2E_WEBHOOK_TOKEN',
  chromePath:
    process.env.E2E_CHROME_PATH ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}

const webhookToken = process.env[config.webhookTokenRef]
if (!webhookToken) {
  throw new Error(
    `${config.webhookTokenRef} is required. Start backend with the same env var and run this command with it set.`
  )
}

const webhookUrl = `http://${config.webhookHost}:${config.webhookPort}/e2e-webhook`
const stamp = Date.now()

function runBackendPython(code) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('uv', ['run', 'python', '-c', code], {
      cwd: config.backendDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('exit', (codeValue) => {
      if (codeValue === 0) {
        resolvePromise(stdout.trim())
        return
      }
      reject(new Error(stderr.trim() || stdout.trim() || `python exited ${codeValue}`))
    })
  })
}

async function createAuthSession() {
  const code = String.raw`
import asyncio
import json

from app.auth_context import create_access_token
from app.config import Settings
from app.langfuse_db import LangfuseDatabaseReader

email = ${JSON.stringify(config.userEmail)}

async def main():
    settings = Settings()
    reader = LangfuseDatabaseReader(settings)
    user = await reader.get_user_by_email(email)
    if not user:
        raise RuntimeError(f"Langfuse user not found: {email}")
    user_id = user["id"] if isinstance(user, dict) else user.id
    user_email = user["email"] if isinstance(user, dict) else user.email
    user_name = user.get("name") if isinstance(user, dict) else user.name
    token = create_access_token(
        {
            "provider": "e2e",
            "sub": "pa-scene-e2e",
            "login": "pa-scene-e2e",
            "langfuseUserId": user_id,
            "email": user_email,
            "name": user_name,
            "nonce": "scene-page-e2e",
        },
        settings,
    )
    user_payload = user if isinstance(user, dict) else user.model_dump()
    print(json.dumps({"token": token, "cookieName": settings.pa_eval_auth_cookie_name, "user": user_payload}, ensure_ascii=False))

asyncio.run(main())
`
  return JSON.parse(await runBackendPython(code))
}

async function api(method, path, auth, body) {
  const response = await fetch(`${config.backendUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `${auth.cookieName}=${auth.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} ${response.status}: ${text}`)
  }
  const json = JSON.parse(text)
  if (json.code !== 0) {
    throw new Error(`${method} ${path} code ${json.code}: ${json.message}`)
  }
  return json.data
}

async function discoverFixture(auth) {
  const projects = await api('GET', '/api/projects?pageSize=100', auth)
  const project = projects.datas?.[0]
  if (!project) throw new Error('No visible project found for E2E user')

  const datasets = await api(
    'GET',
    `/api/projects/${encodeURIComponent(project.id)}/datasets?pageSize=100`,
    auth
  )
  const dataset = datasets.datas?.find((item) => Number(item.itemCount ?? 0) > 0)
  if (!dataset) throw new Error(`No dataset with active items found in ${project.id}`)

  const evaluators = await api('GET', '/api/evaluators?pageSize=100', auth)
  const evaluator = evaluators.datas?.find(
    (item) =>
      (!item.projectId || item.projectId === project.id) && item.enabled !== false
  )
  if (!evaluator) throw new Error(`No evaluator found for project ${project.id}`)

  const keys = await api(
    'GET',
    `/api/projects/${encodeURIComponent(project.id)}/settings/api-keys?pageSize=100`,
    auth
  )
  let apiKey = keys.datas?.find((item) => item.publicKey && item.secretKey)
  if (!apiKey) {
    apiKey = await api(
      'POST',
      `/api/projects/${encodeURIComponent(project.id)}/settings/api-keys`,
      auth,
      { note: 'Scene experiment page E2E key' }
    )
  }
  if (!apiKey?.publicKey || !apiKey?.secretKey) {
    throw new Error('Project API key is missing publicKey or secretKey')
  }

  const datasetItems = await api(
    'GET',
    `/api/projects/${encodeURIComponent(project.id)}/datasets/${encodeURIComponent(dataset.id)}/items?pageSize=100&status=ACTIVE`,
    auth
  )
  if (!datasetItems.datas?.length) {
    throw new Error(`No active dataset items found in ${dataset.id}`)
  }

  return { project, dataset, datasetItems: datasetItems.datas, evaluator, apiKey }
}

function langfuseAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey.publicKey}:${apiKey.secretKey}`).toString('base64')}`
}

async function langfuseFetch(path, apiKey, init = {}) {
  const response = await fetch(`${config.langfuseBaseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      authorization: langfuseAuthHeader(apiKey),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} ${response.status}: ${text}`)
  }
  return json
}

async function ingestLangfuseTrace({ apiKey, run, item, index }) {
  const traceId = `scene-e2e-trace-${stamp}-${index}`
  const output = {
    answer: `scene e2e output ${index + 1}`,
    sourceItemId: item.id,
  }
  await langfuseFetch('/api/public/ingestion', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      batch: [
        {
          id: `scene-e2e-ingest-${stamp}-${index}`,
          type: 'trace-create',
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: run.langfuseRunName,
            timestamp: new Date().toISOString(),
            input: item.input,
            output,
            metadata: {
              paE2E: true,
              paReportId: run.paReportId,
              datasetItemId: item.id,
            },
          },
        },
      ],
    }),
  })
  return { traceId, output }
}

async function waitForLangfuseTrace(apiKey, traceId) {
  const deadline = Date.now() + 20000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      return await langfuseFetch(
        `/api/public/traces/${encodeURIComponent(traceId)}?fields=core`,
        apiKey
      )
    } catch (error) {
      lastError = error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 750))
    }
  }
  throw lastError ?? new Error(`Trace ${traceId} was not visible in Langfuse`)
}

async function createDatasetRunItem({ apiKey, run, item, traceId }) {
  return langfuseFetch('/api/public/dataset-run-items', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      runName: run.langfuseRunName,
      runDescription: 'PA scene experiment E2E remote runner',
      datasetItemId: item.id,
      traceId,
      createdAt: new Date().toISOString(),
      metadata: {
        paE2E: true,
        paExperimentGroupId: run.paExperimentGroupId,
        paReportId: run.paReportId,
      },
    }),
  })
}

async function waitForDatasetRunItems({ apiKey, datasetId, runName, expectedCount }) {
  const deadline = Date.now() + 60000
  let latestCount = 0
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await langfuseFetch(
        `/api/public/dataset-run-items?datasetId=${encodeURIComponent(datasetId)}&runName=${encodeURIComponent(runName)}&page=1&limit=100`,
        apiKey
      )
      const items = Array.isArray(response.data) ? response.data : []
      latestCount = items.length
      if (latestCount >= expectedCount) return items
    } catch (error) {
      lastError = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
  }
  throw new Error(
    `Dataset run items were not visible before callback: expected ${expectedCount}, got ${latestCount}. ${lastError?.message ?? ''}`
  )
}

async function completeRemoteExperiment(callback, run) {
  const callbackUrl = new URL(callback.url, config.backendUrl)
  if (!callbackUrl.pathname.endsWith('/remote-callback')) {
    throw new Error(`Unexpected remote callback URL: ${callbackUrl.href}`)
  }
  const response = await fetch(callbackUrl, {
    method: callback.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(callback.headers ?? {}),
    },
    body: JSON.stringify({
      status: 'COMPLETED',
      externalRunId: run.externalRunId,
      langfuseRunName: run.langfuseRunName,
      message: 'Scene experiment E2E remote runner completed',
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Remote callback failed ${response.status}: ${text}`)
  }
  return JSON.parse(text)
}

function createRemoteExperimentRunner({ fixture }) {
  const events = []
  const backgroundErrors = []
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/e2e-webhook') {
      response.statusCode = 404
      response.end('not found')
      return
    }

    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      const body = JSON.parse(raw || '{}')
      const authorization = request.headers.authorization ?? ''
      const run = {
        externalRunId: `scene-e2e-remote-run-${stamp}-${events.length + 1}`,
        langfuseRunName: body.payload?.langfuseRunName,
        paExperimentGroupId: body.payload?.paExperimentGroupId,
        paReportId: body.payload?.paReportId,
      }
      events.push({ authorization, body, run, datasetRunItems: [] })
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          accepted: true,
          externalRunId: run.externalRunId,
          langfuseRunName: run.langfuseRunName,
          status: 'QUEUED',
        })
      )
      void (async () => {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
        if (authorization !== `Bearer ${webhookToken}`) {
          throw new Error(`Webhook auth header mismatch: ${authorization}`)
        }
        if (!run.langfuseRunName || !run.paReportId) {
          throw new Error('Remote experiment request is missing run context')
        }
        for (const [index, item] of fixture.datasetItems.entries()) {
          const trace = await ingestLangfuseTrace({
            apiKey: fixture.apiKey,
            run,
            item,
            index,
          })
          await waitForLangfuseTrace(fixture.apiKey, trace.traceId)
          const datasetRunItem = await createDatasetRunItem({
            apiKey: fixture.apiKey,
            run,
            item,
            traceId: trace.traceId,
          })
          events.at(-1).datasetRunItems.push(datasetRunItem)
        }
        await waitForDatasetRunItems({
          apiKey: fixture.apiKey,
          datasetId: fixture.dataset.id,
          runName: run.langfuseRunName,
          expectedCount: fixture.datasetItems.length,
        })
        await completeRemoteExperiment(body.callback, run)
      })().catch((error) => {
        backgroundErrors.push(error)
        console.error(error.stack || error)
      })
    })
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(config.webhookPort, config.webhookHost, () => {
      server.off('error', reject)
      resolvePromise({ server, events, backgroundErrors })
    })
  })
}

async function waitForExperimentReportCompleted(auth, projectId, reportId) {
  const deadline = Date.now() + 45000
  let latest = null
  while (Date.now() < deadline) {
    latest = await api(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/experiment-reports/${encodeURIComponent(reportId)}`,
      auth
    )
    if (latest.status === 'COMPLETED') return latest
    if (latest.status === 'FAILED') {
      throw new Error(`Experiment report failed: ${latest.insight ?? latest.errorMessage ?? ''}`)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
  }
  throw new Error(`Experiment report did not complete in time: ${latest?.status ?? 'unknown'}`)
}

async function clickNext(page) {
  await page.getByRole('button', { name: '下一步', exact: true }).click()
}

async function runPageFlow(auth, fixture, webhook) {
  void webhook
  const launchOptions = { headless: true }
  if (existsSync(config.chromePath)) launchOptions.executablePath = config.chromePath
  const browser = await chromium.launch(launchOptions)
  const context = await browser.newContext({
    baseURL: config.frontendUrl,
    viewport: { width: 1440, height: 1000 },
  })

  await context.addInitScript(
    ({ cookieName, token }) => {
      document.cookie = `${cookieName}=${JSON.stringify(token)}; path=/`
      localStorage.setItem('pa_eval_environment', 'general')
    },
    { cookieName: auth.cookieName, token: auth.token }
  )
  await context.route('**/api/**', async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        cookie: `${auth.cookieName}=${auth.token}`,
      },
    })
  })

  const page = await context.newPage()
  const consoleErrors = []
  const requestFailures = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    requestFailures.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`
    )
  })

  const projectId = fixture.project.id
  const sceneName = `Page E2E Scene ${stamp}`
  const experimentName = `Page E2E Experiment ${stamp}`
  let experimentResponseBody = null

  try {
    await page.goto(`/projects/${encodeURIComponent(projectId)}/scenes?tab=management`, {
      waitUntil: 'networkidle',
    })
    await page.getByText('场景管理').waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: /新增场景/ }).click()
    await page.locator('#scene-name').fill(sceneName)
    await page.locator('#scene-description').fill('scene page e2e')
    await clickNext(page)
    await page.getByText(fixture.dataset.name, { exact: false }).first().click()
    await clickNext(page)
    await page.getByLabel('服务名称').fill('Page E2E Webhook')
    await page.getByLabel('版本').fill('v1')
    await page.getByLabel('远程触发 URL').fill(webhookUrl)
    await page.getByLabel('服务系列').fill('page-e2e-agent')
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: /Bearer Token/ }).click()
    await page.getByLabel('密钥环境变量').fill(config.webhookTokenRef)
    await page.getByLabel('一次性密钥').fill(webhookToken)
    await clickNext(page)
    await page.getByLabel(`选择评估器 ${fixture.evaluator.name}`).click()
    await clickNext(page)
    await clickNext(page)

    const createSceneResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/projects/') &&
        response.url().endsWith('/scenes') &&
        response.request().method() === 'POST',
      { timeout: 20000 }
    )
    await page.getByRole('button', { name: '确认创建', exact: true }).click()
    const createSceneResponse = await createSceneResponsePromise
    const createSceneText = await createSceneResponse.text()
    if (!createSceneResponse.ok()) {
      throw new Error(
        `Create scene failed ${createSceneResponse.status()}: ${createSceneText}`
      )
    }
    const createdScene = JSON.parse(createSceneText)
    if (createdScene.data?.webhooks?.[0]?.credentialRef !== config.webhookTokenRef) {
      throw new Error('Created scene did not persist credentialRef')
    }
    if (createdScene.data?.webhooks?.[0]?.credential) {
      throw new Error('Created scene unexpectedly persisted a raw credential')
    }

    await page.goto(`/projects/${encodeURIComponent(projectId)}/scenes?tab=experiments`, {
      waitUntil: 'networkidle',
    })
    await page.getByRole('button', { name: /运行试验/ }).click()
    await page.locator('#experiment-name').fill(experimentName)
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: sceneName }).click()
    await clickNext(page)
    await clickNext(page)
    await page.getByText('选择远程运行服务').waitFor({ timeout: 15000 })
    await page.getByLabel('选择 Page E2E Webhook').click()
    await clickNext(page)
    if (!(await page.getByLabel(`选择 ${fixture.evaluator.name}`).isChecked())) {
      await page.getByLabel(`选择 ${fixture.evaluator.name}`).click()
    }
    await clickNext(page)
    await clickNext(page)

    const experimentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/experiments') &&
        response.request().method() === 'POST',
      { timeout: 30000 }
    )
    await page.getByRole('button', { name: '确认执行', exact: true }).click()
    const experimentResponse = await experimentResponsePromise
    const experimentText = await experimentResponse.text()
    if (!experimentResponse.ok()) {
      throw new Error(
        `Run experiment failed ${experimentResponse.status()}: ${experimentText}`
      )
    }
    experimentResponseBody = JSON.parse(experimentText)

    await page.waitForTimeout(1500)
    const bodyText = await page.locator('body').innerText()
    return {
      sceneName,
      experimentName,
      experimentResponseBody,
      pageHasExperiment: bodyText.includes(experimentName),
      consoleErrors,
      requestFailures,
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  const auth = await createAuthSession()
  const fixture = await discoverFixture(auth)
  const webhook = await createRemoteExperimentRunner({ fixture })

  try {
    const pageResult = await runPageFlow(auth, fixture, webhook)
    const reports = pageResult.experimentResponseBody?.data?.reports ?? []
    const report = reports[0]
    if (!report) throw new Error('Experiment response did not include a report')
    if (!webhook.events.length) throw new Error('Webhook was not called')
    if (webhook.events[0].authorization !== `Bearer ${webhookToken}`) {
      throw new Error(`Webhook auth header mismatch: ${webhook.events[0].authorization}`)
    }
    const reportDetail = await waitForExperimentReportCompleted(
      auth,
      fixture.project.id,
      report.id
    )
    const firstItem = reportDetail.itemResults?.[0]
    if (!firstItem?.traceId) throw new Error('Report item missing traceId')
    if (!firstItem?.langfuseDatasetRunItemId) {
      throw new Error('Report item missing langfuseDatasetRunItemId')
    }
    if (!pageResult.pageHasExperiment) {
      throw new Error('Experiment was not visible on the report page after submission')
    }
    if (pageResult.consoleErrors.length) {
      throw new Error(`Console errors:\n${pageResult.consoleErrors.join('\n')}`)
    }
    if (pageResult.requestFailures.length) {
      throw new Error(`Request failures:\n${pageResult.requestFailures.join('\n')}`)
    }
    if (webhook.backgroundErrors.length) {
      throw new Error(
        `Remote runner errors:\n${webhook.backgroundErrors
          .map((error) => error.stack || error.message || String(error))
          .join('\n')}`
      )
    }

    console.log(
      JSON.stringify(
        {
          projectId: fixture.project.id,
          datasetId: fixture.dataset.id,
          evaluatorId: fixture.evaluator.id,
          sceneName: pageResult.sceneName,
          experimentName: pageResult.experimentName,
          reportId: report.id,
          status: reportDetail.status,
          webhookCalls: webhook.events.length,
          datasetRunItems: webhook.events.reduce(
            (total, event) => total + event.datasetRunItems.length,
            0
          ),
          authHeaderOk: true,
          traceId: firstItem.traceId,
          langfuseDatasetRunItemId: firstItem.langfuseDatasetRunItemId,
          pageHasExperiment: true,
        },
        null,
        2
      )
    )
  } finally {
    await new Promise((resolvePromise) => webhook.server.close(resolvePromise))
  }
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
