import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runMirrorRace } from '../src/engine/mirrorRace'
import { cardsToPython } from '../src/shared/cards'
import { initialMirrors } from '../src/shared/laserTrial'
import type { Direction, GridLevel, MirrorPlacement } from '../src/shared/types'

const level: GridLevel = JSON.parse(readFileSync(new URL('../levels/1980-laser-mirror-race.json', import.meta.url), 'utf8'))
if (level.laserTrial?.kind !== 'race') throw new Error('Expected a mirror race')
const edited = level.laserTrial.solutionMirrors
const reference = cardsToPython(level.cards, level.solutionCards)
const straight: Direction[] = ['down', 'down', 'down', 'down']

test('in the starting layout the shortest route reaches the exit and the player cannot win on that layout', () => {
  const race = runMirrorRace(level, initialMirrors(level), straight)
  assert.deepEqual(race.playerOutcome, { kind: 'exit', turn: 4 })
  assert.deepEqual(race.botOutcome, race.playerOutcome)
  assert.equal(race.won, false)
  for (const { player, bot } of race.frames) assert.deepEqual(player.player, bot.player)
})

test('two real reflections hit the bot on turn two while the other runner keeps moving safely', () => {
  const race = runMirrorRace(level, edited, reference)
  assert.equal(race.won, true)
  assert.deepEqual(race.playerOutcome, { kind: 'exit', turn: 8 })
  assert.equal(race.botOutcome.kind, 'laser')
  assert.equal(race.botOutcome.turn, 2)
  assert.equal(race.botOutcome.issue?.detail, 'hall-light')
  assert.deepEqual(race.frames.map(frame => frame.turn), [0, 1, 2, 3, 4, 5, 6, 7, 8])
  const hits = race.frames[2].bot.devices!.hazards
  assert.deepEqual(hits.map(({ x, y, direction }) => [x, y, direction]), [
    [2, 4, 'right'], [3, 4, 'right'], [3, 3, 'up'], [4, 3, 'right'], [5, 3, 'right'], [6, 3, 'right'],
  ])
  assert.deepEqual(race.frames[2].bot.player, { x: 6, y: 3 })
  assert.deepEqual(race.frames.at(-1)?.bot.player, race.frames[2].bot.player)
  assert.deepEqual(race.frames.at(-1)?.player.player, { x: 6, y: 5 })
  for (const { player, bot } of race.frames) {
    assert.deepEqual(player.devices?.hazards, bot.devices?.hazards)
    assert.ok(!player.devices?.hazards.some(h => h.x === player.player.x && h.y === player.player.y))
  }
})

test('another mirror layout also wins, while crossing the same beam, a wrong turn or disconnection cannot win', () => {
  const alternative: MirrorPlacement[] = [edited[0], { x: 3, y: 2, orientation: '/' }]
  const other = runMirrorRace(level, alternative, reference)
  assert.equal(other.won, true)
  assert.equal(other.botOutcome.turn, 1)
  const bothHit = runMirrorRace(level, edited, straight)
  assert.equal(bothHit.won, false)
  assert.equal(bothHit.playerOutcome.kind, 'laser')
  assert.deepEqual(bothHit.frames[2].player.player, bothHit.frames[2].bot.player)
  const blocked = runMirrorRace(level, edited, ['up'])
  assert.equal(blocked.won, false)
  assert.equal(blocked.playerOutcome.issue?.code, 'blocked')
  const isolated: MirrorPlacement[] = [{ x: 7, y: 5, orientation: '/' }, { x: 6, y: 4, orientation: '/' }]
  assert.equal(runMirrorRace(level, isolated, []).botOutcome.kind, 'noRoute')
})

test('the bot plans around moved mirrors, and an exit or a collision ends that runner immediately', () => {
  const mirrors: MirrorPlacement[] = [initialMirrors(level)[0], { x: 6, y: 3, orientation: '/' }]
  const diverted = runMirrorRace(level, mirrors, [])
  assert.deepEqual(diverted.botOutcome, { kind: 'exit', turn: 8 })
  assert.deepEqual(diverted.frames[1].bot.player, { x: 7, y: 1 })
  assert.equal(diverted.playerOutcome.kind, 'stopped')
  const extraCard = runMirrorRace(level, edited, reference + '\nmove("down")')
  assert.equal(extraCard.won, true)
  assert.equal(extraCard.playerRun.frames.length, 8)
  assert.equal(extraCard.playerRun.issue, undefined)
  const shortRace = runMirrorRace({ ...level, turnLimit: 7 }, edited, reference)
  assert.equal(shortRace.won, false)
  assert.equal(shortRace.playerOutcome.issue?.code, 'turnLimit')
  const litExit = runMirrorRace({ ...level, objectives: [{ type: 'exit', x: 6, y: 3 }] }, edited, straight)
  assert.equal(litExit.playerOutcome.kind, 'laser')
  assert.equal(litExit.won, false)
})
