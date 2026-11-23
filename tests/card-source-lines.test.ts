import assert from 'node:assert/strict'
import test from 'node:test'
import { cardsToPython, compileCards } from '../src/shared/cards'
import type { CardDefinition, CardInstance } from '../src/shared/types'

const label = { zh: '指令', en: 'Command' }
const definitions: CardDefinition[] = [
  { id: 'loop', label, template: 'for i in range(2):', block: true },
  { id: 'check', label, template: 'if i:', block: true },
  { id: 'move', label, template: 'move({{direction}})', parameters: [
    { name: 'direction', label, choices: [{ id: 'up', label, code: '"up"' }, { id: 'right', label, code: '"right"' }] },
  ] },
  { id: 'pair', label, template: 'move("left")\nwait()' },
]

test('physical source lines identify card occurrences, including repeated cards, blank block bodies and multiline cards', () => {
  const cards: CardInstance[] = [
    { cardId: 'loop', children: [
      { cardId: 'move' }, { cardId: 'check' }, { cardId: 'move', values: { direction: 'right' } },
    ] },
    { cardId: 'pair' }, { cardId: 'move' },
  ]
  const { source, linePaths } = compileCards(definitions, cards)
  assert.deepEqual(source.split('\n'), ['for i in range(2):', '    move("up")', '    if i:', '        pass',
    '    move("right")', 'move("left")', 'wait()', 'move("up")'])
  assert.deepEqual(linePaths, ['0', '0.0', '0.1', '0.1', '0.2', '1', '1', '2'])
  assert.equal(cardsToPython(definitions, cards), source)
  assert.deepEqual(compileCards(definitions, []), { source: '', linePaths: [] })
})
