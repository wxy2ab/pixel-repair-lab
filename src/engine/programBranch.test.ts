import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runBranchLesson } from './programBranch'
import { runProgramWalkthrough } from './programWalkthrough'

const source = [
  'result = scan()',
  '',
  'enough = result >= 4',
  'door = door_open()',
  'can_leave = enough and door',
  'if can_leave:',
  '    say("leave")',
  'else:',
  '    say("wait")',
].join('\n')

test('the branch lesson traces both checks and the actual chosen Python header and body', () => {
  const examples = [
    { input: 4, doorOpen: true, enough: true, canLeave: true },
    { input: 4, doorOpen: false, enough: true, canLeave: false },
    { input: 3, doorOpen: true, enough: false, canLeave: false },
    { input: 5, doorOpen: true, enough: true, canLeave: true },
  ]
  for (const { input, doorOpen, enough, canLeave } of examples) {
    const result = runBranchLesson(source, input, doorOpen)
    assert.deepEqual(result, {
      comparison: { value: enough, line: 3, code: 'enough = result >= 4' },
      door: { value: doorOpen, line: 4, code: 'door = door_open()' },
      condition: { value: canLeave, line: 5, code: 'can_leave = enough and door' },
      guard: { line: 6, code: 'if can_leave:' },
      choice: canLeave ? { line: 6, code: 'if can_leave:', path: 'if' } : { line: 8, code: 'else:', path: 'else' },
      action: canLeave ? { line: 7, code: '    say("leave")', value: 'leave' }
        : { line: 9, code: '    say("wait")', value: 'wait' },
      output: canLeave ? 'leave' : 'wait',
    })
  }
})

test('branch traces are opt-in and independent from the condition assignment and output text', () => {
  const normal = runProgramWalkthrough(source, 4, { doorOpen: false })
  assert.deepEqual(normal.output, ['wait'])
  assert.equal(normal.frames.some(({ kind }) => kind === 'branch'), false)

  const changedGuard = source.replace('if can_leave:', 'if not can_leave:').replace('say("wait")', 'say("leave")')
  const result = runBranchLesson(changedGuard, 4, true)
  assert.equal(result?.condition.value, true)
  assert.equal(result?.guard.code, 'if not can_leave:')
  assert.equal(result?.choice.path, 'else')
  assert.equal(result?.action.line, 9)
  assert.equal(result?.output, 'leave')
})
