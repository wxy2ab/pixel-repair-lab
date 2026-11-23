import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { breadboardFaultBuild, breadboardIssues, breadboardProgramIssues, canAddBreadboardWire, canPlaceBreadboardPart,
  legacyBreadboardParts, type BreadboardFault, type BreadboardLevel, type BreadboardPart, type BreadboardWire } from '../src/shared/breadboard'

const label = { zh: '灯', en: 'Lamp' }
const series: BreadboardLevel = {
  kind: 'breadboard', version: 1, id: 'lamp', order: 1, title: label, brief: label, concept: label,
  stage: 'exercise', hints: [], board: { mode: 'series', initialWires: [], solutionWires: [['5V', 'B1']] },
}

test('component legs and jumpers reserve individual holes; an empty board frees the old A row', () => {
  const parts = legacyBreadboardParts()
  const wires: BreadboardWire[] = [['5V', 'B3']]
  const canPlace = (kind: BreadboardPart['kind'], pins: [string, string]) => canPlaceBreadboardPart(parts, wires, { kind, pins })
  assert.ok(canPlace('led', ['A6', 'A5']))  // A part can reuse its own holes when flipped.
  assert.ok(canPlace('resistor', ['E4', 'D4'])) // Two distinct holes can belong to the same strip.
  assert.equal(canPlace('button', ['B3', 'E1']), false)
  assert.equal(canPlace('resistor', ['A1', 'E1']), false)
  assert.equal(canPlace('led', ['C1', 'C1']), false)
  assert.equal(canPlace('led', ['5V', 'A5']), false)
  assert.equal(canAddBreadboardWire('series', [], ['A1', 'B2']), false)
  assert.ok(canAddBreadboardWire('series', [], ['A1', 'B2'], []))
  assert.equal(canAddBreadboardWire('series', wires, ['B3', 'B1'], []), false)
  assert.ok(canAddBreadboardWire('series', wires, ['5V', 'E3'], parts))
})

test('each level layout is checked against its own wiring, including reused and missing layouts', () => {
  const invalid: BreadboardPart[] = [
    { kind: 'button', pins: ['B1', 'B2'] },
    { kind: 'button', pins: ['E3', 'E4'] },
    { kind: 'led', pins: ['B1', 'C3'] },
  ]
  assert.deepEqual(breadboardIssues({ ...series, board: { ...series.board, initialParts: invalid } }).map(issue => issue.path),
    ['/board/initialParts/1', '/board/initialParts/2', '/board/solutionWires/0'])
  assert.deepEqual(breadboardIssues({ ...series, board: { ...series.board, initialParts: [], initialWires: [['5V', 'A1']], solutionParts: legacyBreadboardParts() } }), [])
  assert.deepEqual(breadboardIssues({ ...series, board: { ...series.board, initialWires: [['5V', 'A1']] } }).map(issue => issue.path),
    ['/board/initialWires/0'])
})

test('only an existing, distinct series lesson can supply an Arduino build', () => {
  const project: BreadboardLevel = { ...series, id: 'uno', board: { ...series.board, mode: 'call-lamp', carryFrom: series.id } }
  const hasCarryIssue = (level: BreadboardLevel) => breadboardProgramIssues(level, [series, project]).some(issue => issue.code === 'breadboard-carry')
  assert.equal(hasCarryIssue(project), false)
  assert.equal(hasCarryIssue({ ...project, board: { ...project.board, carryFrom: 'missing' } }), true)
  assert.equal(hasCarryIssue({ ...project, board: { ...project.board, carryFrom: project.id } }), true)
  assert.equal(breadboardIssues({ ...series, board: { ...series.board, carryFrom: series.id } })[0].path, '/board/carryFrom')
})

test('repair tickets change one physical connection independently of the reference and of each other', () => {
  const level: BreadboardLevel = JSON.parse(readFileSync(new URL('../levels/6060-dc-breadboard-meter-repair.json', import.meta.url), 'utf8'))
  assert.deepEqual(breadboardIssues(level), [])
  const { faults, solutionWires, initialParts } = level.board
  assert.ok(faults && initialParts)
  const loose = breadboardFaultBuild(level, faults[0])
  const backwards = breadboardFaultBuild(level, faults[1])
  assert.deepEqual(loose.wires.at(-1), ['B6', 'C5'])
  assert.deepEqual(loose.parts, initialParts)
  assert.deepEqual(backwards.parts.find(part => part.kind === 'led')?.pins, ['A6', 'A5'])
  assert.deepEqual(backwards.wires, solutionWires)
  loose.wires[0].reverse()
  backwards.parts[2].pins.reverse()
  assert.deepEqual(solutionWires[0], ['uno-D2', 'B1'])
  assert.deepEqual(initialParts[2].pins, ['A5', 'A6'])

  // The source jumper can be specified from either end, but its new hole must be free and on a new strip.
  const faultIssues = (fault: BreadboardFault) => breadboardIssues({ ...level, board: { ...level.board, faults: [fault] } })
  assert.deepEqual(faultIssues({ kind: 'wrong-jumper', wire: ['C2', 'B6'], wrongPin: 'E3' }), [])
  for (const wrongPin of ['B6', 'C6', 'A4', 'B5']) {
    assert.equal(faultIssues({ kind: 'wrong-jumper', wire: ['C2', 'B6'], wrongPin })[0].path, '/board/faults/0')
  }
  assert.equal(faultIssues({ kind: 'wrong-jumper', wire: ['D1', 'D4'], wrongPin: 'E2' })[0].path, '/board/faults/0')
})
