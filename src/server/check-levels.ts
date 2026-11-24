import { circuitMeetsGoal } from '../engine/circuit'
import { fieldWalkthrough } from '../engine/fieldWalkthrough'
import { runMachine } from '../engine/machine'
import { runCpuLecture } from '../engine/cpuLecture'
import { buildUnoProgram, powerOnUno, verifyArduinoSketch } from '../engine/arduino'
import { breadboardWorks, readBreadboard, stepBreadboardUno } from '../engine/breadboard'
import { breadboardFaultBuild, breadboardProgram, breadboardProgramIssues } from '../shared/breadboard'
import { resolve } from 'node:path'
import { verifyAiLevel } from '../ai/core'
import { runAlgorithm } from '../engine/algorithms'
import { runArena } from '../engine/arena'
import { runFerryRace } from '../engine/ferryRace'
import { runMirrorRace } from '../engine/mirrorRace'
import { shortChallengeLinkIssues, shortCrossing } from '../shared/shortChallenges'
import { runBatteryDispatchTrial } from '../engine/batteryDispatch'
import { runBatteryPipelineTrial } from '../engine/batteryPipeline'
import { runBatterySearch } from '../engine/programBatterySearch'
import { runBooleanLesson } from '../engine/programBoolean'
import { runBreadthFirst } from '../engine/programBreadthFirst'
import { runBranchLesson } from '../engine/programBranch'
import { repairChargingReturn, runChargingTrial } from '../engine/chargingChallenge'
import { runCollectionLesson } from '../engine/programCollection'
import { repairDebuggingSource, runDebuggingLesson } from '../engine/programDebugging'
import { runDictionaryLesson } from '../engine/programDictionaryLesson'
import { runForLesson } from '../engine/programFor'
import { runFirstBatterySearch } from '../engine/programFirstBatterySearch'
import { runFunctionLesson } from '../engine/programFunction'
import { runListPositionsLesson } from '../engine/programListPositions'
import { runModuleLesson } from '../engine/programModuleLesson'
import { runNestedLoopsLesson } from '../engine/programNestedLoops'
import { runPrefixTotals } from '../engine/programPrefixTotals'
import { runQueueLesson } from '../engine/programQueueLesson'
import { runSelectionSort } from '../engine/programSelectionSort'
import { runProgram } from '../engine/run'
import { runProgramSequence } from '../engine/programSequence'
import { runStackLesson } from '../engine/programStackLesson'
import { runStructureLesson } from '../engine/programStructures'
import { runTwoPointer } from '../engine/programTwoPointer'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { runWhileLesson } from '../engine/programWhile'
import { valuesEqual } from '../engine/values'
import { collectionRecordsMatch, nestedRowsMatch, programGraphics, reorderProgramSource, structureKinds, type ProgramWalkthrough, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import { cardsToPython } from '../shared/cards'
import { breadthFirstReference } from '../shared/breadthFirstLesson'
import { readDispatchCase } from '../shared/batteryDispatch'
import { resolveCourseHelpers } from '../shared/courseHelpers'
import { prerequisiteIssues } from '../shared/coursePrerequisites'
import { dataMeetsGoal, type DataLevel } from '../shared/dataCourse'
import { runDataCourseBatch, runVisionCourseBatch } from '../labs/server'
import { visionMeetsGoal, type VisionLevel } from '../shared/vision'
import type { GridLevel, Issue, Level, RunIssue } from '../shared/types'
import { readLevelFile, scanLevels } from './catalog'

type Check = { path: string; id: string; kind: Level['kind']; passedCases?: number; totalCases?: number }
type ReferenceResult = { won: boolean; passedCases: number; totalCases: number; issue?: RunIssue }

function verifySequence(execution: ProgramWalkthrough, summary: Check): Issue[] {
  const { sequence, visual, cases } = execution
  if (!sequence || !visual) return []
  const main = visual.main
  const reference = main.map(({ id }) => id)
  const readCard = main.find(({ icon }) => icon === 'battery')?.id
  const displayCard = main.find(({ icon }) => icon === 'display')?.id
  const errors: Issue[] = []
  function report(field: string, message: string) {
    errors.push({ path: summary.path + '/execution/' + field, code: 'program-sequence', message })
  }

  for (const [index, { input, expected }] of cases.entries()) {
    const run = runProgramSequence(execution, reference, input)
    const tracedAll = run.steps.length === main.length && run.steps.every(({ cardId, frame }, index) =>
      cardId === reference[index] && frame.kind === (main[index].icon === 'display' ? 'output' : 'assign'))
    if (run.issue || !tracedAll || run.output.length !== 1 || run.output[0] !== expected) {
      report('cases/' + index, 'The reference must run each card once and display the expected result.')
    }
  }
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length

  const broken = runProgramSequence(execution, sequence.broken, cases[0].input)
  const [stored, blocked] = broken.steps
  if (broken.issue?.code !== 'unknownName' || broken.output.length !== 0 || broken.steps.length !== 2
    || stored?.cardId !== readCard || stored?.frame.kind !== 'assign'
    || blocked?.cardId !== displayCard || !blocked?.issue) {
    report('sequence/broken', 'The demonstration must read the input and then stop at the display card because its result is missing.')
  }

  for (const [phase, input] of [['arrange', cases[0].input], ['repair', cases[1].input]] as const) {
    const run = runProgramSequence(execution, sequence[phase], input)
    if (!run.issue || !run.steps.at(-1)?.issue || run.output.length !== 0) {
      report('sequence/' + phase, 'The starting order must stop at a card before it displays a result.')
    }
  }

  return errors
}

function hasVariableValues(frame: ProgramWalkthroughFrame, expected: Record<string, number>) {
  const values = frame.stack[0]?.values
  return values?.length === Object.keys(expected).length
    && values.every(({ name, value }) => Object.hasOwn(expected, name) && expected[name] === value)
}

function verifyVariableCups(execution: ProgramWalkthrough, summary: Check): Issue[] {
  const cups = execution.variableCups!
  const errors = execution.cases.flatMap(({ input, expected }, index) => {
    const run = runProgramWalkthrough(execution.source, input)
    const last = run.frames.at(-1)
    if (!run.issue && last?.kind === 'end' && run.output.length === 2
      && run.output[0] === String(input) && run.output[1] === expected
      && hasVariableValues(last, { [cups.variable]: 0, [cups.snapshot]: input })) return []
    return [{ path: summary.path + '/execution/cases/' + index, code: 'variable-cups',
      message: 'The trace must display the original number twice and keep the saved number after the first name changes.' }]
  })
  summary.totalCases = execution.cases.length
  summary.passedCases = execution.cases.length - errors.length
  return errors
}

function verifyAssignment(execution: ProgramWalkthrough, summary: Check): Issue[] {
  const { assignment, cases, source } = execution
  if (!assignment) return []
  const { inputVariable, resultVariable, overwriteSource } = assignment
  const variants = [
    { source, target: resultVariable, path: 'source' },
    { source: overwriteSource, target: inputVariable, path: 'assignment/overwriteSource' },
  ]
  const errors: Issue[] = []

  for (const [index, { input, expected }] of cases.entries()) {
    const before = { [inputVariable]: input }
    for (const variant of variants) {
      const run = runProgramWalkthrough(variant.source, input, { traceAssignmentValues: true })
      const [start, evaluatedInput, read, calculated, stored, shown, end] = run.frames
      const order = run.frames.length === 7 && start.kind === 'start' && evaluatedInput.kind === 'evaluate'
        && read.kind === 'assign' && calculated.kind === 'evaluate' && stored.kind === 'assign'
        && shown.kind === 'output' && end.kind === 'end'
      const result = calculated?.value
      if (!run.issue && order && typeof result === 'number' && run.output.length === 1 && run.output[0] === expected) {
        const after = { ...before, [variant.target]: result }
        const readInput = evaluatedInput.name === inputVariable && read.name === inputVariable
          && evaluatedInput.line === read.line && evaluatedInput.value === input && read.value === input
          && hasVariableValues(read, before)
        const updatedTarget = calculated.name === variant.target && stored.name === variant.target
          && calculated.line === stored.line && stored.value === result
          && hasVariableValues(calculated, before) && hasVariableValues(stored, after)
        const displayed = String(result) === expected && hasVariableValues(shown, after)
        if (readInput && updatedTarget && displayed) continue
      }
      errors.push({ path: summary.path + '/execution/' + variant.path, code: 'program-assignment',
        message: 'Sample ' + (index + 1) + ' must read the input, calculate before updating the intended variable, and display the expected result.' })
    }
  }
  summary.totalCases = cases.length * variants.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyBoolean(execution: ProgramWalkthrough, summary: Check): Issue[] {
  const threshold = execution.boolean?.threshold
  if (threshold === undefined) return []

  const errors = execution.cases.flatMap(({ input, expected, doorOpen }, index) => {
    const run = doorOpen === undefined ? undefined : runBooleanLesson(execution.source, input, doorOpen)
    const enough = input >= threshold
    if (run && run.comparison.value === enough && run.door.value === doorOpen
      && run.decision.value === (enough && doorOpen) && run.output === expected) return []
    return [{
      path: summary.path + '/execution/cases/' + index,
      code: 'program-boolean',
      message: 'Compare charge with the threshold, read the door, and display the expected result of both conditions.',
    }]
  })
  summary.totalCases = execution.cases.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyFunction(execution: ProgramWalkthrough, summary: Check): Issue[] {
  const errors = execution.cases.flatMap(({ input, expected }, index) => {
    const run = runFunctionLesson(execution, input)
    if (run && run.callerValue === input && String(run.returned) === expected && run.output === expected) return []
    return [{
      path: summary.path + '/execution/cases/' + index,
      code: 'program-function',
      message: 'Pass the reading to the function, update its parameter, and return the expected value without changing the caller’s reading.',
    }]
  })
  summary.totalCases = execution.cases.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyModule(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.moduleLesson) return []
  const { increment } = execution.moduleLesson
  const errors = execution.cases.flatMap(({ input, expected }, index) => {
    const run = runModuleLesson(execution, input)
    if (run && run.result === input + increment && run.output === expected) return []
    return [{
      path: summary.path + '/execution/cases/' + index,
      code: 'program-module',
      message: 'Import the configured function without calling it, pass the charge to it, and display its returned result.',
    }]
  })
  summary.totalCases = execution.cases.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyBranch(execution: ProgramWalkthrough, summary: Check): Issue[] {
  const threshold = execution.branchLesson?.threshold
  if (threshold === undefined) return []

  const errors = execution.cases.flatMap(({ input, expected, doorOpen }, index) => {
    const run = doorOpen === undefined ? undefined : runBranchLesson(execution.source, input, doorOpen)
    const enough = input >= threshold
    const canLeave = enough && doorOpen === true
    if (run && run.comparison.value === enough && run.door.value === doorOpen
      && run.condition.value === canLeave && run.choice.path === (canLeave ? 'if' : 'else') && run.output === expected) return []
    return [{
      path: summary.path + '/execution/cases/' + index,
      code: 'program-branch',
      message: 'Read the charge and door, combine both conditions, and run the expected branch action.',
    }]
  })
  summary.totalCases = execution.cases.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyForLoop(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.forLoop) return []
  const { cases, increment } = execution.forLoop
  const errors = cases.flatMap(({ batteries, expected }, index) => {
    const run = runForLesson(execution.source, batteries)
    if (run && run.rounds === batteries.length && run.results.length === expected.length
      && run.results.every((value, position) => value === expected[position] && value === batteries[position] + increment)) return []
    return [{
      path: summary.path + '/execution/forLoop/cases/' + index,
      code: 'program-for-loop',
      message: 'Visit each battery in order, record its new charge, and stop when the list is exhausted.',
    }]
  })
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length
  return errors
}

function verifyNestedLoops(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.nestedLoops) return []
  const { cases, increment } = execution.nestedLoops
  const errors = cases.flatMap(({ rows, expected }, index) => {
    const run = runNestedLoopsLesson(execution.source, rows)
    const chargedRows = rows.map(row => row.map(charge => charge + increment))
    const rounds = rows.reduce((total, row) => total + row.length, 0)
    if (run && run.rounds === rounds && run.rounds === expected.rounds
      && nestedRowsMatch(run.rows, chargedRows) && nestedRowsMatch(run.rows, expected.rows)) return []
    return [{
      path: summary.path + '/execution/nestedLoops/cases/' + index,
      code: 'program-nested-loops',
      message: 'Select every row in order, charge each battery once, and display the results in their original rows.',
    }]
  })
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length
  return errors
}

function verifyWhileLoop(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.whileLoop) return []
  const { threshold, increment } = execution.whileLoop
  const errors = execution.cases.flatMap(({ input, expected }, index) => {
    const run = runWhileLesson(execution.source, input)
    if (run && run.output === expected && run.steps.every((step, position) => {
      if (step.kind === 'check' || step.kind === 'stop') return step.condition === (step.charge < threshold)
      if (step.kind === 'charge') return step.charge === run.steps[position - 1].charge + increment
      return true
    })) return []
    return [{
      path: summary.path + '/execution/cases/' + index,
      code: 'program-while-loop',
      message: 'Check the threshold before each round, add the configured charge, and display the final charge.',
    }]
  })
  summary.totalCases = execution.cases.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyCollectionLesson(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.collectionLesson) return []
  const { cases, index, key, increment } = execution.collectionLesson
  const errors = cases.flatMap(({ batteries, expected }, caseIndex) => {
    const run = runCollectionLesson(execution.source, batteries)
    const fromPosition = batteries[index]?.charge
    const fromName = batteries.find(({ name }) => name === key)?.charge
    if (run && fromName !== undefined && run.positionValue === fromPosition && run.positionValue === expected.position
      && run.namedValue === fromName && run.namedValue === expected.named) {
      const updated = fromName + increment
      const records = Object.fromEntries(batteries.map(({ name, charge }) => [name, name === key ? updated : charge]))
      const updateStep = run.steps.find(({ kind }) => kind === 'update')
      if (updateStep?.value === updated && collectionRecordsMatch(run.records, records)
        && collectionRecordsMatch(run.records, expected.records)) return []
    }
    return [{
      path: summary.path + '/execution/collectionLesson/cases/' + caseIndex,
      code: 'program-collection-lesson',
      message: 'Read the configured list index and dictionary key, update only that named battery, and display the resulting records.',
    }]
  })
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length
  return errors
}

function verifyBatterySearch(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.batterySearch) return []
  const { demo, practice, binarySource } = execution.batterySearch
  const batches = [['demo', demo], ['practice', practice]] as const
  const methods = [['linear', execution.source], ['binary', binarySource]] as const
  const errors = batches.flatMap(([scenario, { batteries, target, expected }]) => methods.flatMap(([method, source]) => {
    const { result, issue } = runBatterySearch(method, source, batteries, target)
    if (!issue && result && batteries[result.index]?.name === expected.battery && result.comparisons === expected[method]) return []
    return [{
      path: summary.path + '/execution/batterySearch/' + scenario,
      code: 'program-battery-search',
      message: 'The ' + method + ' search must find the expected battery and show each comparison before returning.',
    }]
  }))
  summary.totalCases = batches.length * methods.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyFirstBatterySearch(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.firstBatterySearch) return []
  const { firstSource, demo, practice } = execution.firstBatterySearch
  const ordinary = runBatterySearch('binary', execution.source, demo.unique.batteries, demo.unique.target)
  const repeated = runFirstBatterySearch(firstSource, demo.repeated.batteries, demo.repeated.target)
  const prediction = runFirstBatterySearch(firstSource, practice.batteries, practice.target)
  const ordinaryIndex = demo.unique.batteries.findIndex(battery => battery.charge === demo.unique.target)
  const firstIndex = demo.repeated.batteries.findIndex(battery => battery.charge === demo.repeated.target)
  const expectations = [
    { scenario: 'demo/unique', valid: !ordinary.issue && ordinary.result?.index === ordinaryIndex && ordinary.steps.at(-1)?.kind === 'return' },
    { scenario: 'demo/repeated', valid: !repeated.issue && repeated.result?.index === firstIndex && repeated.steps.some(step => step.kind === 'remember') },
    { scenario: 'practice', valid: !prediction.issue && prediction.result && valuesEqual(prediction.result, practice.expected) },
  ]
  const errors = expectations.flatMap(({ scenario, valid }) => valid ? [] : [{
    path: summary.path + '/execution/firstBatterySearch/' + scenario,
    code: 'program-first-battery-search',
    message: 'The Python run must trace the range changes and return the expected battery position.',
  }])
  summary.totalCases = expectations.length
  summary.passedCases = expectations.length - errors.length
  return errors
}

function verifyBreadthFirst(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.breadthFirstLesson) return []
  const { demo, practice } = execution.breadthFirstLesson
  const maps = [['demo', demo, breadthFirstReference(demo)], ['practice', practice, practice.expected]] as const
  const errors = maps.flatMap(([scenario, map, expected]) => {
    const { result, issue } = runBreadthFirst(execution.source, map)
    if (!issue && result && expected && valuesEqual(result, expected)) return []
    return [{
      path: summary.path + '/execution/breadthFirstLesson/' + scenario,
      code: 'program-breadth-first',
      message: 'The Python run must trace the expected queue order and return the shortest route for this map.',
    }]
  })
  summary.totalCases = maps.length
  summary.passedCases = maps.length - errors.length
  return errors
}

function verifySelectionSort(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.selectionSort) return []
  const { demo, practice } = execution.selectionSort
  const batches = [['demo', demo], ['practice', practice]] as const
  const errors = batches.flatMap(([scenario, { batteries, expected }]) => {
    const { result, issue } = runSelectionSort(execution.source, batteries)
    if (!issue && result && valuesEqual(result, expected)) return []
    return [{
      path: summary.path + '/execution/selectionSort/' + scenario,
      code: 'program-selection-sort',
      message: 'The Python run must trace each round, select the expected batteries, and return the expected order.',
    }]
  })
  summary.totalCases = batches.length
  summary.passedCases = batches.length - errors.length
  return errors
}

function verifyTwoPointer(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.twoPointerLesson) return []
  const { demo, practice } = execution.twoPointerLesson
  const batches = [['demo', demo], ['practice', practice]] as const
  const errors = batches.flatMap(([scenario, { batteries, target, expected }]) => {
    const { result, issue } = runTwoPointer(execution.source, batteries, target)
    if (!issue && result && valuesEqual(result, expected)) return []
    return [{
      path: summary.path + '/execution/twoPointerLesson/' + scenario,
      code: 'program-two-pointer',
      message: 'The Python run must trace the expected pointer moves and return the expected pair.',
    }]
  })
  summary.totalCases = batches.length
  summary.passedCases = batches.length - errors.length
  return errors
}

function verifyPrefixTotals(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.prefixTotalsLesson) return []
  const { demo, practice } = execution.prefixTotalsLesson
  const prefix = [0]
  for (const battery of demo.batteries) prefix.push(prefix.at(-1)! + battery.charge)
  const intervals = demo.batteries.flatMap((_, left) => demo.batteries.slice(left).map((_, offset) => {
    const right = left + offset
    return { scenario: 'demo', batteries: demo.batteries, left, right, expected: { prefix, total: prefix[right + 1] - prefix[left] } }
  }))
  const batches = [...intervals, { scenario: 'practice', ...practice }]
  const errors = batches.flatMap(({ scenario, batteries, left, right, expected }) => {
    const { result, issue } = runPrefixTotals(execution.source, batteries, left, right)
    if (!issue && result && result.direct === expected.total && result.total === expected.total
      && valuesEqual(result.prefix, expected.prefix)) return []
    return [{
      path: summary.path + '/execution/prefixTotalsLesson/' + scenario,
      code: 'program-prefix-totals',
      message: `The Python run must trace the direct sum, prefix table, and subtraction for indices ${left} through ${right}.`,
    }]
  })
  summary.totalCases = batches.length
  summary.passedCases = batches.length - errors.length
  return errors
}

function verifyDictionaryLesson(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.dictionaryLesson) return []
  const { cases } = execution.dictionaryLesson
  const errors = cases.flatMap((sample, index) => {
    const { expected } = sample
    const run = runDictionaryLesson(execution, sample)
    if (run && run.reading === expected.reading && collectionRecordsMatch(run.records, expected.records)) return []
    return [{
      path: summary.path + '/execution/dictionaryLesson/cases/' + index,
      code: 'program-dictionary-lesson',
      message: 'Read the configured key, register the new battery, update only the existing key, and display the resulting records.',
    }]
  })
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length
  return errors
}

function verifyStructuresLesson(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.structures) return []
  const { demo, practice } = execution.structures
  const batches = [['demo', demo], ['practice', practice]] as const
  const errors = batches.flatMap(([scenario, batch]) => structureKinds.flatMap(kind => {
    const { batteries, index, key } = batch
    const selected = {
      list: batteries[index], stack: batteries.at(-1), queue: batteries[0], dictionary: batteries.find(battery => battery.name === key),
    }[kind]
    const remaining = kind === 'stack' ? batteries.slice(0, -1) : kind === 'queue' ? batteries.slice(1) : batteries
    const run = runStructureLesson(execution, kind, batch)
    if (run && selected && valuesEqual(run.selected, selected) && valuesEqual(run.remaining, remaining)) return []

    return [{
      path: summary.path + '/execution/structures/' + scenario,
      code: 'program-structures',
      message: `The ${kind} program must select the battery required by its rule and leave the expected contents.`,
    }]
  }))
  summary.totalCases = batches.length * structureKinds.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyListPositions(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.listPositions) return []
  const { cases } = execution.listPositions
  const errors = cases.flatMap((sample, index) => {
    const { batteries, spare, readIndex, insertIndex, removeIndex, pickIndex, expected } = sample
    const before = batteries.map(({ name }) => name)
    const withSpare = before.toSpliced(insertIndex, 0, spare.name)
    const after = withSpare.toSpliced(removeIndex, 1)
    const run = runListPositionsLesson(execution, sample)
    if (run) {
      const [, read, inserted, removed, selected] = run.steps
      if (read.battery === before[readIndex] && inserted.battery === spare.name && valuesEqual(inserted.order, withSpare)
        && removed.battery === withSpare[removeIndex] && valuesEqual(removed.order, after)
        && selected.battery === after[pickIndex] && run.picked === expected.picked && valuesEqual(run.order, expected.order)) return []
    }
    return [{
      path: summary.path + '/execution/listPositions/cases/' + index,
      code: 'program-list-positions',
      message: 'Read the requested slot, insert and remove at the configured indexes, then read and display the new slot.',
    }]
  })
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length
  return errors
}

function verifyBatterySequenceLesson(execution: ProgramWalkthrough, summary: Check, kind: 'stackLesson' | 'queueLesson'): Issue[] {
  const lesson = execution[kind]
  if (!lesson) return []
  const { cases } = lesson
  const isQueue = kind === 'queueLesson'
  const runLesson = isQueue ? runQueueLesson : runStackLesson
  const errors = cases.flatMap((sample, index) => {
    const run = runLesson(execution, sample)
    if (run && valuesEqual(run.popped, sample.expected.popped) && valuesEqual(run.remaining, sample.expected.remaining)) return []
    return [{
      path: summary.path + '/execution/' + kind + '/cases/' + index,
      code: isQueue ? 'program-queue-lesson' : 'program-stack-lesson',
      message: isQueue
        ? 'Add each new battery at the back, remove from the front, and display the removed and remaining batteries in order.'
        : 'Run each configured push and pop in order, then display the popped batteries and the remaining stack.',
    }]
  })
  summary.totalCases = cases.length
  summary.passedCases = summary.totalCases - errors.length
  return errors
}

function verifyDebuggingLesson(execution: ProgramWalkthrough, summary: Check): Issue[] {
  if (!execution.debugging) return []
  const { cases, increment, loopLine, returnLine } = execution.debugging
  const repaired = repairDebuggingSource(execution)
  const errors = cases.flatMap(({ batteries, expected }, index) => {
    const charged = batteries.map(charge => charge + increment)
    const fixed = repaired === undefined ? undefined : runDebuggingLesson(repaired, batteries)
    const visitsAll = fixed && valuesEqual(fixed.results, charged) && valuesEqual(fixed.results, expected)
      && fixed.steps.some(step => step.kind === 'finish-loop' && step.line === loopLine)
      && fixed.steps.some(step => step.kind === 'return' && step.line === returnLine)

    const original = index < 2 ? runDebuggingLesson(execution.source, batteries) : undefined
    const stopsEarly = original && valuesEqual(original.results, charged.slice(0, 1))
      && original.steps.some(step => step.kind === 'take' && step.line === loopLine)
      && original.steps.some(step => step.kind === 'return' && step.line === returnLine)
      && !original.steps.some(step => step.kind === 'finish-loop')
    if (visitsAll && (index >= 2 || stopsEarly)) return []

    return [{ path: summary.path + '/execution/debugging/cases/' + index, code: 'program-debugging',
      message: 'The original lesson must return after the first battery. Moving that return outside the loop must charge every battery in order.' }]
  })
  summary.totalCases = cases.length
  summary.passedCases = cases.length - errors.length
  return errors
}

function verifyReference(level: Level, summary: Check, catalog: Level[]): Issue[] {
  const { path } = summary
  function record(result: ReferenceResult, field: string): Issue[] {
    summary.passedCases = result.passedCases
    summary.totalCases = result.totalCases
    if (result.won) return []
    const issue = result.issue
    return [{
      path: path + field,
      code: issue?.code ?? 'solution',
      message: 'Reference passed ' + result.passedCases + ' of ' + result.totalCases + ' scenarios.'
        + (issue ? ' ' + issue.code + (issue.line ? ' on line ' + issue.line : '') + (issue.detail ? ' (' + issue.detail + ')' : '') + '.' : ''),
    }]
  }

  switch (level.kind) {
    case 'lecture': {
      const hardware = level.animation?.hardware
      if (hardware?.kind === 'cpu') {
        const run = runCpuLecture(hardware)
        if (run.issue) return [{ path: path + '/animation/hardware/source', code: 'cpu-program', message: 'The example must run to HALT: ' + run.issue.code }]
        summary.totalCases = hardware.checkpoints.length
        const missing = hardware.checkpoints.flatMap(({ pc }, i) => run.frames[pc] ? [] : [{
          path: path + '/animation/hardware/checkpoints/' + i, code: 'cpu-checkpoint', message: 'The example never executes this instruction.'
        }])
        summary.passedCases = summary.totalCases - missing.length
        return missing
      }
      const execution = level.execution
      if (!execution) return []
      if (execution.batterySearch) return verifyBatterySearch(execution, summary)
      if (execution.firstBatterySearch) return verifyFirstBatterySearch(execution, summary)
      if (execution.breadthFirstLesson) return verifyBreadthFirst(execution, summary)
      if (execution.selectionSort) return verifySelectionSort(execution, summary)
      if (execution.twoPointerLesson) return verifyTwoPointer(execution, summary)
      if (execution.prefixTotalsLesson) return verifyPrefixTotals(execution, summary)
      if (execution.sequence) return verifySequence(execution, summary)
      if (execution.variableCups) return verifyVariableCups(execution, summary)
      if (execution.assignment) return verifyAssignment(execution, summary)
      if (execution.boolean) return verifyBoolean(execution, summary)
      if (execution.branchLesson) return verifyBranch(execution, summary)
      if (execution.functionLesson) return verifyFunction(execution, summary)
      if (execution.moduleLesson) return verifyModule(execution, summary)
      if (execution.forLoop) return verifyForLoop(execution, summary)
      if (execution.nestedLoops) return verifyNestedLoops(execution, summary)
      if (execution.whileLoop) return verifyWhileLoop(execution, summary)
      if (execution.collectionLesson) return verifyCollectionLesson(execution, summary)
      if (execution.dictionaryLesson) return verifyDictionaryLesson(execution, summary)
      if (execution.structures) return verifyStructuresLesson(execution, summary)
      if (execution.listPositions) return verifyListPositions(execution, summary)
      if (execution.stackLesson) return verifyBatterySequenceLesson(execution, summary, 'stackLesson')
      if (execution.queueLesson) return verifyBatterySequenceLesson(execution, summary, 'queueLesson')
      if (execution.debugging) return verifyDebuggingLesson(execution, summary)
      const workstation = level.animation?.workstation
      const results = execution.cases.map(({ input }) => workstation
        ? fieldWalkthrough(execution.source, input, workstation) : runProgramWalkthrough(execution.source, input))
      const errors = execution.cases.flatMap(({ expected }, index) => {
        const result = results[index]
        if ('snapshots' in result && Array.isArray(result.snapshots)) {
          const positions = result.snapshots.map(frame => frame ? result.frames.indexOf(frame) : -1)
          if (positions.some((position, i) => position < 0 || (i > 0 && position <= positions[i - 1]))) {
            return [{ path: path + '/animation/workstation/checkpoints', code: 'workstation-trace',
              message: 'Checkpoints must follow the executed Python statements in scenario ' + (index + 1) + '.' }]
          }
        }
        if (!result.issue && result.frames.at(-1)?.kind === 'end' && result.output.length === 1 && result.output[0] === expected) return []
        return [{ path: `${path}/execution/cases/${index}`, code: result.issue?.code ?? 'program-walkthrough',
          message: 'The walkthrough must finish with the expected output for this input.' }]
      })
      summary.totalCases = execution.cases.length
      summary.passedCases = execution.cases.length - errors.length
      if (execution.visual) {
        for (const block of programGraphics(execution.visual)) {
          if (!block.calls || results.some(({ frames }) => frames.some(frame => frame.kind === 'call' && frame.line === block.line && frame.name === block.calls))) continue
          errors.push({ path: path + '/execution/visual', code: 'program-visual', message: `Graphic ${block.id} must call ${block.calls} as configured.` })
        }
        for (const [index, { order }] of execution.visual.practice.entries()) {
          const { input, expected } = execution.cases[0]
          const reordered = runProgramWalkthrough(reorderProgramSource(execution, order), input)
          if (!reordered.issue && reordered.output.length === 1 && reordered.output[0] === expected) {
            errors.push({ path: `${path}/execution/visual/practice/${index}/order`, code: 'program-visual', message: 'The starting order should need a correction.' })
          }
        }
      }
      return errors
    }
    case 'ai':
      return verifyAiLevel(level).map(message => ({ path: path + '/examplePrompts', code: 'ai-examples', message }))
    case 'grid':
    case 'arena':
    case 'algorithm': {
      const course = resolveCourseHelpers(level, catalog)
      const missing = (level.helpers ?? []).flatMap((name, index) => typeof course[name] !== 'string'
        ? [{ path: path + '/helpers/' + index, code: 'missing-helper', message: 'Expected one standalone reference exercise for ' + name + '.' }]
        : [])
      if (missing.length) return missing
      if (level.kind === 'grid') {
        const source = cardsToPython(level.cards, level.solutionCards)
        if (level.laserTrial?.kind === 'race') {
          const { won } = runMirrorRace(level, level.laserTrial.solutionMirrors, source)
          return record({ won, passedCases: Number(won), totalCases: 1 }, '/solutionCards')
        }
        if (level.ferry?.kind === 'race') {
          const { won } = runFerryRace(level, level.ferry.solutionLayout, source)
          return record({ won, passedCases: Number(won), totalCases: 1 }, '/solutionCards')
        }
        return record(runProgram(level, source, undefined, course), '/solutionCards')
      }
      if (level.kind === 'arena') return record(runArena(level, level.solutionCode, undefined, course), '/solutionCode')
      const result = runAlgorithm(level, level.solutionCode, undefined, course)
      const errors = record({
        won: result.won, passedCases: result.cases.filter(entry => entry.passed).length, totalCases: level.cases.length, issue: result.issue,
      }, '/solutionCode')
      if (level.batteryDispatch) {
        const { trialCase, predictions } = level.batteryDispatch
        const cases = [trialCase, ...predictions.map(item => item.caseIndex)]
        for (const index of cases) {
          const scenario = readDispatchCase(level.cases[index])
          const trial = runBatteryDispatchTrial(level, level.starterCode, index, {}, course)
          const stages = scenario?.actions.filter(action => action === 'stage').length
          const pickups = scenario?.actions.filter(action => action === 'retrieve').length
          const count = (kind: (typeof trial.steps)[number]['kind']) => trial.steps.filter(step => step.kind === kind).length
          if (!scenario || !trial.passed || trial.issue || trial.steps.at(-1)?.kind !== 'return'
            || count('enqueue') !== scenario.arrivals.length || count('queueTake') !== stages || count('stackAdd') !== stages
            || count('stackTake') !== pickups || count('update') !== pickups || count('record') !== pickups) {
            errors.push({ path: path + '/starterCode', code: 'battery-dispatch',
              message: 'Case ' + (index + 1) + ' must run successfully and trace the queue, stack, dictionary, and pickup list.' })
          }
        }
      }
      if (level.batteryPipeline) {
        const { trialCase, prediction } = level.batteryPipeline
        for (const index of [trialCase, prediction.caseIndex]) {
          const trial = runBatteryPipelineTrial(level, level.starterCode, index, {}, course)
          const stages = new Set(trial.steps.map(step => step.kind))
          if (!trial.passed || trial.issue || trial.steps.at(-1)?.kind !== 'return'
            || !(['sort', 'pairCheck', 'pair', 'prefix', 'total'] as const).every(kind => stages.has(kind))) {
            errors.push({ path: path + '/starterCode', code: 'battery-pipeline',
              message: 'Case ' + (index + 1) + ' must trace the sort, pair search, and prefix range total before returning.' })
          }
        }
      }
      if (level.chargingChallenge) {
        const { trialCase } = level.chargingChallenge
        const expected = level.cases[trialCase].expected
        const trial = runChargingTrial(level, level.starterCode, trialCase, {}, course)
        const repaired = repairChargingReturn(level.starterCode, level.functionName)
        if (!Array.isArray(expected) || trial.issue || trial.passed || trial.actual === undefined
          || !valuesEqual(trial.actual, expected.slice(0, 1)) || !trial.steps.some(step => step.file === 'helper' && step.kind === 'return')
          || repaired === undefined || !runAlgorithm(level, repaired, undefined, course).won) {
          errors.push({ path: path + '/starterCode', code: 'charging-challenge',
            message: 'The trial should use the charging helper and return after the first row. Moving return outside the outer loop should pass all cases.' })
        }
      }
      return errors
    }
    case 'circuit': {
      const errors = level.cases.flatMap((scenario, index) => {
        if (!scenario.goal || (scenario.solution && circuitMeetsGoal(scenario, scenario.solution, level.mode))) return []
        return [{ path: path + '/cases/' + index + '/solution', code: 'circuit-solution',
          message: 'The reference setting does not meet the circuit goal.' }]
      })
      summary.totalCases = level.cases.length
      summary.passedCases = level.cases.length - errors.length
      return errors
    }
    case 'breadboard': {
      const sketch = breadboardProgram(level, catalog)
      const passed = breadboardWorks(level.board.mode, level.board.solutionWires, sketch,
        level.board.solutionParts ?? level.board.initialParts)
      const errors = passed ? [] : [{ path: path + '/board/solutionWires', code: 'breadboard-wiring',
        message: 'The reference wiring must control the external LED in both switch positions.' }]
      const faults = level.board.faults ?? []
      summary.totalCases = 1 + faults.length
      if (sketch && faults.length) {
        const program = buildUnoProgram(sketch)
        faults.forEach((fault, index) => {
          const { parts, wires } = breadboardFaultBuild(level, fault)
          let state = powerOnUno()
          while (!state.loops) state = stepBreadboardUno(program, state, wires, true, parts)
          const reading = readBreadboard('call-lamp', wires, true, state, parts)
          if (reading.ledOn || reading.fault === 'short' || reading.fault === 'unprotected') {
            errors.push({ path: path + '/board/faults/' + index, code: 'breadboard-fault',
              message: 'On this repair ticket the external lamp must stay dark when pressed, without triggering supply protection.' })
          }
        })
      }
      summary.passedCases = sketch || !faults.length ? summary.totalCases - errors.length : 0
      return errors
    }
    case 'arduino': {
      const passed = verifyArduinoSketch(level.sketch)
      summary.totalCases = 1
      summary.passedCases = Number(passed)
      return passed ? [] : [{ path: path + '/sketch', code: 'arduino-sketch',
        message: 'The sketch must run with the available controls and reach its target.' }]
    }
    case 'machine': {
      const results = level.cases.map((_, index) => runMachine(level, level.solutionCode ?? level.starterCode, index))
      const passedCases = results.filter(result => result.won).length
      const failed = results.find(result => !result.won)
      return record({ won: !failed, passedCases, totalCases: results.length, issue: failed?.issue }, level.solutionCode === undefined ? '/starterCode' : '/solutionCode')
    }
    case 'replay': {
      if (level.mode === 'ai') {
        return verifyAiLevel(level.example).map(message => ({ path: path + '/example/examplePrompts', code: 'ai-examples', message }))
      }
      const errors: Issue[] = []
      for (const [index, example] of level.examples.entries()) {
        const grid: GridLevel = { ...level, ...example.scenario, kind: 'grid', cards: [], solutionCards: [] }
        const result = runProgram(grid, example.source)
        if (!result.won || !result.frames.length) {
          errors.push({ path: path + '/examples/' + index + '/source', code: result.issue?.code ?? 'demo-frames',
            message: 'The demonstration must complete its objective and produce replay frames.' })
        }
      }
      summary.totalCases = level.examples.length
      summary.passedCases = level.examples.length - errors.length
      return errors
    }
    default:
      return []
  }
}

const args = process.argv.slice(2)
const jsonRequested = args.includes('--json')
const structureOnly = args.includes('--structure-only')
const filenames = args.filter(arg => !arg.startsWith('-'))
const unknownFlags = args.filter(arg => arg.startsWith('-') && arg !== '--json' && arg !== '--structure-only')
const issues: Issue[] = []
const levels: Check[] = []

async function verifyDataReferences(checks: { level: DataLevel; summary: Check }[]): Promise<Issue[]> {
  if (!checks.length) return []
  try {
    const results = await runDataCourseBatch(checks.map(({ level }) => ({
      steps: level.steps.map(({ operation, input, initial, solution }) => ({ operation, input, params: solution ?? initial })),
    })))
    return checks.flatMap(({ level, summary }, index) => {
      const result = results[index]
      const errors: Issue[] = []
      let passed = 0
      for (const [stepIndex, step] of level.steps.entries()) {
        const output = result?.steps[stepIndex]?.output
        if (output && (!step.goal || dataMeetsGoal(output, step.goal))) passed++
        else errors.push({ path: summary.path + '/steps/' + stepIndex + (step.goal ? '/solution' : '/initial'),
          code: 'data-reference', message: 'The reference step did not produce the expected result table.' })
      }
      summary.passedCases = passed
      summary.totalCases = level.steps.length
      return errors
    })
  } catch {
    return [{ path: checks[0].summary.path, code: 'data-runner',
      message: 'Could not run the data references. Run npm run labs:setup first or use --structure-only to check the configuration.' }]
  }
}

async function verifyVisionReferences(checks: { level: VisionLevel; summary: Check }[]): Promise<Issue[]> {
  const cases = checks.flatMap(({ level, summary }) => {
    summary.totalCases = level.cases.length
    summary.passedCases = 0
    return level.cases.map((entry, index) => ({ mode: level.mode, entry, index, summary }))
  })
  if (!cases.length) return []
  try {
    const results = await runVisionCourseBatch(cases.map(({ mode, entry }) => ({
      mode, image: entry.image, params: entry.solution ?? entry.initial, action: 'run',
    })))
    return cases.flatMap(({ entry, index, summary }, caseIndex) => {
      const result = results[caseIndex]
      if (result?.frames.length && (!entry.goal || visionMeetsGoal(result, entry.goal))) {
        summary.passedCases = (summary.passedCases ?? 0) + 1
        return []
      }
      return [{ path: summary.path + '/cases/' + index + (entry.goal ? '/solution' : '/initial'),
        code: 'vision-reference', message: 'The reference settings did not produce the expected image result.' }]
    })
  } catch {
    return [{ path: cases[0].summary.path, code: 'vision-runner',
      message: 'Could not run the vision references. Run npm run labs:setup first or use --structure-only to check the configuration.' }]
  }
}

if (filenames.length > 1 || unknownFlags.length) {
  issues.push({ path: 'command', code: 'usage', message: 'Usage: npm run --silent levels:check -- [file] [--json] [--structure-only]' })
} else {
  const file = filenames[0]
  const scan = file ? await readLevelFile(resolve(file), file) : await scanLevels()
  issues.push(...scan.issues)
  const needsCourse = file && scan.entries.some(({ level }) => level.prerequisites?.length || shortCrossing(level)
    || (level.kind === 'breadboard' && (level.board.programId || level.board.carryFrom))
    || ((level.kind === 'algorithm' || level.kind === 'arena' || level.kind === 'grid') && level.helpers?.length))
  const catalog = (needsCourse ? (await scanLevels()).entries : scan.entries).map(({ level }) => level)
  const dataChecks: { level: DataLevel; summary: Check }[] = []
  const visionChecks: { level: VisionLevel; summary: Check }[] = []
  for (const { source, level } of scan.entries) {
    if (file) {
      const references = [...prerequisiteIssues(level, catalog), ...breadboardProgramIssues(level, catalog), ...shortChallengeLinkIssues(level, catalog)]
      issues.push(...references.map(issue => ({ ...issue, path: source + issue.path })))
    }
    const summary: Check = { path: source, id: level.id, kind: level.kind }
    levels.push(summary)
    if (structureOnly) continue
    if (level.kind === 'data') {
      dataChecks.push({ level, summary })
      continue
    }
    if (level.kind === 'vision') {
      visionChecks.push({ level, summary })
      continue
    }
    try {
      issues.push(...verifyReference(level, summary, catalog))
    } catch {
      issues.push({ path: source, code: 'solution', message: 'Could not build or run the reference program.' })
    }
  }
  issues.push(...await verifyDataReferences(dataChecks))
  issues.push(...await verifyVisionReferences(visionChecks))
  if (!levels.length && !issues.length) {
    issues.push({ path: 'levels/', code: 'empty', message: 'No JSON levels were found.' })
  }
}

if (jsonRequested) {
  console.log(JSON.stringify({ ok: !issues.length, levels, issues }, null, 2))
} else {
  for (const check of levels) {
    if (issues.some(issue => issue.path === check.path || issue.path.startsWith(check.path + '/'))) continue
    const scenarios = check.totalCases ? ' (' + check.totalCases + (check.totalCases === 1 ? ' scenario)' : ' scenarios)') : ''
    console.log('OK ' + check.path + scenarios)
  }
  for (const issue of issues) console.error(issue.path + ' [' + issue.code + '] ' + issue.message)
}
process.exitCode = issues.length ? 1 : 0
