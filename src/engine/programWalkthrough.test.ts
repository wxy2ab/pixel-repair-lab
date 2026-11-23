import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runProgramWalkthrough } from './programWalkthrough'

const program = `def add_charge(current, extra):
    current = current + extra
    return current

def prepare_robot(current):
    extra = 3
    ready = add_charge(current, extra)
    return ready

charge = scan()
result = prepare_robot(charge)
say(str(result))`

test('not binds to one comparison before and/or, preserving grouping, short circuits and operand values', () => {
  const source = `used = False
edge = -1
say(str(not used and edge >= 0))
say(str(False and not missing or 7))
say(str(not (used and edge >= 0)))
say(str(not 0 < 2 < 4 or []))
say(str(not not "ready" and 9))
say(str(True or not missing and missing))
say(str(0 or not used and 4 or 8))`
  const result = runProgramWalkthrough(source, 0)
  assert.equal(result.issue, undefined)
  assert.deepEqual(result.output, ['False', '7', 'True', '[]', '9', 'True', '4'])
  const skipped = 'not '.repeat(80) + 'missing'
  const shortCircuit = runProgramWalkthrough(`say(str(True or ${skipped}))\nsay(str(False and ${skipped}))`, 0)
  assert.equal(shortCircuit.issue, undefined)
  assert.deepEqual(shortCircuit.output, ['True', 'False'])
})

test('the walkthrough follows nested calls, local values and their return destinations', () => {
  const result = runProgramWalkthrough(program, 6)
  assert.equal(result.issue, undefined)
  assert.deepEqual(result.output, ['9'])
  assert.deepEqual(result.frames.map(({ kind, line }) => [kind, line]), [
    ['start', undefined], ['define', 1], ['define', 5], ['assign', 10],
    ['call', 11], ['assign', 6], ['call', 7], ['assign', 2],
    ['return', 3], ['assign', 7], ['return', 8], ['assign', 11],
    ['output', 12], ['end', undefined],
  ])

  const [, , , , outerCall, , innerCall, innerAssign, innerReturn, , outerReturn, resultAssign, printed] = result.frames
  assert.deepEqual(outerCall.stack.map(({ id, name, callLine }) => [id, name, callLine]), [
    [0, '<module>', undefined], [1, 'prepare_robot', 11],
  ])
  assert.deepEqual(innerCall.stack.map(({ id, name }) => [id, name]), [
    [0, '<module>'], [1, 'prepare_robot'], [2, 'add_charge'],
  ])
  assert.deepEqual(innerCall.stack.at(-1)?.values, [
    { name: 'current', value: 6, parameter: true }, { name: 'extra', value: 3, parameter: true },
  ])
  assert.deepEqual(innerAssign.stack.at(-1)?.values[0], { name: 'current', value: 9, parameter: true })
  assert.equal(innerReturn.resumeLine, 7)
  assert.equal(innerReturn.value, 9)
  assert.deepEqual(innerReturn.stack.at(-1)?.values, [
    { name: 'current', value: 6, parameter: true }, { name: 'extra', value: 3 },
  ])
  assert.equal(outerReturn.resumeLine, 11)
  assert.deepEqual(outerReturn.stack[0].values, [{ name: 'charge', value: 6 }])
  assert.deepEqual(resultAssign.stack[0].values, [{ name: 'charge', value: 6 }, { name: 'result', value: 9 }])
  assert.deepEqual(resultAssign.output, [])
  assert.deepEqual(printed.output, ['9'])
  assert.deepEqual(runProgramWalkthrough(program.replaceAll('\n', '\r\n'), 2).output, ['5'])
})

test('walkthrough snapshots do not change after later collection mutations', () => {
  const result = runProgramWalkthrough('bag = [1]\nbag.append(2)\nsize = len(bag)\nsay(str(size))', 0)
  assert.equal(result.issue, undefined)
  const assignments = result.frames.filter(({ kind }) => kind === 'assign')
  assert.deepEqual(assignments[0].value, [1])
  assert.deepEqual(assignments[0].stack[0].values, [{ name: 'bag', value: [1] }])
  assert.deepEqual(assignments[1].stack[0].values, [{ name: 'bag', value: [1, 2] }, { name: 'size', value: 2 }])
})

test('assignment evaluation records the computed value before writing to either destination', () => {
  for (const target of ['result', 'charge']) {
    const source = ['charge = scan()', target + ' = charge + 3', 'say(str(' + target + '))'].join('\n')
    const { frames, output, issue } = runProgramWalkthrough(source, 2, { traceAssignmentValues: true })
    assert.equal(issue, undefined)
    assert.deepEqual(output, ['5'])
    const events = frames.filter(({ line }) => line === 2)
    assert.deepEqual(events.map(({ kind, name, value }) => [kind, name, value]), [
      ['evaluate', target, 5], ['assign', target, 5],
    ])
    assert.deepEqual(events[0].stack[0].values, [{ name: 'charge', value: 2 }])
    assert.deepEqual(events[1].stack[0].values, target === 'charge'
      ? [{ name: 'charge', value: 5 }]
      : [{ name: 'charge', value: 2 }, { name: 'result', value: 5 }])
  }
})

test('walkthroughs bound execution and only allow their configured input and output', () => {
  const denied = runProgramWalkthrough('move("up")', 6)
  assert.deepEqual(denied.issue, { code: 'apiDisabled', line: 1, detail: 'move' })
  assert.deepEqual(runProgramWalkthrough('say(scan())', 6).issue, { code: 'type', line: 1, detail: 'say' })
  assert.equal(runProgramWalkthrough('say("result")', Number.NaN).issue?.code, 'type')

  const loop = runProgramWalkthrough('while True:\n    say("loop")', 0)
  assert.equal(loop.issue?.code, 'limit')
  assert.equal(loop.frames.length, 96)
  assert.equal(loop.output.length, 95)
  assert.notEqual(loop.frames.at(-1)?.kind, 'end')
})
