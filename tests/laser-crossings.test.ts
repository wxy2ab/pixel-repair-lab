import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runProgram } from '../src/engine/run'
import { initialSnapshot } from '../src/engine/snapshot'
import { cardsToPython } from '../src/shared/cards'
import type { Direction, GridLevel } from '../src/shared/types'

function levelFrom(file: string): GridLevel {
  return JSON.parse(readFileSync(new URL('../levels/' + file, import.meta.url), 'utf8'))
}

const first = levelFrom('1978-laser-shortcut.json')
const second = levelFrom('1979-laser-turned-mirror.json')
const shortRoute: Direction[] = ['up', 'down', 'right', 'right', 'right', 'right', 'right', 'right']
const keyRoute: Direction[] = ['down', 'down', 'right', 'down', 'up', 'right', 'right', 'right', 'right', 'right', 'up', 'up']

function runCards(level: GridLevel, moves: Direction[]) {
  return runProgram(level, cardsToPython(level.cards, moves.map(cardId => ({ cardId }))))
}

test('either the cutoff shortcut or the locked lower hall can clear the first light challenge', () => {
  const shortcut = runCards(first, shortRoute)
  assert.equal(shortcut.won, true)
  assert.equal(shortcut.final.turn, 8)
  assert.deepEqual(shortcut.final.devices?.switches, ['cutoff'])
  assert.deepEqual(shortcut.final.devices?.hazards, [])
  assert.deepEqual(shortcut.final.devices?.keys, [])

  const detour = runCards(first, keyRoute)
  assert.equal(detour.won, true)
  assert.equal(detour.final.turn, 12)
  assert.deepEqual(detour.final.devices?.switches, [])
  assert.deepEqual(detour.final.devices?.keys, ['brass-key'])
  assert.ok(detour.frames.some(({ state }) => state.player.x === 6 && state.player.y === 4))

  const withoutSwitch = runCards(first, shortRoute.slice(2))
  assert.equal(withoutSwitch.issue?.code, 'laserHit')
  assert.deepEqual(withoutSwitch.final.player, { x: 4, y: 2 })
  const withoutKey = runCards(first, [...keyRoute.slice(0, 3), ...keyRoute.slice(5)])
  assert.equal(withoutKey.issue?.code, 'lockedDoor')
})

test('the second hall changes only the orientation of one mirror in the playable scenario', () => {
  for (const key of ['tiles', 'start', 'turnLimit', 'allowedApi', 'cards', 'objectives', 'items', 'enemies',
    'variants', 'input', 'memory', 'instructions'] as const) {
    assert.deepEqual(second[key], first[key], key)
  }
  const mirrors = first.devices!.filter(device => device.kind === 'mirror')
  assert.equal(mirrors.length, 1)
  assert.equal(mirrors[0].orientation, '/')
  assert.deepEqual(second.devices, first.devices!.map(device => device.kind === 'mirror' ? { ...device, orientation: '\\' } : device))

  function litCells(level: GridLevel) {
    return initialSnapshot(level).devices!.hazards.map(({ x, y }) => [x, y])
  }
  assert.deepEqual(litCells(first), [[3, 3], [4, 3], [4, 2], [4, 1]])
  assert.deepEqual(litCells(second), [[3, 3], [4, 3], [4, 4], [4, 5]])
})

test('replaying the lower route hits the new beam and retaining a successful upper route also works', () => {
  const carried = runCards(second, keyRoute)
  assert.equal(carried.won, false)
  assert.equal(carried.final.turn, 7)
  assert.deepEqual(carried.final.player, { x: 4, y: 4 })
  assert.deepEqual(carried.issue, { code: 'laserHit', line: 7, detail: 'hall-beam' })

  const amended = runCards(second, ['up', 'down', ...keyRoute])
  assert.equal(amended.won, true)
  assert.equal(amended.final.turn, second.turnLimit)
  assert.deepEqual(amended.final.devices?.keys, ['brass-key'])
  assert.equal(runCards(second, shortRoute).won, true)
  assert.equal(runCards(second, shortRoute.slice(2)).won, true)
})
