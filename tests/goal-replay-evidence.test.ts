import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RealtimeArenaSession } from '../src/engine/realtimeArena'
import { runProgram } from '../src/engine/run'
import type { ArenaLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'
import { arenaGoalReplayEvidence, gridGoalReplayEvidence } from '../src/web/goalReplayEvidence'

function loadLevel<T>(filename: string): T {
  return JSON.parse(readFileSync(new URL(`../levels/${filename}`, import.meta.url), 'utf8')) as T
}

test('grid evidence keeps charged actions and the actual pickup, leaving out scans and output', () => {
  const level: GridLevel = {
    ...loadLevel<GridLevel>('1801-limited-battery-salvage.json'),
    start: { x: 0, y: 0 },
    tiles: ['....'],
    items: [{ id: 'battery-a', x: 1, y: 0 }],
    enemies: [],
    objectives: [{ type: 'exit', x: 3, y: 0 }],
    allowedApi: ['scan', 'move', 'pick', 'say'],
    variants: [],
  }
  const result = runProgram(level, 'scan()\nmove("right")\npick()\nsay("private output")\nmove("up")')
  assert.equal(result.won, false)
  const evidence = gridGoalReplayEvidence(level, result)
  assert.deepEqual(evidence.turns, [
    { turn: 1, action: 'move', x: 1, y: 0 },
    { turn: 2, action: 'pick', x: 1, y: 0, item: 'battery-a' },
  ])
  assert.match(evidence.issue?.location.zh ?? '', /第 5 行/)
  assert.doesNotMatch(JSON.stringify(evidence), /private output/)
})

test('timed arena evidence isolates the player and keeps a blocked move as a real turn', () => {
  const level: ArenaLevel = {
    ...loadLevel<ArenaLevel>('1803-junction-race.json'),
    start: { x: 0, y: 0 },
    tiles: ['....'],
    items: [{ id: 'battery-a', x: 1, y: 0 }, { id: 'battery-b', x: 3, y: 0 }],
    opponents: [{ id: 'rival', title: { zh: '对手', en: 'Rival' }, start: { x: 2, y: 0 },
      policy: { kind: 'patrol', path: [{ x: 2, y: 0 }] } }],
    shifts: [],
    variants: [],
    maxTurns: 3,
  }
  const arena = new RealtimeArenaSession(level)
  arena.queueAction('right')
  arena.tick()
  arena.queueAction('pick')
  arena.tick()
  arena.queueAction('up')
  const result = arena.tick()?.result
  assert.ok(result)
  assert.deepEqual(arenaGoalReplayEvidence(result).turns, [
    { turn: 1, action: 'move', x: 1, y: 0 },
    { turn: 2, action: 'pick', x: 1, y: 0, item: 'battery-a' },
    { turn: 3, action: 'move', x: 1, y: 0, blocked: true },
  ])
})
