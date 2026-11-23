import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { cardsToPython } from '../shared/cards'
import type { GridLevel } from '../shared/types'
import { runProgram } from './run'
import { MAX_PYTHON_FLOW_EVENTS } from './python'
import { gridObservationFrames, initialSnapshot } from './snapshot'

function getLevel(name: string): GridLevel {
  return JSON.parse(readFileSync(new URL(`../../levels/${name}.json`, import.meta.url), 'utf8')) as GridLevel
}

const first = getLevel('01-first-steps')
const pocket = getLevel('03-pocket-route')
const stack = getLevel('04-stacked-cargo')
const queue = getLevel('05-arrival-queue')
const cpu = getLevel('10-cpu-clock')

test('function replay follows calls and returns across files, in order with the real board actions', () => {
  const personal = { top_up: 'def top_up(value):\n    return value + 3' }
  const level: GridLevel = { ...first, allowedApi: ['scan', 'submit'], input: 4, objectives: [] }
  const source = ['from my_algorithms import top_up', 'def collect():', '    value = scan()', '    return top_up(value)',
    'submit(collect())', 'submit(collect())'].join('\n')
  const ordinary = runProgram(level, source, personal)
  const replay = runProgram(level, source, personal, undefined, true, true)
  assert.ok(replay.won)
  assert.deepEqual(replay.frames, ordinary.frames)
  assert.deepEqual(replay.final, ordinary.final)
  assert.equal(ordinary.flowEvents, undefined)
  assert.deepEqual(replay.flowEvents!.map(e => [e.kind, e.name, e.depth, e.boardActions]), [
    ['call', 'collect', 1, 0], ['call', 'top_up', 2, 1], ['return', 'top_up', 2, 1], ['return', 'collect', 1, 1],
    ['call', 'collect', 1, 2], ['call', 'top_up', 2, 3], ['return', 'top_up', 2, 3], ['return', 'collect', 1, 3],
  ])
  assert.equal(replay.flowEvents![1].targetSourceName, 'my_algorithms.top_up.py')
  assert.deepEqual(replay.flowEvents![0].arguments, [])
  assert.deepEqual(replay.flowEvents![1].arguments, [{ name: 'value', value: 4 }])
  assert.equal(replay.flowEvents![2].sourceName, 'my_algorithms.top_up.py')
  assert.equal(replay.flowEvents![2].value, 7)
  assert.equal(replay.flowEvents![2].resumeLine, 4)
  for (const event of replay.flowEvents!) {
    const rack = replay.rackSteps![event.rackIndex!]
    assert.equal(rack.sourceName, event.sourceName)
    assert.equal(rack.line, event.line)
  }
})

test('branch and loop observations follow only evaluated guards, actual iterations, and natural exhaustion', () => {
  const level: GridLevel = { ...first, objectives: [], variants: [{ input: 1 }], input: 0, allowedApi: ['scan', 'say'] }
  const source = ['n = scan()', 'while n > 0:', '    n = n - 1', 'for value in [0, 1, 2]:',
    '    if value == 0:', '        continue', '    elif value == 1:', '        say("one")',
    '    else:', '        break', 'for empty in []:', '    say("unreachable")'].join('\n')
  const replay = runProgram(level, source, undefined, undefined, false, true)
  const events = replay.flowEvents!
  assert.ok(replay.won)
  assert.deepEqual(events.filter(e => e.kind === 'if').map(e => [e.name, e.condition]),
    [['if', true], ['if', false], ['elif', true], ['if', false], ['elif', false], ['else', true]])
  assert.deepEqual(events.filter(e => e.kind === 'for').map(e => [e.name, e.condition, e.iteration, e.value]),
    [['value', true, 1, 0], ['value', true, 2, 1], ['value', true, 3, 2], ['empty', false, 0, undefined]])
  assert.deepEqual(events.filter(e => e.kind === 'break' || e.kind === 'continue').map(e => [e.kind, e.loopKind, e.iteration, e.name]),
    [['continue', 'for', 1, 'value'], ['break', 'for', 3, 'value']])
  assert.deepEqual(replay.mapRuns!.map(run => run.flowEvents!.filter(e => e.kind === 'while').map(e => [e.condition, e.iteration])),
    [[[false, 0]], [[true, 1], [false, 1]]])
  assert.deepEqual(events.filter(e => e.name === 'else').map(e => e.boardActions), [2])
})

test('a failed call has no return animation and visual limits do not affect the program', () => {
  const level: GridLevel = { ...first, objectives: [], allowedApi: ['pick', 'say'] }
  const fail = runProgram(level, 'def empty():\n    pick()\nempty()', undefined, undefined, false, true)
  assert.equal(fail.issue?.code, 'noItem')
  assert.deepEqual(fail.flowEvents!.map(e => e.kind), ['call'])
  assert.deepEqual(fail.frames.map(f => [f.action, f.issue?.code]), [['pick', 'noItem']])

  const source = ['def big():', '    row = [1]', '    for i in range(13):', '        row = [row, row]', '    return row',
    'big()', 'def idle():', '    pass', 'for i in range(90):', '    idle()', 'say("finished")'].join('\n')
  const replay = runProgram(level, source, undefined, undefined, false, true)
  assert.ok(replay.won)
  assert.equal(replay.flowTruncated, true)
  assert.equal(replay.flowEvents!.length, MAX_PYTHON_FLOW_EVENTS)
  assert.equal(replay.frames.at(-1)?.value, 'finished')
  const largeReturn = replay.flowEvents!.find(e => e.kind === 'return' && e.name === 'big')
  assert.ok(largeReturn)
  assert.ok(!Object.hasOwn(largeReturn, 'value'))
  assert.equal(replay.flowEvents!.find(e => e.kind === 'return' && e.name === 'idle')?.value, null)
})

test('call arguments snapshot zero, False and None and stay unchanged when a function updates a list', () => {
  const level: GridLevel = { ...first, objectives: [], allowedApi: ['scan'], input: false }
  const source = ['def mark(items, zero, flag, missing):', '    items.append(zero)', '    if flag:', '        return zero',
    'data = [2]', 'mark(data, 0, scan(), None)'].join('\n')
  const replay = runProgram(level, source, undefined, undefined, false, true)
  assert.ok(replay.won)
  assert.equal(replay.frames.length, 1)
  assert.deepEqual(replay.flowEvents![0].arguments, [
    { name: 'items', value: [2] }, { name: 'zero', value: 0 }, { name: 'flag', value: false }, { name: 'missing', value: null },
  ])
  assert.deepEqual(replay.flowEvents!.map(e => [e.kind, e.boardActions]), [['call', 1], ['if', 1], ['return', 1]])
  assert.equal(replay.flowEvents!.at(-1)?.line, 3) // The last executed guard fell through to None.
})

test('an invalid scene command identifies the attempt for replay without consuming an action', () => {
  const level: GridLevel = { ...first, objectives: [], allowedApi: ['pick'] }
  for (const [program, code, attempted] of [['pick(1)', 'wrongArguments', 'pick'], ['scan()', 'apiDisabled', 'scan'],
    ['made_up()', 'unknownName', undefined], ['def pick():\n    pass\npick(1)', 'wrongArguments', undefined]] as const) {
    const replay = runProgram(level, program, undefined, undefined, false, true)
    assert.equal(replay.issue?.code, code)
    assert.equal(replay.issue.attemptedAction, attempted)
    assert.equal(replay.frames.length, 0)
    assert.equal(replay.final.turn, 0)
    assert.equal(runProgram(level, program).issue?.attemptedAction, undefined)
  }
})

test('moving through a wall and across an enemy patrol give line-aware feedback', () => {
  const blocked = runProgram(first, 'move("up")')
  assert.deepEqual(blocked.issue, { code: 'blocked', line: 1, detail: 'up' })
  assert.deepEqual(blocked.final.player, first.start)

  const watched: GridLevel = { ...first, enemies: [{ path: [{ x: 4, y: 3 }, { x: 3, y: 3 }] }] }
  const collision = runProgram(watched, 'say("ready")\nmove("right")')
  assert.equal(collision.issue?.code, 'enemy')
  assert.equal(collision.issue?.line, 2)
  assert.equal(collision.frames[0].state.turn, 0)
  assert.deepEqual(collision.final.player, { x: 3, y: 3 })
  assert.deepEqual(collision.final.enemies, [{ x: 3, y: 3 }])
})

test('observing an idle grid follows the patrols and stops at contact or the turn limit', () => {
  const route = [{ x: 4, y: 3 }, { x: 4, y: 2 }, { x: 3, y: 2 }]
  const watched = { ...first, enemies: [{ path: route }] }
  const frames = gridObservationFrames(watched)
  const initial = initialSnapshot(watched)
  assert.deepEqual(frames, [1, 2, 3].map(turn => ({ ...initial, turn, enemies: [route[turn % route.length]] })))
  const moved = runProgram(watched, 'move("right")')
  assert.deepEqual(frames[0].enemies, moved.final.enemies)
  assert.deepEqual(gridObservationFrames({ ...watched, turnLimit: 2 }), frames.slice(0, 2))
  const contact = gridObservationFrames({ ...watched, enemies: [{ path: [route[0], first.start, route[2]] }] })
  assert.equal(contact.length, 1)
  assert.deepEqual(contact[0].enemies, [contact[0].player])
  assert.deepEqual(gridObservationFrames({ ...watched, enemies: [{ path: [route[0], route[0]] }] }), [])
  assert.deepEqual(gridObservationFrames({ ...watched, enemies: [] }), [])
})

test('a grid turn budget accepts an exact finish, leaves scans free, and stops extra actions before they change the board', () => {
  const level: GridLevel = {
    ...first,
    tiles: ['....'],
    start: { x: 0, y: 0 },
    items: [{ id: 'battery', x: 1, y: 0 }],
    objectives: [{ type: 'collect', itemIds: ['battery'] }, { type: 'exit', x: 1, y: 0 }],
    allowedApi: ['scan', 'move', 'pick'],
    turnLimit: 2,
  }
  const code = 'scan()\nmove("right")\npick()\nscan()'
  const exact = runProgram(level, code)
  assert.equal(exact.won, true)
  assert.equal(exact.final.turn, 2)
  assert.deepEqual(exact.frames.map(frame => frame.state.turn), [0, 1, 2, 2])

  const extra = runProgram(level, code + '\nmove("right")')
  assert.deepEqual(extra.issue, { code: 'turnLimit', line: 5, detail: undefined })
  assert.deepEqual(extra.final, exact.final)

  const limit = { ...level, turnLimit: 1 }
  assert.deepEqual(runProgram(limit, 'move("right")').issue, { code: 'turnLimit' })
  const noSecondAction = runProgram(limit, code)
  assert.deepEqual(noSecondAction.issue, { code: 'turnLimit', line: 3, detail: undefined })
  assert.deepEqual(noSecondAction.final.items, level.items)

  const variant = runProgram({ ...level, variants: [{ turnLimit: 1 }] }, code)
  assert.equal(variant.issue?.code, 'variant')
  assert.equal(variant.passedCases, 1)
  assert.equal(variant.final.items.length, 0)
  assert.deepEqual(variant.failure, {
    issue: { code: 'turnLimit', line: 3, detail: undefined },
    turn: 1,
    turnLimit: 1,
    gaps: [{ type: 'collect', remaining: 1 }],
  })
})

test('a list must supply the movement and the base route cannot pass a variant', () => {
  const literal = runProgram(pocket, 'move("right")')
  assert.equal(literal.issue?.code, 'requiredOrigin')

  const base = runProgram(pocket, `route = ${JSON.stringify(pocket.input)}\nfor i in range(len(route)):\n    move(route[i])`)
  assert.equal(base.issue?.code, 'variant')
  assert.equal(base.passedCases, 1)
  assert.equal(base.totalCases, 2)
  assert.equal(base.failure?.issue.code, 'unfinished')
  assert.deepEqual(base.failure?.gaps, [{ type: 'exit' }])
})

test('map replays use their own walls and only include maps that were checked', () => {
  const level = getLevel('1815-six-step-detour')
  const solution = cardsToPython(level.cards, level.solutionCards)
  const won = runProgram(level, solution)
  assert.deepEqual(won.mapRuns?.map(run => run.frames[0].value), [
    { up: 'wall', down: 'wall', left: 'wall', right: 'floor' },
    { up: 'wall', down: 'wall', left: 'floor', right: 'wall' },
  ])
  assert.deepEqual(won.mapRuns?.map(run => run.frames[1].state.player), [{ x: 4, y: 3 }, { x: 2, y: 3 }])
  assert.equal(won.final, won.mapRuns?.[0].final)
  assert.equal(won.frames, won.mapRuns?.[0].frames)

  const threeMaps = { ...level, variants: [...level.variants!, {}] }
  const fixedRoute = ['right', 'right', 'up', 'up', 'left', 'left'].map(direction => 'move("' + direction + '")').join('\n')
  const lost = runProgram(threeMaps, fixedRoute)
  assert.equal(lost.totalCases, 3)
  assert.equal(lost.passedCases, 1)
  assert.deepEqual(lost.mapRuns?.map(run => run.issue?.code), [undefined, 'blocked'])
  assert.deepEqual(lost.mapRuns?.[1].final.player, level.start)
})

test('stack, queue and container checks apply to the actual submissions', () => {
  const unused = runProgram(stack, 'cargo = scan()\ncargo.pop()\nsubmit("violet")')
  assert.equal(unused.issue?.code, 'requiredOrigin')
  assert.equal(unused.issue?.line, 3)

  const split = runProgram(stack, 'a = ["violet"]\nb = ["mint"]\nsubmit(a.pop())\nsubmit(b.pop())')
  assert.equal(split.issue?.code, 'requiredOrigin')
  assert.equal(split.issue?.line, 4)

  const different = runProgram(queue, 'cargo = ["lime"]\nsubmit(cargo.pop())')
  assert.equal(different.issue?.code, 'requiredOrigin')
})

test('CPU actions reveal the program counter, accumulator and stored output in order', () => {
  const source = cardsToPython(cpu.cards, cpu.solutionCards)
  const result = runProgram(cpu, source)
  assert.equal(result.won, true)
  assert.deepEqual(result.frames.map(({ value }) => value), ['LOAD', 'ADD', 'STORE', 'HALT'])
  assert.deepEqual(result.frames.map(({ state }) => state.pc), [1, 2, 3, 4])
  assert.equal(result.frames[1].state.accumulator, 13)
  assert.equal(result.frames[2].state.memory[2], 13)
  assert.equal(result.final.halted, true)
  assert.deepEqual(runProgram(cpu, source), result)
})

test('the interpreter rejects unsupported access and bounds work without a traceback', () => {
  const syntax = runProgram(first, 'move("right"\n')
  assert.equal(syntax.issue?.code, 'syntax')
  assert.equal(syntax.frames.length, 0)

  const unsupported = runProgram(first, 'import os')
  assert.deepEqual(unsupported.issue, { code: 'unsupported', line: 1, detail: 'import' })

  const infinite = runProgram(first, 'while True:\n    pass')
  assert.equal(infinite.issue?.code, 'limit')

  const volume = runProgram(first, 'a = [0]\nfor i in range(30):\n    a = [a, a]\nsay(str(a))')
  assert.equal(volume.issue?.code, 'limit')
  assert.equal(volume.issue?.line, 4)
})
