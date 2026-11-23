import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import type { AiLevel, Candidate, Catalog } from '../shared/types'
import { checkAudit, gradeCandidate, injectTrainingFault, parseCandidate, runPracticeTurn, simulateCandidate, verifyAiLevel } from './core'
import { AiProviderError, hasAiProvider, requestAiTurn } from './provider'

const level = JSON.parse(readFileSync(new URL('../../levels/11-ai-supply-box.json', import.meta.url), 'utf8')) as AiLevel
const providerEnv = {
  AI_API_BASE_URL: 'http://127.0.0.1:11434/v1/',
  AI_API_KEY: 'unit-test-key',
  AI_API_MODEL: 'test-model',
}

test('the bundled AI lesson demonstrates a mistake and correction in both languages', () => {
  assert.deepEqual(verifyAiLevel(level), [])
  for (const locale of ['zh', 'en'] as const) {
    const [first, second] = level.examplePrompts[locale]
    const beforeFault = simulateCandidate(level, first)
    assert.ok(gradeCandidate(level, beforeFault).every(({ expected, actual }) => expected === actual))
    const flawed = injectTrainingFault(level, beforeFault)
    assert.deepEqual(gradeCandidate(level, flawed).filter(({ expected, actual }) => expected !== actual), [
      { id: 'battery', expected: 2, actual: 3 },
    ])
    const corrected = simulateCandidate(level, second, flawed)
    assert.deepEqual(corrected, beforeFault)
  }
})

test('the simulator understands aliases, counts, exclusions, and incremental edits', () => {
  const first = simulateCandidate(level, 'Pack two water bottles, 3 batteries and a magnet.')
  assert.deepEqual(first.items, [
    { id: 'water', quantity: 2 }, { id: 'battery', quantity: 3 }, { id: 'magnet', quantity: 1 },
  ])
  const revised = simulateCandidate(level, 'Water bottles: one. 电芯改为２节。去掉磁石。', first)
  assert.deepEqual(revised.items, [{ id: 'water', quantity: 1 }, { id: 'battery', quantity: 2 }])
  assert.deepEqual(simulateCandidate(level, 'Do not pack any batteries.', revised).items, [{ id: 'water', quantity: 1 }])
})

test('practice starts from the supplied draft, audits each new mistake, and preserves repaired items', () => {
  const project: AiLevel = {
    ...level,
    trainingFault: undefined,
    workflow: {
      review: 'manual',
      draft: { items: [{ id: 'water', quantity: 1 }] },
      faults: [{ itemId: 'battery', quantity: 0 }, { itemId: 'magnet', quantity: 1 }],
    },
    examplePrompts: {
      zh: ['电池改为两节。', '请把电池改为两节。', '去掉磁铁。'],
      en: ['Set batteries to two.', 'Restore two batteries.', 'Remove the magnet.'],
    },
  }
  assert.deepEqual(verifyAiLevel(project), [])

  const [initial, correction, final] = project.examplePrompts.en
  const first = runPracticeTurn(project, initial, undefined, 0)
  assert.deepEqual(first, {
    candidate: { items: [{ id: 'water', quantity: 1 }] },
    fault: { itemId: 'battery', quantity: 0 },
  })
  assert.equal(checkAudit(project, first.candidate, ['battery']), true)
  for (const selected of [[], ['water'], ['battery', 'battery'], ['battery', 'foreign']]) {
    assert.equal(checkAudit(project, first.candidate, selected), false)
  }

  const second = runPracticeTurn(project, correction, first.candidate, 1)
  assert.deepEqual(gradeCandidate(project, second.candidate).map(({ actual }) => actual), [1, 2, 1])
  assert.equal(checkAudit(project, second.candidate, ['magnet']), true)

  const corrected = runPracticeTurn(project, final, second.candidate, 2)
  assert.equal(corrected.fault, undefined)
  assert.equal(checkAudit(project, corrected.candidate, []), true)
  assert.equal(checkAudit(project, corrected.candidate, ['magnet']), false)
  assert.ok(verifyAiLevel({ ...project, examplePrompts: { zh: [initial], en: [initial, correction, correction] } }).length >= 2)
})

test('a course exercise can teach prompt precision without an injected mistake', () => {
  const exercise: AiLevel = {
    ...level,
    trainingFault: undefined,
    workflow: { review: 'automatic', faults: [] },
    examplePrompts: { zh: [level.examplePrompts.zh[0]], en: [level.examplePrompts.en[0]] },
  }
  const result = runPracticeTurn(exercise, exercise.examplePrompts.en[0], undefined, 0)
  assert.deepEqual(verifyAiLevel(exercise), [])
  assert.equal(result.fault, undefined)
  assert.equal(checkAudit(exercise, result.candidate, []), true)
})

test('candidate input rejects duplicate items, foreign IDs, and invalid quantities', () => {
  for (const input of [null, {}, { items: 'battery' },
    { items: [{ id: 'foreign', quantity: 1 }] },
    { items: [{ id: 'battery', quantity: 1 }, { id: 'battery', quantity: 2 }] },
    { items: [{ id: 'battery', quantity: -1 }] },
    { items: [{ id: 'battery', quantity: 100 }] },
    { items: [{ id: 'battery', quantity: 1.5 }] },
  ]) assert.equal(parseCandidate(level, input), null)
  assert.deepEqual(parseCandidate(level, { items: [{ id: 'magnet', quantity: 1 }, { id: 'water', quantity: 2 }] }), {
    items: [{ id: 'water', quantity: 2 }, { id: 'magnet', quantity: 1 }],
  })
})

test('providers require a complete configuration and HTTPS or loopback HTTP', () => {
  assert.equal(hasAiProvider({}), false)
  assert.equal(hasAiProvider(providerEnv), true)
  assert.equal(hasAiProvider({ ...providerEnv, AI_API_BASE_URL: 'http://example.com/v1' }), false)
  assert.equal(hasAiProvider({ ...providerEnv, AI_API_BASE_URL: 'https://example.com/v1' }), true)
  assert.equal(hasAiProvider({ ...providerEnv, AI_API_BASE_URL: 'https://secret@example.com/v1' }), false)
})

test('provider sends only the current exercise and validates the returned manifest', async (context) => {
  const candidate = { items: [{ id: 'water', quantity: 1 }] }
  const prompt = 'Pack a water bottle.'
  const request = context.mock.method(globalThis, 'fetch', async (target: URL, body: RequestInit) => {
    assert.equal(target.href, 'http://127.0.0.1:11434/v1/chat/completions')
    assert.equal(body.redirect, 'error')
    assert.equal(new Headers(body.headers).get('authorization'), 'Bearer unit-test-key')
    assert.equal(typeof body.body, 'string')
    const payload = JSON.parse(String(body.body))
    assert.equal(payload.model, 'test-model')
    assert.equal(payload.messages[1].content, prompt)
    assert.match(payload.messages[0].content, /Previous manifest:/u)
    assert.ok(!payload.messages[0].content.includes(level.brief.en))
    assert.ok(!payload.messages[0].content.includes(JSON.stringify(level.required)))
    return Response.json({ choices: [{ message: { content: JSON.stringify(candidate) } }] })
  })
  assert.deepEqual(await requestAiTurn(level, { levelId: level.id, locale: 'en', prompt }, providerEnv), candidate)
  assert.equal(request.mock.callCount(), 1)
})

test('provider errors are translated into stable codes without returning response data', async (context) => {
  const input = { levelId: level.id, locale: 'en' as const, prompt: 'Pack a water bottle.' }
  const request = context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'private provider error' }, { status: 502 }))
  await assert.rejects(requestAiTurn(level, input, {}), { name: 'AiProviderError', code: 'unavailable' })
  await assert.rejects(requestAiTurn(level, { ...input, prompt: ' ' }, providerEnv), { code: 'invalid-input' })
  assert.equal(request.mock.callCount(), 0)
  await assert.rejects(requestAiTurn(level, input, providerEnv), (error: unknown) =>
    error instanceof AiProviderError && error.code === 'network' && error.message === 'network')

  request.mock.mockImplementationOnce(async () => Response.json({ choices: [{ message: { content: 'not JSON' } }] }))
  await assert.rejects(requestAiTurn(level, input, providerEnv), { code: 'invalid-response' })
})

test('the configured project API forwards the previous manifest and preserves the provider result', { timeout: 20_000 }, async context => {
  type CompletionRequest = { model: string; messages: { role: string; content: string }[] }
  const sent: { path: string | undefined; authorization: string | undefined; payload: CompletionRequest }[] = []
  const responses: Candidate[] = []
  const provider = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    const candidate = responses[sent.length]
    sent.push({ path: request.url, authorization: request.headers.authorization, payload: JSON.parse(body) as CompletionRequest })
    response.writeHead(candidate ? 200 : 400, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }))
  })
  provider.listen(0, '127.0.0.1')
  context.after(() => { provider.closeAllConnections(); provider.close() })
  await once(provider, 'listening')
  const providerAddress = provider.address()
  assert.ok(providerAddress && typeof providerAddress === 'object')

  const app = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', '--production'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, ...providerEnv, PORT: '0', AI_API_BASE_URL: `http://127.0.0.1:${providerAddress.port}/v1` },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  context.after(async () => {
    if (app.exitCode !== null || app.signalCode !== null) return
    const exit = once(app, 'exit')
    app.kill()
    await exit
  })
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = ''
    app.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
      const url = output.match(/running at (http:\/\/127\.0\.0\.1:\d+)/u)?.[1]
      if (url) resolve(url)
    })
    app.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
    app.once('error', reject)
    app.once('exit', code => reject(new Error(`Game server exited with code ${code}. ${output}`)))
  })

  const { levels } = await (await fetch(endpoint + '/api/levels')).json() as Catalog
  const project = levels.find((entry): entry is AiLevel => entry.kind === 'ai' && entry.courseFinal === true)
  assert.ok(project)
  assert.deepEqual(await (await fetch(endpoint + '/api/ai/status')).json(), { available: true })

  const [firstPrompt, revision] = project.examplePrompts.en
  const complete = { items: project.inventory.flatMap(({ id }) => Object.hasOwn(project.required, id) ? [{ id, quantity: project.required[id] }] : []) }
  const incomplete = { items: complete.items.slice(1) }
  responses.push(incomplete, complete)
  async function runTurn(levelId: string, prompt: string, previousCandidate?: Candidate) {
    const response = await fetch(endpoint + '/api/ai/turn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levelId, locale: 'en', prompt, previousCandidate }),
    })
    assert.equal(response.status, 200)
    return await response.json() as { candidate: Candidate }
  }

  const first = await runTurn(project.id, firstPrompt)
  assert.deepEqual(first, { candidate: incomplete })
  assert.deepEqual(await runTurn(project.id, revision, first.candidate), { candidate: complete })
  assert.equal(sent.length, 2)
  for (const [index, call] of sent.entries()) {
    assert.equal(call.path, '/v1/chat/completions')
    assert.equal(call.authorization, 'Bearer unit-test-key')
    assert.equal(call.payload.model, 'test-model')
    assert.equal(call.payload.messages.find(message => message.role === 'user')?.content, [firstPrompt, revision][index])
    const system = call.payload.messages.find(message => message.role === 'system')?.content
    assert.ok(typeof system === 'string')
    assert.ok(system.endsWith(`Previous manifest: ${JSON.stringify(index === 0 ? project.workflow?.draft ?? { items: [] } : incomplete)}`))
    assert.ok(!system.includes(project.brief.en))
    assert.ok(!system.includes(JSON.stringify(project.required)))
  }

  const draftExercise = levels.find((entry): entry is AiLevel => entry.kind === 'ai' && entry.workflow?.draft !== undefined)
  assert.ok(draftExercise)
  const draft = parseCandidate(draftExercise, draftExercise.workflow?.draft)
  assert.ok(draft)
  responses.push(draft)
  assert.deepEqual(await runTurn(draftExercise.id, draftExercise.examplePrompts.en[0]), { candidate: draft })
  assert.ok(sent.at(-1)?.payload.messages[0].content.endsWith(`Previous manifest: ${JSON.stringify(draft)}`))
})
