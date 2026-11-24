import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runFerryRace } from '../src/engine/ferryRace'
import { runProgram } from '../src/engine/run'
import { cardsToPython } from '../src/shared/cards'
import { initialFerryLayout } from '../src/shared/ferry'
import type { FerryRaceLayout, GridLevel } from '../src/shared/types'

const level: GridLevel = JSON.parse(readFileSync(new URL('../levels/1977-ferry-robot-race.json', import.meta.url), 'utf8'))
if (level.ferry?.kind !== 'race') throw new Error('Expected the ferry robot race')
const edited = level.ferry.solutionLayout
const reference = cardsToPython(level.cards, level.solutionCards)

test('the second crossing moves only the bridge pulse one turn earlier', () => {
  const first: GridLevel = JSON.parse(readFileSync(new URL('../levels/1975-ferry-crossing.json', import.meta.url), 'utf8'))
  const second: GridLevel = JSON.parse(readFileSync(new URL('../levels/1976-ferry-early-pulse.json', import.meta.url), 'utf8'))
  for (const key of ['tiles', 'start', 'items', 'enemies', 'variants', 'objectives', 'turnLimit', 'cards', 'allowedApi'] as const) {
    assert.deepEqual(second[key], first[key], key)
  }
  const cannon = first.devices?.[0]
  assert.ok(cannon?.kind === 'cannon' && cannon.phase !== undefined)
  assert.equal(first.devices?.length, 1)
  assert.deepEqual(second.devices, [{ ...cannon, phase: cannon.phase - 1 }])

  function pulseTurns(crossing: GridLevel) {
    const result = runProgram(crossing, 'for turn in range(8):\n    wait()')
    return result.frames.filter(frame => frame.state.devices?.hazards.some(hazard => hazard.kind === 'cannon'))
      .map(frame => frame.state.turn)
  }
  assert.deepEqual(pulseTurns(first), [2, 6])
  assert.deepEqual(pulseTurns(second), [1, 5])
})

test('both racers can board the original ferry, so a different player route alone cannot win', () => {
  const original = initialFerryLayout(level)
  const race = runFerryRace(level, original, ['up', 'right', 'pick', 'right', 'down', 'down', 'pick', 'right', 'up'])
  assert.equal(race.playerArrival, 9)
  assert.equal(race.botArrival, 9)
  assert.equal(race.won, false)
})

test('the nearest robot uses walking distance around the wall and picks A first on equal distances', () => {
  const blockedShortcut: FerryRaceLayout = {
    batteries: [{ x: 4, y: 2 }, { x: 4, y: 1 }], wall: { x: 3, y: 2 },
  }
  const shorterWalk = runFerryRace(level, blockedShortcut, [])
  assert.deepEqual(shorterWalk.frames[4].bot.items.map(item => item.id), ['battery-a'])
  assert.equal(shorterWalk.botArrival, 7)
  const tie: FerryRaceLayout = {
    batteries: [{ x: 1, y: 2 }, { x: 2, y: 1 }], wall: { x: 4, y: 3 },
  }
  const sameDistance = runFerryRace(level, tie, [])
  assert.deepEqual(sameDistance.frames[1].bot.player, tie.batteries[0])
  assert.deepEqual(sameDistance.frames[2].bot.items.map(item => item.id), ['battery-b'])
})

test('both timelines use the same deadline, independent cargo and inclusive boarding on the last turn', () => {
  const finished = runFerryRace(level, edited, reference)
  assert.equal(finished.won, true)
  assert.equal(finished.playerArrival, 11)
  assert.equal(finished.botArrival, 13)
  assert.equal(finished.frames.at(-1)?.turn, 11)
  assert.deepEqual(finished.frames[3].player.items.map(item => item.id), ['battery-a'])
  assert.deepEqual(finished.frames[3].bot.items.map(item => item.id), ['battery-b'])

  const delayed = runFerryRace(level, edited, 'wait()\n' + reference)
  assert.equal(delayed.playerArrival, 12)
  assert.equal(delayed.won, false)
  const laterFerry = runFerryRace({ ...level, turnLimit: 13 }, edited, reference)
  assert.equal(laterFerry.botArrival, 13)
  assert.equal(laterFerry.won, false)
})
