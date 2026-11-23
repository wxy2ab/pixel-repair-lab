import assert from 'node:assert/strict'
import test from 'node:test'
import type { CardInstance } from '../src/shared/types'
import { editSelectedCards } from '../src/web/cardSelection'

const card = (cardId: string, children?: CardInstance[]): CardInstance =>
  children ? { cardId, children } : { cardId }
const ids = (cards: CardInstance[]) => cards.map(item => item.cardId)

test('batch moves keep order within every run and leave a run at the boundary in place', () => {
  const cards = [...'ABCDEFG'].map(id => card(id))
  const selection = new Set(['0', '1', '3', '4', '6'])
  const up = editSelectedCards(cards, selection, 'up')
  assert.deepEqual(ids(up.cards), [...'ABDECGF'])
  assert.deepEqual([...up.selection], ['0', '1', '2', '3', '5'])
  const down = editSelectedCards(cards, selection, 'down')
  assert.deepEqual(ids(down.cards), [...'CABFDEG'])
  assert.deepEqual([...down.selection], ['1', '2', '4', '5', '6'])
  assert.deepEqual(ids(cards), [...'ABCDEFG'])
  assert.equal(editSelectedCards(cards, new Set(['0', '1']), 'up').cards, cards)
  assert.equal(editSelectedCards(cards, new Set(['5', '6']), 'down').cards, cards)
  assert.equal(editSelectedCards(cards, new Set(), 'delete').cards, cards)
})

test('selected rows in different blocks move locally and the current insertion block follows its new path', () => {
  const child = card('child', [card('wait')])
  const first = card('loop', [card('A'), child, card('B')])
  const second = card('if', [card('C'), card('D')])
  const cards = [first, card('X'), second]
  const moved = editSelectedCards(cards, new Set(['1', '0.1', '2.1']), 'up')
  assert.deepEqual(ids(moved.cards), ['X', 'loop', 'if'])
  assert.deepEqual(ids(moved.cards[1].children!), ['child', 'A', 'B'])
  assert.deepEqual(ids(moved.cards[2].children!), ['D', 'C'])
  assert.equal(moved.cards[1].children![0], child)
  assert.deepEqual([...moved.selection], ['0', '1.0', '2.0'])
  assert.deepEqual(moved.remapPath([0, 1]), [1, 0])
  assert.deepEqual(ids(first.children!), ['A', 'child', 'B'])
})

test('moving a selected parent carries its entire subtree and deleting it falls back to a surviving parent', () => {
  const nested = card('if', [card('X'), card('Y')])
  const outer = card('loop', [card('A'), nested])
  const cards = [card('head'), outer]
  const moved = editSelectedCards(cards, new Set(['0', '1.1', '1.1.1']), 'up')
  assert.equal(moved.cards[1].children![0], nested)
  assert.deepEqual(ids(nested.children!), ['X', 'Y'])
  assert.deepEqual([...moved.selection], ['0', '1.0', '1.0.1'])
  assert.deepEqual(moved.remapPath([1, 1, 1]), [1, 0, 1])
  const removed = editSelectedCards(moved.cards, moved.selection, 'delete')
  assert.deepEqual(removed.cards, [card('loop', [card('A')])])
  assert.equal(removed.selection.size, 0)
  assert.deepEqual(removed.remapPath([1, 0]), [0])
  assert.deepEqual(removed.remapPath([0]), [])
})

test('path selection distinguishes duplicate commands and preserves parameters', () => {
  const right = { cardId: 'move', values: { direction: 'right' } }
  const left = { cardId: 'move', values: { direction: 'left' } }
  const cards = [right, left, right]
  const result = editSelectedCards(cards, new Set(['1', '8']), 'up')
  assert.deepEqual(result.cards, [left, right, right])
  assert.equal(result.cards[0], left)
  assert.deepEqual([...result.selection], ['0'])
  const removed = editSelectedCards(result.cards, result.selection, 'delete')
  assert.deepEqual(removed.cards, [right, right])
})
