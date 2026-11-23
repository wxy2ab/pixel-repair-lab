import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MachineLevel } from '../shared/hardware'
import { runMachine } from './machine'

const label = { zh: '算一算', en: 'Calculate' }
const level: MachineLevel = {
  version: 1,
  id: 'machine-test',
  order: 0,
  kind: 'machine',
  title: label,
  concept: label,
  brief: label,
  hints: [],
  starterCode: 'HALT',
  allowedOps: ['LOAD', 'ADD', 'SUB', 'STORE', 'HALT'],
  cases: [
    { label, memory: [8, 3, 0], accumulator: 6, goal: { accumulator: 8, memory: [{ address: 2, value: 8 }] } },
    { label, memory: [11, 2, 0], goal: { accumulator: 11, memory: [{ address: 2, value: 11 }] } },
  ],
}

test('the machine executes all five operations with exact source lines and immutable snapshots', () => {
  const program = ['# Start here', 'load 0', '', 'AdD +1 # increase', 'sub 1', 'store 2', 'halt', 'STORE 0'].join('\r\n')
  const result = runMachine(level, program, 0)
  assert.equal(result.won, true)
  assert.deepEqual(result.frames.map(({ instruction }) => instruction), [
    { op: 'LOAD', address: 0 }, { op: 'ADD', address: 1 }, { op: 'SUB', address: 1 }, { op: 'STORE', address: 2 }, { op: 'HALT' },
  ])
  assert.deepEqual(result.frames.map(({ line }) => line), [2, 4, 5, 6, 7])
  assert.deepEqual(result.frames.map(({ state }) => state.accumulator), [8, 11, 8, 8, 8])
  assert.deepEqual(result.frames.map(({ state }) => state.pc), [1, 2, 3, 4, 5])
  assert.equal(result.initial.accumulator, 6)
  assert.deepEqual(result.final, { memory: [8, 3, 8], accumulator: 8, pc: 5, steps: 5, halted: true })
  assert.deepEqual(result.frames[2].state.memory, [8, 3, 0])
  assert.deepEqual(level.cases[0].memory, [8, 3, 0])
  assert.notEqual(result.final.memory, result.frames.at(-1)!.state.memory)
  assert.notEqual(result.initial.memory, result.frames[0].state.memory)

  const alternate = runMachine(level, program, 1)
  assert.equal(alternate.won, true)
  assert.equal(alternate.final.memory[2], 11)
  assert.deepEqual(runMachine(level, program, 0), result)
})

test('syntax, opcode restrictions, and instruction count have clear source-line errors', () => {
  const badPrograms = [
    { source: 'LOAD 0\nJUMP 1', level, issue: { code: 'cpuOpcode', detail: 'JUMP', line: 2 } },
    { source: '# Comment\nHALT 1', level, issue: { code: 'cpuSyntax', detail: 'HALT', line: 2 } },
    { source: 'LOAD 1.5', level, issue: { code: 'cpuSyntax', detail: 'LOAD', line: 1 } },
    { source: 'STORE', level, issue: { code: 'cpuSyntax', detail: 'STORE', line: 1 } },
    { source: 'ADD 0 1', level, issue: { code: 'cpuSyntax', detail: 'ADD', line: 1 } },
    { source: 'SUB 0\nHALT', level: { ...level, allowedOps: ['LOAD', 'HALT'] as const }, issue: { code: 'cpuDisabled', detail: 'SUB', line: 1 } },
  ]
  for (const problem of badPrograms) {
    const result = runMachine({ ...problem.level, allowedOps: [...problem.level.allowedOps] }, problem.source, 0)
    assert.deepEqual(result.issue, problem.issue)
    assert.equal(result.frames.length, 0)
    assert.equal(result.final.pc, 0)
  }
  const valid = runMachine(level, 'LOAD 0\n'.repeat(30) + 'STORE 2\nHALT', 0)
  assert.equal(valid.won, true)
  assert.equal(valid.frames.length, 32)
  const tooLong = runMachine(level, 'LOAD 0\n'.repeat(32) + 'HALT', 0)
  assert.deepEqual(tooLong.issue, { code: 'limit', line: 33 })
  assert.equal(runMachine(level, '#'.repeat(12_001), 0).issue?.code, 'limit')
})

test('an invalid memory address keeps the previous instruction state and identifies the line', () => {
  for (const address of [-1, 3]) {
    const result = runMachine(level, `LOAD 1\n# next operation\nSUB ${address}\nHALT`, 0)
    assert.deepEqual(result.issue, { code: 'memoryAddress', detail: String(address), line: 3 })
    assert.deepEqual(result.final, { memory: [8, 3, 0], accumulator: 3, pc: 1, steps: 1, halted: false })
    assert.equal(result.frames.length, 1)
  }
})

test('HALT is required even when the data matches, and the accumulator and each memory cell matter', () => {
  const missing = runMachine(level, 'LOAD 0\nSTORE 2\n# End', 0)
  assert.deepEqual(missing.issue, { code: 'cpuMissingHalt', line: 2 })
  assert.equal(missing.final.memory[2], 8)
  assert.equal(missing.won, false)
  assert.equal(runMachine(level, '# no instructions', 0).issue?.code, 'cpuMissingHalt')

  const wrongAccumulator = runMachine(level, 'LOAD 0\nSTORE 2\nADD 1\nHALT', 0)
  assert.deepEqual(wrongAccumulator.issue, { code: 'unfinished', detail: 'ACC' })
  const wrongMemory = runMachine(level, 'LOAD 0\nHALT', 0)
  assert.deepEqual(wrongMemory.issue, { code: 'unfinished', detail: '2' })
  assert.equal(runMachine(level, 'HALT', -1).issue?.code, 'cpuScenario')
})
