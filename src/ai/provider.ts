import type { AiLevel, AiTurnInput, Candidate } from '../shared/types'
import { maxItemQuantity, maxPromptLength, parseCandidate } from './core'

type AiErrorCode = 'unavailable' | 'invalid-input' | 'timeout' | 'network' | 'invalid-response'

export class AiProviderError extends Error {
  constructor(public readonly code: AiErrorCode) {
    super(code)
    this.name = 'AiProviderError'
  }
}

function providerConfig(env: NodeJS.ProcessEnv) {
  const baseUrl = env.AI_API_BASE_URL?.trim()
  const key = env.AI_API_KEY?.trim()
  const model = env.AI_API_MODEL?.trim()
  if (!baseUrl || !key || !model) return null

  const endpoint = URL.parse(baseUrl)
  if (!endpoint || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) return null

  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '')
  if (!endpoint.pathname.endsWith('/chat/completions')) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/chat/completions`
  }
  return { endpoint, key, model }
}

export function hasAiProvider(env: NodeJS.ProcessEnv): boolean {
  return providerConfig(env) !== null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readCompletion(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new AiProviderError('invalid-response')
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw new AiProviderError('invalid-response')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new AiProviderError('invalid-response')
  }
}

function completionCandidate(level: AiLevel, result: unknown): Candidate {
  const choice: unknown = isRecord(result) && Array.isArray(result.choices) ? result.choices[0] : undefined
  const content = isRecord(choice) && isRecord(choice.message) ? choice.message.content : undefined
  if (typeof content !== 'string') throw new AiProviderError('invalid-response')

  let candidate: Candidate | null
  try {
    const json = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1] ?? content
    candidate = parseCandidate(level, JSON.parse(json))
  } catch {
    throw new AiProviderError('invalid-response')
  }
  if (!candidate) throw new AiProviderError('invalid-response')
  return candidate
}

export async function requestAiTurn(level: AiLevel, input: AiTurnInput, env: NodeJS.ProcessEnv): Promise<Candidate> {
  const config = providerConfig(env)
  if (!config) throw new AiProviderError('unavailable')
  if (input.levelId !== level.id || !['zh', 'en'].includes(input.locale)
    || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > maxPromptLength) {
    throw new AiProviderError('invalid-input')
  }
  const draft = input.previousCandidate === undefined ? level.workflow?.draft : input.previousCandidate
  const previous = draft === undefined ? undefined : parseCandidate(level, draft)
  if (previous === null) throw new AiProviderError('invalid-input')

  const inventory = level.inventory.map(({ id, label, aliases }) => ({ id, label: label[input.locale], aliases }))
  const timeout = AbortSignal.timeout(15000)
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
      redirect: 'error',
      signal: timeout,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are a packing assistant in a puzzle. Follow the learner\'s packing request.',
              'If it is a correction, preserve other items from the previous manifest.',
              'Use only item IDs in the inventory. Omit items with zero quantity. Do not invent items.',
              `Return only a JSON object {"items":[{"id":"item-id","quantity":1}]} with unique IDs and integer quantities 1–${maxItemQuantity}.`,
              `Inventory: ${JSON.stringify(inventory)}`,
              `Previous manifest: ${JSON.stringify(previous ?? { items: [] })}`,
            ].join('\n'),
          },
          { role: 'user', content: input.prompt.trim() },
        ],
      }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new AiProviderError('network')
    }
    return completionCandidate(level, await readCompletion(response))
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError(timeout.aborted ? 'timeout' : 'network')
  }
}
