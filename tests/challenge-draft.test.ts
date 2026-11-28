import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AlgorithmLevel, ArenaLevel } from '../src/shared/advanced'
import type { DataLevel } from '../src/shared/dataCourse'
import type { MachineLevel } from '../src/shared/hardware'
import type { CardInstance, GridLevel, LevelMetadata } from '../src/shared/types'
import { challengeDraftKey, parseChallengeDraft, supportsChallengeDraft } from '../src/web/challengeDraft'

const title = { zh: '挑战', en: 'Challenge' }
const base: LevelMetadata = { version: 1, id: 'sample', order: 1, title, concept: title, brief: title, stage: 'challenge', hints: [] }
const grid: GridLevel = {
  ...base, kind: 'grid', tiles: ['..'], start: { x: 0, y: 0 }, objectives: [{ type: 'exit', x: 1, y: 0 }],
  allowedApi: ['move'], solutionCards: [], cards: [
    { id: 'repeat', label: title, template: 'for i in range({{times}}):', block: true,
      parameters: [{ name: 'times', label: title, choices: [{ id: 'three', label: title, code: '3' }] }] },
    { id: 'walk', label: title, template: 'move({{direction}})',
      parameters: [{ name: 'direction', label: title, choices: [{ id: 'right', label: title, code: '"right"' }] }] },
  ],
}
const arena: ArenaLevel = {
  ...base, kind: 'arena', tiles: ['..'], start: { x: 0, y: 0 }, items: [], opponents: [], maxTurns: 1,
  objective: { kind: 'score' }, starterCode: '', solutionCode: '', snippets: [],
}
const algorithm: AlgorithmLevel = { ...base, kind: 'algorithm', functionName: 'run', starterCode: '', solutionCode: '', snippets: [], cases: [] }
const machine: MachineLevel = { ...base, kind: 'machine', allowedOps: ['HALT'], starterCode: 'HALT', cases: [] }

test('draft keys isolate levels and only ordinary challenge editors support drafts', () => {
  assert.equal(challengeDraftKey('first'), 'pixel-repair-lab:challenge-draft:first')
  assert.notEqual(challengeDraftKey('first'), challengeDraftKey('second'))
  for (const level of [grid, arena, algorithm, machine]) assert.equal(supportsChallengeDraft(level), true)
  const data: DataLevel = { ...base, kind: 'data', stage: 'challenge', steps: [] }
  const specialized: AlgorithmLevel = { ...algorithm, chargingChallenge: { trialCase: 0, predictions: [] } }
  assert.equal(supportsChallengeDraft(data), false)
  assert.equal(supportsChallengeDraft(specialized), false)
  assert.equal(parseChallengeDraft(specialized, JSON.stringify({ kind: 'algorithm', source: '' })), undefined)
})

test('grid draft restores both the Python tab and nested ordered cards with chosen options', () => {
  const draft = {
    kind: 'grid', mode: 'python', source: 'for i in range(2):\n    move("right")\n',
    cards: [{ cardId: 'repeat', values: { times: 'three' }, children: [{ cardId: 'walk', values: { direction: 'right' } }] },
      { cardId: 'walk' }],
  }
  assert.deepEqual(parseChallengeDraft(grid, JSON.stringify(draft)), draft)
  assert.deepEqual(parseChallengeDraft(grid, '{"kind":"grid","mode":"cards","cards":[],"source":""}'),
    { kind: 'grid', mode: 'cards', cards: [], source: '' })
})

test('a warehouse draft can restore every move of a full-length manual path as Python', () => {
  const level = { ...grid, warehouse: { boxes: [], targets: [] } }
  const path = 'rl'.repeat(8_192)
  const source = Array.from(path, dir => dir === 'r' ? 'move("right")' : 'move("left")').join('\n')
  const draft = { kind: 'grid', mode: 'python', cards: [], source, warehouse: { controls: 'program', path } }
  assert.deepEqual(parseChallengeDraft(level, JSON.stringify(draft)), draft)
})

test('obsolete or corrupted grid cards do not prevent restoring remaining cards and code', () => {
  const draft = { kind: 'grid', mode: 'cards', source: 'a = ', cards: [
    { cardId: 'removed' }, false, { cardId: 'repeat', values: { times: 'unknown', obsolete: 'x' }, children: [
      { cardId: 'walk', values: { direction: 'right' }, children: [{ cardId: 'walk' }] },
    ] },
  ] }
  assert.deepEqual(parseChallengeDraft(grid, JSON.stringify(draft)), {
    kind: 'grid', mode: 'cards', source: 'a = ', cards: [
      { cardId: 'repeat', values: {}, children: [{ cardId: 'walk', values: { direction: 'right' } }] },
    ],
  })
})

test('restored grid programs stay within the editor count and nesting limits', () => {
  const leaf = { cardId: 'walk' }
  function nest(blocks: number): CardInstance {
    return blocks === 0 ? leaf : { cardId: 'repeat', children: [nest(blocks - 1)] }
  }
  const valid = { kind: 'grid', mode: 'cards', cards: [nest(5), ...Array.from({ length: 94 }, () => leaf)] }
  assert.deepEqual(parseChallengeDraft(grid, JSON.stringify(valid)), valid)
  const oversized = { ...valid, cards: [...valid.cards, leaf] }
  assert.deepEqual(parseChallengeDraft(grid, JSON.stringify(oversized)), valid)

  const restored = parseChallengeDraft(grid, JSON.stringify({ ...valid, cards: [nest(8)] }))
  assert.equal(restored?.kind, 'grid')
  if (restored?.kind !== 'grid') throw new Error('Expected a grid draft')
  let children = restored.cards
  for (let depth = 0; depth < 6; depth++) children = children[0]?.children ?? []
  assert.deepEqual(children, [])
})

test('arena drafts preserve pace and keep independent relaxed code and timed strategy', () => {
  const draft = { kind: 'arena', mode: 'timed', source: '', policy: 'def decide(state):\n    return "left"\n' }
  assert.deepEqual(parseChallengeDraft(arena, JSON.stringify(draft)), draft)
  assert.deepEqual(parseChallengeDraft(arena, '{"kind":"arena","mode":"relaxed"}'), { kind: 'arena', mode: 'relaxed' })
})

test('source drafts preserve empty and unfinished code and reject malformed or unrelated data', () => {
  for (const level of [algorithm, machine]) {
    for (const source of ['', 'return\n  ', 'x'.repeat(12_000)]) {
      const draft = { kind: level.kind, source }
      assert.deepEqual(parseChallengeDraft(level, JSON.stringify(draft)), draft)
    }
  }
  const longPython = { kind: 'algorithm', source: 'x'.repeat(12_001) }
  assert.deepEqual(parseChallengeDraft(algorithm, JSON.stringify(longPython)), longPython)
  assert.equal(parseChallengeDraft(machine, JSON.stringify({ kind: 'machine', source: longPython.source })), undefined)
  assert.equal(parseChallengeDraft(algorithm, JSON.stringify({ kind: 'algorithm', source: 'x'.repeat(120_001) })), undefined)
  assert.equal(parseChallengeDraft(arena, '{"kind":"arena","mode":"invalid"}'), undefined)
  assert.equal(parseChallengeDraft(grid, '{"kind":"machine","source":"HALT"}'), undefined)
  assert.equal(parseChallengeDraft(machine, '{"kind":"machine","source":4}'), undefined)
  for (const raw of [null, undefined, '[]', 'malformed', '{"kind":"grid"}']) {
    assert.equal(parseChallengeDraft(grid, raw), undefined)
  }
})
