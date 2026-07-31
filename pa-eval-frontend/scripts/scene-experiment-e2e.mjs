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
  if (!keys.datas?.length) {
    await api(
      'POST',
      `/api/projects/${encodeURIComponent(project.id)}/settings/api-keys`,
      auth,
      { note: 'Scene experiment page E2E key' }
    )
  }

  return { project, dataset, evaluator }
}

function startWebhook() {
  const events = []
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
      const itemId = body.datasetItemId ?? 'unknown'
      events.push({ authorization, body })
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          output: { answer: `scene e2e output ${itemId}` },
          traceId: `scene-e2e-trace-${itemId}-${Date.now()}`,
          observationId: `scene-e2e-observation-${itemId}`,
          metadata: {
            authOk: authorization === `Bearer ${webhookToken}`,
            datasetRunItems: true,
          },
        })
      )
    })
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(config.webhookPort, config.webhookHost, () => {
      server.off('error', reject)
      resolvePromise({ server, events })
    })
  })
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
    await page.getByLabel('Webhook URL').fill(webhookUrl)
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
    await page.getByText('选择 Webhook 服务').waitFor({ timeout: 15000 })
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
  const webhook = await startWebhook()

  try {
    const pageResult = await runPageFlow(auth, fixture, webhook)
    const reports = pageResult.experimentResponseBody?.data?.reports ?? []
    const report = reports[0]
    if (!report) throw new Error('Experiment response did not include a report')
    if (report.status !== 'COMPLETED') {
      throw new Error(`Experiment report status is ${report.status}`)
    }
    if (!webhook.events.length) throw new Error('Webhook was not called')
    if (webhook.events[0].authorization !== `Bearer ${webhookToken}`) {
      throw new Error(`Webhook auth header mismatch: ${webhook.events[0].authorization}`)
    }
    const reportDetail = await api(
      'GET',
      `/api/projects/${encodeURIComponent(fixture.project.id)}/experiment-reports/${encodeURIComponent(report.id)}`,
      auth
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

    console.log(
      JSON.stringify(
        {
          projectId: fixture.project.id,
          datasetId: fixture.dataset.id,
          evaluatorId: fixture.evaluator.id,
          sceneName: pageResult.sceneName,
          experimentName: pageResult.experimentName,
          reportId: report.id,
          status: report.status,
          webhookCalls: webhook.events.length,
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
