import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AlgorithmLevel } from '../shared/advanced'
import { validateLevel } from '../shared/validate'
import { runBatteryDispatchTrial } from './batteryDispatch'

const source = `from algorithms import charge_total

def dispatch_report(arrivals, records, increment, actions):
    queue = []
    temporary = []
    taken = []
    current = {}
    for name in arrivals:
        current[name] = records[name]
    for name in arrivals:
        queue.append(name)
    for action in actions:
        if action == "stage":
            name = queue.pop(0)
            temporary.append([name, charge_total(current[name], increment)])
        else:
            battery = temporary.pop()
            current[battery[0]] = battery[1]
            taken.append(battery[0])
    return [taken, current]`

const text = { zh: '补电交接', en: 'Battery dispatch' }
const helper = { charge_total: 'def charge_total(current, added):\n    return current + added' }
const level: AlgorithmLevel = {
  version: 1, id: 'battery-dispatch-test', order: 1, stage: 'challenge', kind: 'algorithm', functionName: 'dispatch_report',
  unit: { id: 'structures', title: text, order: 1 }, title: text, concept: text, brief: text, hints: [], snippets: [],
  helpers: ['charge_total'], starterCode: source, solutionCode: source,
  cases: [
    { args: [['A', 'B', 'C'], { A: 2, B: 4, C: 1 }, 3, ['stage', 'stage', 'retrieve', 'stage', 'retrieve', 'retrieve']],
      expected: [['B', 'C', 'A'], { A: 5, B: 7, C: 4 }] },
    { args: [['X', 'Y', 'Z'], { X: 0, Y: 2, Z: 3 }, 2, ['stage', 'stage', 'retrieve']],
      expected: [['Y'], { X: 0, Y: 4, Z: 3 }] },
  ],
  batteryDispatch: { trialCase: 0, predictions: [{ caseIndex: 1, orders: [['X'], ['Y']], records: [{ X: 0, Y: 4, Z: 3 }, { X: 2, Y: 4, Z: 3 }] }] },
}

test('the dispatch trial follows the actual FIFO and LIFO states and reveals the line that changed them', () => {
  const trial = runBatteryDispatchTrial(level, source, 0, {}, helper)
  assert.equal(trial.issue, undefined)
  assert.equal(trial.passed, true)
  assert.deepEqual(trial.result, { order: ['B', 'C', 'A'], records: { A: 5, B: 7, C: 4 } })
  assert.deepEqual(trial.steps.filter(step => step.kind === 'queueTake').map(step => [step.battery, step.queue, step.line]), [
    ['A', ['B', 'C'], 14], ['B', ['C'], 14], ['C', [], 14],
  ])
  const firstPickup = trial.steps.findIndex(step => step.kind === 'stackTake')
  assert.deepEqual(trial.steps.slice(firstPickup - 1, firstPickup + 3).map(step => [step.kind, step.battery, step.code.trim()]), [
    ['stackAdd', 'B', 'temporary.append([name, charge_total(current[name], increment)])'],
    ['stackTake', 'B', 'battery = temporary.pop()'],
    ['update', 'B', 'current[battery[0]] = battery[1]'],
    ['record', 'B', 'taken.append(battery[0])'],
  ])
  assert.deepEqual(trial.steps[firstPickup - 1].stack, [{ name: 'A', charge: 5 }, { name: 'B', charge: 7 }])
  assert.deepEqual(trial.steps[firstPickup].stack, [{ name: 'A', charge: 5 }])
  assert.deepEqual(trial.steps[firstPickup].records, { A: 2, B: 4, C: 1 })
  assert.deepEqual(trial.steps[firstPickup + 1].records, { A: 2, B: 7, C: 1 })
  assert.deepEqual(trial.steps[firstPickup + 2].order, ['B'])
  assert.equal(trial.steps.at(-1)?.kind, 'return')
  assert.equal(trial.steps.at(-1)?.code.trim(), 'return [taken, current]')
})

test('prediction verification uses the same program and its selected helper on the new batch', () => {
  const trial = runBatteryDispatchTrial(level, source, 1, {}, helper)
  assert.equal(trial.passed, true)
  assert.deepEqual(trial.result, { order: ['Y'], records: { X: 0, Y: 4, Z: 3 } })
  assert.deepEqual(trial.steps.at(-1)?.queue, ['Z'])
  assert.deepEqual(trial.steps.at(-1)?.stack, [{ name: 'X', charge: 2 }])

  const personal = { charge_total: 'def charge_total(current, added):\n    return current + added + 2' }
  const changed = runBatteryDispatchTrial(level, source.replace('from algorithms ', 'from my_algorithms '), 1, personal, helper)
  assert.equal(changed.passed, false)
  assert.equal(changed.issue, undefined)
  assert.deepEqual(changed.result, { order: ['Y'], records: { X: 0, Y: 6, Z: 3 } })
})

test('dispatch authoring rejects empty pops, incorrect expected records and ambiguous prediction choices', () => {
  assert.deepEqual(validateLevel(level).issues, [])

  const invalid = structuredClone(level)
  const [trialArgs, practiceArgs] = invalid.cases.map(sample => sample.args)
  trialArgs[3] = ['retrieve', 'stage']
  assert.ok(validateLevel(invalid).issues.some(issue => issue.path === '/cases/0'))

  invalid.cases[0].args = level.cases[0].args
  practiceArgs[2] = 3
  assert.ok(validateLevel(invalid).issues.some(issue => issue.path === '/cases/1'))

  invalid.cases[1].args = level.cases[1].args
  invalid.batteryDispatch!.predictions[0].orders = [['X'], ['Z']]
  assert.ok(validateLevel(invalid).issues.some(issue => issue.path === '/batteryDispatch/predictions/0/orders'))
})
