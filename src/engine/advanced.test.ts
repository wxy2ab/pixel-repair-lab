import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { AlgorithmLevel, ArenaLevel } from '../shared/advanced'
import type { GridLevel } from '../shared/types'
import { runAlgorithm } from './algorithms'
import { runArena } from './arena'
import { runProgram } from './run'

function getLevel<T extends AlgorithmLevel | ArenaLevel>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../levels/${name}.json`, import.meta.url), 'utf8')) as T
}

const algorithm = getLevel<AlgorithmLevel>('22-shortest-step')
const score = getLevel<ArenaLevel>('23-parts-race')
const escape = getLevel<ArenaLevel>('24-escape-patrol')

test('the shortest route returns the expected first step on six boards', () => {
  const result = runAlgorithm(algorithm, algorithm.solutionCode)
  assert.equal(result.won, true)
  assert.deepEqual(result.cases.map(({ actual }) => actual), ['right', 'down', 'up', null, null, 'up'])
  assert.equal(runAlgorithm(algorithm, 'def shortest_step(board, start, goal):\n    return "right"').won, false)
})

test('function returns, local variables and bounded recursion work inside modules', () => {
  const level: AlgorithmLevel = { ...algorithm, functionName: 'solve', cases: [{ args: [2], expected: 9 }] }
  const program = 'def helper(x):\n    x += 5\n    return x\ndef solve(x):\n    if x > 0:\n        return helper(x) + x\n    return 0'
  assert.equal(runAlgorithm(level, program).won, true)
  const recursive = runAlgorithm(level, 'def solve(x):\n    return solve(x + 1)')
  assert.equal(recursive.issue?.code, 'limit')
  const impure = runAlgorithm(level, 'def solve(x):\n    move("right")\n    return 9')
  assert.equal(impure.issue?.code, 'unknownName')
  const compiled = runAlgorithm({ ...level, cases: [{ args: [[2]], expected: 9 }] }, 'def solve(x):\n    x.append(3)\n    return 9')
  assert.equal(compiled.issue?.detail, 'input mutation')
})

test('a passing personal algorithm can replace the bundled one in the escape challenge', () => {
  const course = runArena(escape, escape.solutionCode)
  assert.equal(course.won, true)
  assert.equal(course.passedCases, 3)
  assert.equal(course.reason, 'escape')

  const personalSource = escape.solutionCode.replace('from algorithms import', 'from my_algorithms import')
  const personal = runArena(escape, personalSource, { shortest_step: algorithm.solutionCode })
  assert.deepEqual(personal, course)
  assert.equal(runArena(escape, personalSource).issue?.code, 'unknownName')

  const hardcoded = runArena(escape, 'move("right")\nmove("right")\npick()\nfor step in range(4):\n    move("right")')
  assert.equal(hardcoded.passedCases, 1)
  assert.equal(hardcoded.issue?.code, 'variant')

  const ignoredRivals = escape.solutionCode.replace('shortest_step(tiles,', 'shortest_step(state["tiles"],')
  const guarded = runArena(escape, ignoredRivals)
  assert.equal(guarded.passedCases, 1)
  assert.equal(guarded.reason, 'caught')
  assert.equal(guarded.issue?.code, 'variant')
})

test('arena course helpers follow the declared list, with existing course and personal imports preserved', () => {
  const course = { race_direction: 'def race_direction():\n    return "right"' }
  const raceSource = score.solutionCode.replace('move("right")', 'move(race_direction())')
  const source = `from algorithms import race_direction\n${raceSource}`
  const scoped = runArena({ ...score, helpers: ['race_direction'] }, source, undefined, course)
  assert.equal(scoped.won, true)
  assert.equal(scoped.final.actors[0].score, 4)
  assert.equal(runArena(score, source, undefined, course).issue?.code, 'unknownName')

  const personal = source.replace('from algorithms import', 'from my_algorithms import')
  assert.equal(runArena(score, personal, course).won, true)

  const referenceCourse = { shortest_step: algorithm.solutionCode }
  const capstone = runArena(escape, escape.solutionCode, undefined, referenceCourse)
  assert.equal(capstone.passedCases, 3)
  assert.deepEqual(capstone, runArena(escape, escape.solutionCode))
})

test('ordinary grid programs can use both course and personal modules', () => {
  const level = JSON.parse(readFileSync(new URL('../../levels/01-first-steps.json', import.meta.url), 'utf8')) as GridLevel
  const tiles = JSON.stringify(level.tiles)
  const source = `from algorithms import shortest_step\nboard = ${tiles}\nposition = [2, 3]\nfor step in range(4):\n    move(shortest_step(board, position, [6, 3]))\n    position[0] += 1`
  assert.equal(runProgram(level, source).won, true)
  const personalSource = source.replace('from algorithms import', 'from my_algorithms import')
  const personal = runProgram(level, personalSource, { shortest_step: algorithm.solutionCode })
  assert.equal(personal.won, true)
  assert.equal(runProgram(level, personalSource).issue?.code, 'unknownName')
})

test('the score race has deterministic frames and a distinct winner', () => {
  const result = runArena(score, score.solutionCode)
  assert.equal(result.won, true)
  assert.deepEqual(result.final.actors.map(({ score }) => score), [4, 1, 2])
  assert.deepEqual(runArena(score, score.solutionCode), result)
})

test('replay scans use the board before the action without adding a turn', () => {
  const source = 'first = scan()\nagain = scan()\nmove("right")\nafter = scan()'
  const plain = runArena(escape, source)
  const replay = runArena(escape, source, undefined, undefined, { recordScans: true })
  assert.equal(plain.frames[0].scan, undefined)
  assert.equal(plain.trailingScans, undefined)
  assert.deepEqual(replay.final, plain.final)
  assert.deepEqual(replay.frames.map(({ scan, ...physical }) => physical), plain.frames)
  const reading = replay.frames[0].scan!
  assert.equal(reading.line, 2)
  assert.equal(reading.count, 2)
  assert.equal(reading.value.turn, 0)
  assert.deepEqual(reading.value.player, [escape.start.x, escape.start.y])
  assert.deepEqual(reading.value.opponents.map(({ x, y }) => ({ x, y })), escape.opponents.map(rival => rival.start))
  assert.equal(replay.trailingScans?.[0]?.value.turn, 1)
  const player = replay.final.actors[0]
  assert.deepEqual(replay.trailingScans?.[0]?.value.player, [player.x, player.y])

  const only = runArena(escape, 'scan()', undefined, undefined, { recordScans: true })
  assert.equal(only.frames.length, 0)
  assert.equal(only.trailingScans?.[0]?.line, 1)
})

test('arena program events interleave a helper, its loops and a scan with the actual move', () => {
  const source = [
    'def plan(n):', '    for x in [n]:', '        if x == 1:', '            scan()', '            move("right")',
    '    while False:', '        wait()', '    return n', 'answer = plan(1)',
  ].join('\n')
  const plain = runArena(escape, source)
  const run = runArena(escape, source, undefined, undefined, { recordFlow: true })
  assert.deepEqual(run.final, plain.final)
  assert.equal(run.frames.length, 1)
  assert.deepEqual(run.frames[0].program?.map(event => event.kind), ['call', 'for', 'if', 'scan'])
  assert.deepEqual(run.trailingProgram?.[0].map(event => event.kind), ['for', 'while', 'return'])
  assert.equal(plain.frames[0].program, undefined)
  const interrupted = runArena(escape, 'def test():\n    if True:\n        unknown()\ntest()', undefined, undefined, { recordFlow: true })
  assert.equal(interrupted.final.turn, 0)
  assert.deepEqual(interrupted.trailingProgram?.[0].map(event => event.kind), ['call', 'if'])
})

test('rivals contest a single token on the same tile without double-counting', () => {
  const level: ArenaLevel = {
    ...score,
    tiles: ['#####', '#...#', '#####'],
    start: { x: 1, y: 1 },
    items: [{ id: 'part', x: 2, y: 1 }],
    opponents: [{ ...score.opponents[1], start: { x: 3, y: 1 }, policy: { kind: 'collect' } }],
    maxTurns: 3,
  }
  const result = runArena(level, 'move("right")\npick()')
  assert.equal(result.outcome, 'loss')
  assert.deepEqual(result.final.actors.map(({ score }) => score), [0, 1])
  assert.deepEqual(result.frames[1].events.map(({ itemId }) => itemId), [undefined, 'part'])
  assert.equal(result.frames[1].events[0].blocked, true)
})

test('a score race finishes autonomous waits and reports a draw at the turn cap', () => {
  const level: ArenaLevel = {
    ...score,
    tiles: ['#######', '#..#..#', '#######'],
    start: { x: 1, y: 1 },
    items: [{ id: 'part', x: 2, y: 1 }],
    opponents: [{ ...score.opponents[1], start: { x: 5, y: 1 }, policy: { kind: 'collect' } }],
    maxTurns: 3,
  }
  const result = runArena(level, 'move("up")')
  assert.equal(result.outcome, 'draw')
  assert.equal(result.final.turn, 3)
  assert.equal(result.frames[0].events[0].blocked, true)
  assert.deepEqual(result.frames.map(({ line }) => line), [1, 0, 0])
})

test('pursuers capture on the same tile or when they swap positions', () => {
  const level: ArenaLevel = {
    ...escape,
    variants: [],
    tiles: ['######', '#....#', '######'],
    start: { x: 1, y: 1 },
    items: [{ id: 'part', x: 4, y: 1 }],
    objective: { kind: 'escape', exit: { x: 4, y: 1 }, itemIds: ['part'] },
    maxTurns: 5,
  }
  for (const x of [2, 3]) {
    const caught = runArena({ ...level, opponents: [{ ...escape.opponents[0], start: { x, y: 1 } }] }, 'move("right")')
    assert.equal(caught.reason, 'caught')
    assert.equal(caught.final.turn, 1)
  }
})
