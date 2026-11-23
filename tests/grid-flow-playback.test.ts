import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runProgram } from '../src/engine/run'
import type { GridLevel } from '../src/shared/types'
import { gridPlayback, gridStepActivity } from '../src/web/gridExecution'

const level: GridLevel = JSON.parse(readFileSync(new URL('../levels/07-binary-beacons.json', import.meta.url), 'utf8'))

test('a condition with scan and a nested call preserves the board until the next physical command', () => {
  const source = ['def first(bits):', '    return bits[0]', 'if first(scan()):', '    submit(5)'].join('\n')
  const result = runProgram({ ...level, variants: undefined }, source, {}, {}, true, true)
  for (const rows of [undefined, result.rackSteps]) {
    const active = gridPlayback(result, rows).filter(step => step.flow || step.action)
    assert.deepEqual(active.map(step => gridStepActivity(step)?.action), ['scan', 'call', 'return', 'if', 'submit'])
    assert.deepEqual(active.map(step => step.frameIndex), [0, 0, 0, 0, 1])
    assert.equal(active[2].flow?.value, 1)
    assert.equal(active[3].flow?.condition, true)
  }
})

test('a folded helper returns to the calling line and a rejected API never advances the board', () => {
  const source = 'from my_algorithms import charge\nvalue = charge(2)\npick(1)'
  const result = runProgram({ ...level, variants: undefined }, source,
    { charge: 'def charge(value):\n    return value + 3' }, {}, true, true)
  const steps = gridPlayback(result, result.rackSteps, false)
  assert.deepEqual(steps.filter(step => step.flow).map(step => [step.flow?.kind, step.position?.line]), [['call', 2], ['return', 2]])
  assert.equal(steps.find(step => step.flow?.kind === 'return')?.flow?.value, 5)
  assert.ok(steps.every(step => step.frameIndex === -1))
  assert.deepEqual([gridStepActivity(steps.at(-1))?.action, gridStepActivity(steps.at(-1))?.failed], ['pick', true])
})
