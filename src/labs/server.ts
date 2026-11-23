import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { projectDirectory } from '../projectDirectory'
import { parseDataRequest, type DataRequest, type DataResult } from '../shared/dataCourse'
import { parseVisionRequest, type VisionRequest, type VisionResult } from '../shared/vision'
import { parseDemoRequest, type DemoRequest, type DemoResult, type DemoStatus } from './contracts'

const labsDirectory = join(projectDirectory, 'labs')
const python = process.env.PIXEL_REPAIR_PYTHON
  ?? join(labsDirectory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const runner = join(labsDirectory, 'runner.py')
const dataRunner = join(labsDirectory, 'data_course.py')
const visionRunner = join(labsDirectory, 'vision_course.py')
const limit = 2048
const unavailable: DemoStatus = {
  available: false, recipes: { numpy: false, pandas: false, analysis: false, sql: false, opencv: false, yolox: false },
}
let activeRuns = 0
let cachedStatus: { expires: number; value: Promise<DemoStatus> } | undefined

function runPython(script: string, args: string[], stdin?: string): Promise<string> {
  const keys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']
  const env = Object.fromEntries(keys.flatMap((key) => {
    const value = process.env[key]
    return value === undefined ? [] : [[key, value]]
  }))

  return new Promise((resolve, reject) => {
    const child = execFile(python, ['-I', '-B', script, ...args], {
      env, timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 768 * 1024, windowsHide: true,
    }, (error, stdout) => error ? reject(error) : resolve(stdout))
    child.stdin?.on('error', () => { /* The process reports a failed start or early exit through its callback. */ })
    child.stdin?.end(stdin)
  })
}

async function probe(): Promise<DemoStatus> {
  try {
    await access(python)
    const recipes = JSON.parse(await runPython(runner, ['--status'])) as DemoStatus['recipes']
    return { available: Object.values(recipes).some(Boolean), recipes }
  } catch {
    return unavailable
  }
}

export function getLabStatus(): Promise<DemoStatus> {
  const now = Date.now()
  if (!cachedStatus || cachedStatus.expires < now) cachedStatus = { expires: now + 3000, value: probe() }
  return cachedStatus.value
}

export async function runLabDemo(input: DemoRequest): Promise<DemoResult> {
  return JSON.parse(await runPython(runner, [], JSON.stringify(input))) as DemoResult
}

export async function runDataCourse(input: DataRequest): Promise<DataResult> {
  return JSON.parse(await runPython(dataRunner, [], JSON.stringify(input))) as DataResult
}

export async function runDataCourseBatch(inputs: DataRequest[]): Promise<(DataResult | null)[]> {
  const results: (DataResult | null)[] = []
  for (let index = 0; index < inputs.length; index += 30) {
    const batch = inputs.slice(index, index + 30)
    const output = await runPython(dataRunner, ['--batch'], JSON.stringify(batch))
    results.push(...JSON.parse(output) as (DataResult | null)[])
  }
  return results
}

export async function runVisionCourse(input: VisionRequest): Promise<VisionResult> {
  return JSON.parse(await runPython(visionRunner, [], JSON.stringify(input))) as VisionResult
}

export async function runVisionCourseBatch(inputs: VisionRequest[]): Promise<(VisionResult | null)[]> {
  const results: (VisionResult | null)[] = []
  for (let index = 0; index < inputs.length; index += 32) {
    const batch = inputs.slice(index, index + 32)
    const output = await runPython(visionRunner, ['--batch'], JSON.stringify(batch))
    results.push(...JSON.parse(output) as (VisionResult | null)[])
  }
  return results
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function readInput(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
    || Number(request.headers['content-length'] ?? 0) > limit) {
    request.resume()
    return null
  }

  let total = 0
  const chunks: Buffer[] = []
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      total += chunk.byteLength
      if (total > limit) {
        request.resume()
        return null
      }
      chunks.push(chunk)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return null
  }
}

export async function handleLabApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
  const dataCourse = pathname === '/api/labs/data'
  const visionCourse = pathname === '/api/labs/vision'
  const method = pathname === '/api/labs/status' ? 'GET' : pathname === '/api/labs/run' || dataCourse || visionCourse ? 'POST' : undefined
  if (!method) return send(response, 404, { error: 'unknown-route' })
  if (request.method !== method) {
    request.resume()
    response.setHeader('Allow', method)
    return send(response, 405, { error: 'method' })
  }
  if (method === 'GET') return send(response, 200, await getLabStatus())

  const body = await readInput(request)
  const input = dataCourse ? parseDataRequest(body) : visionCourse ? parseVisionRequest(body) : parseDemoRequest(body)
  if (!input) return send(response, 400, { error: 'invalid-input' })
  const required = 'recipe' in input ? input.recipe : 'steps' in input ? 'analysis'
    : input.mode === 'detect' || input.mode === 'boxes' || (input.mode === 'project' && input.action === 'run') ? 'yolox' : 'opencv'
  if (!(await getLabStatus()).recipes[required]) return send(response, 503, { error: 'lab-unavailable' })
  if (activeRuns >= 2) return send(response, 429, { error: 'lab-busy' })
  activeRuns++
  try {
    const result = 'recipe' in input ? await runLabDemo(input) : 'steps' in input ? await runDataCourse(input) : await runVisionCourse(input)
    return send(response, 200, { result })
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'killed' in error && error.killed ? 'lab-timeout' : 'lab-failed'
    return send(response, code === 'lab-timeout' ? 504 : 500, { error: code })
  } finally {
    activeRuns--
  }
}
