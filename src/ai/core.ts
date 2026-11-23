import type { AiFault, AiLevel, Candidate } from '../shared/types'

export const maxPromptLength = 1600
export const maxItemQuantity = 99

export type ItemCheck = { id: string; expected: number; actual: number }

const smallNumbers: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

const quantityWords = `\\d+|${Object.keys(smallNumbers).join('|')}`
const beforeItem = new RegExp(
  `(?:^|[^a-z\\d])(${quantityWords})\\s*(?:bottles?|pieces?|rolls?|packs?|[瓶节块个支卷套件])?\\s*(?:of\\s+)?$`,
  'iu',
)
const afterItem = new RegExp(`^\\s*(?:to\\b|at\\b|is\\b|[:=×]|x\\b|改成|改为|调成|设为|调整为|为|是)?\\s*(${quantityWords})(?![a-z\\d])`, 'iu')
const exclude = /\b(?:no|not|don['’]t|without|exclude|omit|remove|skip|leave out)\b|不要|不用|不放|去掉|移除|排除|别放|别装/u
const clauseBreak = /[\n，。；、,.!;！?？]|\b(?:and|but)\b|以及|并且|和|与/u

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectMentions(level: AiLevel, clause: string) {
  const mentions = level.inventory.flatMap((item) => {
    const aliases = [...new Set([...item.aliases, item.label.zh, item.label.en, item.id])]
    return aliases.flatMap((alias) => {
      const normalized = alias.normalize('NFKC').toLowerCase().trim()
      if (!normalized) return []
      const left = /^[a-z\d]/u.test(normalized) ? '(?<![a-z\\d])' : ''
      const right = /[a-z\d]$/u.test(normalized) ? '(?![a-z\\d])' : ''
      const pattern = new RegExp(`${left}${escapeRegExp(normalized)}${right}`, 'gu')
      return Array.from(clause.matchAll(pattern), (match) => ({
        id: item.id,
        start: match.index,
        end: match.index + match[0].length,
      }))
    })
  }).sort((left, right) => left.start - right.start || right.end - left.end)

  const matches: typeof mentions = []
  for (const mention of mentions) {
    if (mention.start >= (matches.at(-1)?.end ?? 0)) matches.push(mention)
  }
  return matches
}

export function simulateCandidate(level: AiLevel, prompt: string, previous?: Candidate): Candidate {
  const quantities = new Map(previous?.items.map(({ id, quantity }) => [id, quantity]))
  const clauses = prompt.normalize('NFKC').toLowerCase().split(clauseBreak)
  for (const clause of clauses) {
    const mentions = collectMentions(level, clause)
    for (const [index, mention] of mentions.entries()) {
      const before = clause.slice(mentions[index - 1]?.end ?? 0, mention.start)
      const after = clause.slice(mention.end, mentions[index + 1]?.start)
      const quantityText = before.match(beforeItem)?.[1] ?? after.match(afterItem)?.[1]
      const quantity = quantityText === undefined ? 1 : smallNumbers[quantityText] ?? Number(quantityText)
      if (exclude.test(before) || quantity === 0) {
        quantities.delete(mention.id)
      } else if (Number.isSafeInteger(quantity)) {
        quantities.set(mention.id, Math.min(maxItemQuantity, quantity))
      }
    }
  }
  return {
    items: level.inventory.flatMap(({ id }) => {
      const quantity = quantities.get(id)
      return quantity === undefined ? [] : [{ id, quantity }]
    }),
  }
}

function trainingFaults(level: AiLevel): AiFault[] {
  return level.workflow?.faults ?? (level.trainingFault ? [level.trainingFault] : [])
}

function applyTrainingFault(level: AiLevel, candidate: Candidate, { itemId, quantity }: AiFault): Candidate {
  const quantities = new Map(candidate.items.map((entry) => [entry.id, entry.quantity]))
  quantities.set(itemId, quantity)
  return {
    items: level.inventory.flatMap(({ id }) => {
      const actual = quantities.get(id)
      return actual ? [{ id, quantity: actual }] : []
    }),
  }
}

export function injectTrainingFault(level: AiLevel, candidate: Candidate): Candidate {
  const [fault] = trainingFaults(level)
  return fault ? applyTrainingFault(level, candidate, fault) : candidate
}

export function runPracticeTurn(level: AiLevel, prompt: string, previous: Candidate | undefined, turnIndex: number): { candidate: Candidate; fault?: AiFault } {
  const candidate = simulateCandidate(level, prompt, previous ?? level.workflow?.draft)
  const fault = trainingFaults(level)[turnIndex]
  return fault ? { candidate: applyTrainingFault(level, candidate, fault), fault } : { candidate }
}

export function gradeCandidate(level: AiLevel, candidate: Candidate): ItemCheck[] {
  const quantities = new Map(candidate.items.map(({ id, quantity }) => [id, quantity]))
  return level.inventory.map(({ id }) => ({
    id,
    expected: Object.hasOwn(level.required, id) ? level.required[id] : 0,
    actual: quantities.get(id) ?? 0,
  }))
}

export function checkAudit(level: AiLevel, candidate: Candidate, selectedIds: string[]): boolean {
  const mismatches = gradeCandidate(level, candidate).filter(({ actual, expected }) => actual !== expected)
  const selected = new Set(selectedIds)
  return selected.size === selectedIds.length && mismatches.length === selected.size && mismatches.every(({ id }) => selected.has(id))
}

export function parseCandidate(level: AiLevel, input: unknown): Candidate | null {
  if (typeof input !== 'object' || input === null || !('items' in input) || !Array.isArray(input.items)) return null
  if (input.items.length > level.inventory.length) return null
  const allowed = new Set(level.inventory.map(({ id }) => id))
  const found = new Map<string, number>()
  for (const entry of input.items as unknown[]) {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || !('quantity' in entry)) return null
    const { id, quantity } = entry
    if (typeof id !== 'string' || !allowed.has(id) || found.has(id)) return null
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > maxItemQuantity) return null
    found.set(id, quantity)
  }
  return {
    items: level.inventory.flatMap(({ id }) => {
      const quantity = found.get(id)
      return quantity === undefined ? [] : [{ id, quantity }]
    }),
  }
}

export function verifyAiLevel(level: AiLevel): string[] {
  const errors: string[] = []
  const faults = trainingFaults(level)
  for (const locale of ['zh', 'en'] as const) {
    const prompts = level.examplePrompts[locale]
    if (prompts.length <= faults.length || prompts.some(prompt => !prompt.trim())) {
      errors.push(`${locale} needs an initial prompt and a revision for each scripted mistake`)
      continue
    }
    let previous: Candidate | undefined
    for (const [index, prompt] of prompts.entries()) {
      if (index > 0 && prompt.trim() === prompts[index - 1].trim()) {
        errors.push(`${locale} prompt ${index + 1} needs to differ from the prior prompt`)
      }
      const { candidate, fault } = runPracticeTurn(level, prompt, previous, index)
      if (fault && checkAudit(level, candidate, [])) {
        errors.push(`${locale} scripted mistake ${index + 1} must produce an incorrect manifest`)
      }
      previous = candidate
    }
    if (previous && !checkAudit(level, previous, [])) {
      errors.push(`${locale} the final example manifest must meet the assignment`)
    }
  }
  return errors
}
