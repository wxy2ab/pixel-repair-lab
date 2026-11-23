import assert from 'node:assert/strict'
import test from 'node:test'
import type { CardInstance } from '../src/shared/types'
import { insertCommand, pathAfterInsertion } from '../src/web/cardInsertion'

const move = (direction: string): CardInstance => ({ cardId: 'move', values: { direction } })
const wait: CardInstance = { cardId: 'wait' }

test('commands can be inserted on either side of a row, and at both ends of the program', () => {
  const first = move('left')
  const second = move('right')
  const cards = [first, second]
  assert.deepEqual(insertCommand(cards, [], 0, wait), [wait, first, second])
  assert.deepEqual(insertCommand(cards, [], 1, wait), [first, wait, second])
  assert.deepEqual(insertCommand(cards, [], 2, wait), [first, second, wait])
  assert.deepEqual(cards, [first, second])
})

test('inserting a nested sibling preserves its indentation, the block body, and untouched branches', () => {
  const first = move('up')
  const loop: CardInstance = { cardId: 'loop', children: [move('right')] }
  const condition: CardInstance = { cardId: 'if', children: [first, loop] }
  const cards = [wait, { cardId: 'loop', children: [condition] }]
  const extra = move('down')
  const updated = insertCommand(cards, [1, 0], 1, extra)
  assert.equal(updated[0], wait)
  assert.deepEqual(updated[1].children![0].children, [first, extra, loop])
  assert.equal(updated[1].children![0].children![2], loop)
  assert.deepEqual(condition.children, [first, loop])
})

test('empty or older block bodies accept the first command, while invalid slots leave the draft intact', () => {
  const cards = [{ cardId: 'loop' }, { cardId: 'if', children: [] }]
  assert.deepEqual(insertCommand(cards, [0], 0, wait)[0].children, [wait])
  assert.deepEqual(insertCommand(cards, [1], 0, wait)[1].children, [wait])
  assert.equal(insertCommand(cards, [0], 1, wait), cards)
  assert.equal(insertCommand(cards, [0, 3], 0, wait), cards)
  assert.equal(insertCommand(cards, [], -1, wait), cards)
  assert.equal(insertCommand(cards, [], 0.5, wait), cards)
})

test('keeps references to selections and active blocks on their original cards as slots shift', () => {
  const nested = [1, 2, 0]
  assert.deepEqual(pathAfterInsertion(nested, [1], 2), [1, 3, 0])
  assert.deepEqual(pathAfterInsertion(nested, [], 0), [2, 2, 0])
  assert.deepEqual(pathAfterInsertion([1, 2], [1], 2), [1, 3])
  assert.equal(pathAfterInsertion(nested, [0], 0), nested)
  assert.equal(pathAfterInsertion(nested, [1], 3), nested)
  assert.equal(pathAfterInsertion(nested, nested, 0), nested)
  assert.deepEqual(pathAfterInsertion([], [], 0), [])
})
