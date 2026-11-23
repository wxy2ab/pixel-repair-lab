import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../shared/advanced'
import { previewArenaMatch, previewArenaMatches, type ArenaMatchPreviewRequest } from './arenaMatchPreview'

const race = JSON.parse(readFileSync(new URL('../../levels/23-parts-race.json', import.meta.url), 'utf8')) as ArenaLevel
const escape = JSON.parse(readFileSync(new URL('../../levels/24-escape-patrol.json', import.meta.url), 'utf8')) as ArenaLevel
const freight = JSON.parse(readFileSync(new URL('../../levels/1817-freight-carousel.json', import.meta.url), 'utf8')) as ArenaLevel

test('timed previews report the saved round, all scores, and the unspent turn time', () => {
  const preview = previewArenaMatch({
    level: race,
    mode: 'timed',
    progress: { actions: ['right', 'pick'], queued: 'right', remainingMs: 420 },
  })
  assert.deepEqual(preview, {
    levelId: race.id,
    mode: 'timed',
    turn: 2,
    scores: [{ id: 'player', score: 1 }, { id: 'scout', score: 1 }, { id: 'shuttle', score: 1 }],
    remainingMs: 420,
  })
})

test('relaxed previews use the stored code and helper at the saved frame, without a timer', () => {
  const progress = {
    source: 'from my_algorithms import direction\nmove(direction())\npick()\nmove(direction())\npick()',
    personal: { direction: 'def direction():\n    return "right"' },
    course: {},
    step: 2,
  }
  const preview = previewArenaMatch({ level: race, mode: 'relaxed', progress })
  assert.deepEqual(preview, {
    levelId: race.id,
    mode: 'relaxed',
    turn: 2,
    scores: [{ id: 'player', score: 1 }, { id: 'scout', score: 1 }, { id: 'shuttle', score: 1 }],
  })
  const initial = previewArenaMatch({ level: race, mode: 'relaxed', progress: { ...progress, step: 0 } })
  assert.equal(initial?.turn, 0)
  assert.deepEqual(initial?.scores.map(entry => entry.score), [0, 0, 0])
})

test('completed or stale saved positions are excluded from the list', () => {
  const timed = previewArenaMatch({
    level: escape, mode: 'timed', progress: { actions: ['wait', 'wait', 'wait'], remainingMs: 0 },
  })
  assert.equal(timed, undefined)
  const relaxed = previewArenaMatch({
    level: escape, mode: 'relaxed', progress: { source: 'wait()', step: 1, personal: {}, course: {} },
  })
  assert.equal(relaxed, undefined)
})

test('the most recent preview skips stale saves and stops after the first playable match', () => {
  const stale: ArenaMatchPreviewRequest = {
    level: escape, mode: 'timed', progress: { actions: ['wait', 'wait', 'wait'], remainingMs: 0 },
  }
  const playable: ArenaMatchPreviewRequest = {
    level: race, mode: 'timed', progress: { actions: ['right'], remainingMs: 420 },
  }
  const older: ArenaMatchPreviewRequest = {
    get level() { return assert.fail('The older save should stay unopened') },
    mode: 'timed', progress: { actions: [], remainingMs: 0 },
  }
  const matches = previewArenaMatches({ requests: [stale, playable, older], limit: 1 })
  assert.equal(matches.length, 1)
  assert.equal(matches[0].levelId, race.id)
  assert.equal(matches[0].turn, 1)
})

test('opted-in timed and relaxed previews show the same saved positions, pickups and gates', () => {
  const requests: ArenaMatchPreviewRequest[] = [
    { level: freight, mode: 'timed', progress: { actions: ['left', 'pick', 'wait', 'wait'], remainingMs: 700 } },
    { level: freight, mode: 'relaxed', progress: {
      source: 'move("left")\npick()\nwhile True:\n    wait()', personal: {}, course: {}, step: 4,
    } },
  ]
  const [timed, relaxed] = previewArenaMatches({ requests, includeBoard: true })
  assert.equal(timed.turn, 4)
  assert.equal(relaxed.turn, 4)
  const board = timed.board
  assert.ok(board)
  assert.deepEqual(board, relaxed.board)
  assert.deepEqual(board.actors.find(actor => actor.id === 'player'), { id: 'player', x: 5, y: 7, score: 1 })
  assert.deepEqual(board.actors.find(actor => actor.id === 'relay'), { id: 'relay', x: 6, y: 6, score: 1 })
  assert.equal(board.items.some(item => item.id === 'battery-5'), false)
  assert.deepEqual(board.items.find(item => item.id === 'shipment-1'), { id: 'shipment-1', x: 4, y: 3 })
  assert.equal(freight.tiles[4][4], '#')
  assert.equal(board.tiles[4][4], '.')
  assert.equal(freight.tiles[4][2], '.')
  assert.equal(board.tiles[4][2], '#')
  assert.equal(previewArenaMatches({ requests }).every(match => !('board' in match)), true)
})

test('saved board previews fall back to the fixed terrain on a static map', () => {
  const preview = previewArenaMatch({
    level: race,
    mode: 'timed',
    progress: { actions: ['right'], remainingMs: 420 },
  }, true)
  assert.deepEqual(preview?.board?.tiles, race.tiles)
})
