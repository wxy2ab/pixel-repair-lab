import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { projectDirectory } from '../projectDirectory'
import { parseCandidate, maxPromptLength } from '../ai/core'
import { AiProviderError, hasAiProvider, requestAiTurn } from '../ai/provider'
import type { AiTurnInput } from '../shared/types'
import { scanLevels } from './catalog'
import { handleLabApi } from '../labs/server'
import { runProgramWalkthrough } from '../engine/programWalkthrough'

const distDirectory = resolve(projectDirectory, 'dist')
declare const PORTABLE_BUILD: boolean
const maxRequestBytes = 16 * 1024
const port = Number(process.env.PORT ?? 5173)
const host = '127.0.0.1'
const attachedToLauncher = process.argv.includes('--parent-stdin')

if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.')

const providerStatus = {
  unavailable: 503,
  'invalid-input': 400,
  timeout: 504,
  network: 502,
  'invalid-response': 502,
} as const

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

function sameOrigin(request: IncomingMessage): boolean {
  const site = request.headers['sec-fetch-site']
  if (site === 'cross-site' || site === 'same-site') return false
  if (!request.headers.origin) return true
  const origin = URL.parse(request.headers.origin)
  return Boolean(origin && ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.host)
}

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume()
    throw new RequestError(415, 'content-type')
  }
  if (Number(request.headers['content-length']) > maxRequestBytes) {
    request.resume()
    throw new RequestError(413, 'invalid-input')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxRequestBytes) {
      request.resume()
      throw new RequestError(413, 'invalid-input')
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RequestError(400, 'invalid-input')
  }
}

async function aiTurn(request: IncomingMessage, response: ServerResponse) {
  const input = await readJson(request)
  if (typeof input !== 'object' || input === null || !('levelId' in input) || !('locale' in input) || !('prompt' in input)) {
    throw new RequestError(400, 'invalid-input')
  }
  const { levelId, locale, prompt } = input
  if (typeof levelId !== 'string' || levelId.length > 64 || (locale !== 'zh' && locale !== 'en')
    || typeof prompt !== 'string' || !prompt.trim() || prompt.length > maxPromptLength) {
    throw new RequestError(400, 'invalid-input')
  }
  const { entries } = await scanLevels()
  const level = entries.find(({ level }) => level.id === levelId)?.level
  if (level?.kind !== 'ai') throw new RequestError(404, 'invalid-input')

  const turn: AiTurnInput = { levelId, locale, prompt }
  if ('previousCandidate' in input) {
    const candidate = parseCandidate(level, input.previousCandidate)
    if (!candidate) throw new RequestError(400, 'invalid-input')
    turn.previousCandidate = candidate
  }
  json(response, 200, { candidate: await requestAiTurn(level, turn, process.env) })
}

async function runProgramSample(request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request)
  if (typeof body !== 'object' || body === null || Object.keys(body).length !== 2 || !('levelId' in body) || !('input' in body)
    || typeof body.levelId !== 'string' || body.levelId.length > 64 || typeof body.input !== 'number' || !Number.isSafeInteger(body.input)) {
    throw new RequestError(400, 'invalid-input')
  }
  const { levelId, input } = body
  const { entries } = await scanLevels()
  const level = entries.find(({ level }) => level.id === levelId)?.level
  const execution = level?.kind === 'lecture' ? level.execution : undefined
  if (execution?.intro?.interface !== 'web') throw new RequestError(404, 'unknown-program')
  if (!execution.cases.some(example => example.input === input)) throw new RequestError(400, 'invalid-input')

  const result = runProgramWalkthrough(execution.source, input)
  if (result.issue || result.output.length !== 1) throw new RequestError(422, 'program-output')
  json(response, 200, { input, output: result.output[0] })
}

async function api(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (!sameOrigin(request)) {
    request.resume()
    return json(response, 403, { error: 'origin' })
  }
  if (pathname.startsWith('/api/labs/')) return handleLabApi(request, response, pathname)
  const method = pathname === '/api/ai/turn' || pathname === '/api/program/run' ? 'POST'
    : pathname === '/api/levels' || pathname === '/api/ai/status' ? 'GET' : undefined
  if (!method) return json(response, 404, { error: 'unknown-route' })
  if (request.method !== method) {
    request.resume()
    response.setHeader('Allow', method)
    return json(response, 405, { error: 'method' })
  }
  if (pathname === '/api/levels') {
    const { entries, issues } = await scanLevels()
    return json(response, 200, { levels: entries.map(({ level }) => level), issues })
  }
  if (pathname === '/api/ai/status') return json(response, 200, { available: hasAiProvider(process.env) })
  if (pathname === '/api/program/run') return runProgramSample(request, response)
  await aiTurn(request, response)
}

function text(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(message)
}

async function serveProduction(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    return text(response, 405, 'Method not allowed')
  }
  const decoded = decodeURIComponent(pathname)
  let filename = resolve(distDirectory, '.' + decoded)
  const path = relative(distDirectory, filename)
  if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path) || decoded.includes('\\') || decoded.includes('\0')) {
    return text(response, 404, 'Not found')
  }
  if (!extname(filename) || !path) filename = resolve(distDirectory, 'index.html')
  try {
    const buffer = await readFile(filename)
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filename)] ?? 'application/octet-stream',
      'Content-Length': buffer.length,
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(request.method === 'HEAD' ? undefined : buffer)
  } catch {
    text(response, 404, 'Not found')
  }
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname === '/api' || pathname.startsWith('/api/')) return api(request, response, pathname)
  if (!vite) return serveProduction(request, response, pathname)
  vite.middlewares(request, response, () => text(response, 404, 'Not found'))
}

const server = createServer({ requestTimeout: 30000 }, (request, response) => {
  void handle(request, response).catch(error => {
    if (response.headersSent || response.destroyed) return
    if (error instanceof RequestError) return json(response, error.status, { error: error.code })
    if (error instanceof AiProviderError) return json(response, providerStatus[error.code], { error: error.code })
    if (error instanceof URIError) return text(response, 400, 'Invalid URL')
    json(response, 500, { error: 'internal' })
  })
})

// The desktop launcher owns the write end of this pipe. EOF also covers a forced
// quit, when AppKit has no opportunity to terminate the child explicitly.
if (attachedToLauncher) {
  process.stdin.once('end', () => process.exit(process.exitCode ?? 0))
  process.stdin.resume()
}

const vite = (typeof PORTABLE_BUILD !== 'undefined' && PORTABLE_BUILD) || process.argv.includes('--production') ? null : await (await import('vite')).createServer({
  root: projectDirectory,
  server: { host, port, middlewareMode: true, hmr: { server } },
  appType: 'spa',
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (attachedToLauncher) process.stdin.destroy()
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。若游戏已启动，请打开 http://${host}:${port}。也可在 .env 中设置其他 PORT 后重新启动。`)
    console.error(`Port ${port} is in use. If the game is already running, open http://${host}:${port}. To use another port, change PORT in .env and restart.`)
  } else {
    console.error(error.message)
  }
  process.exitCode = 1
  void vite?.close()
})

server.listen(port, host, () => {
  const address = server.address()
  if (!address || typeof address !== 'object') return
  const url = `http://${host}:${address.port}`
  console.log(`Pixel Repair Lab is running at ${url}`)
  if (!process.argv.includes('--open')) return
  const openers: Record<string, [string, string[]]> = {
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
    win32: [resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url]],
  }
  const opener = openers[process.platform]
  if (!opener) return
  const browser = spawn(...opener, { detached: true, stdio: 'ignore', windowsHide: true })
  const manual = () => console.log(`请在浏览器中打开 / Open in your browser: ${url}`)
  browser.once('error', manual)
  browser.once('exit', code => { if (code !== 0) manual() })
  browser.unref()
})
