import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ModuleLesson, ProgramWalkthrough } from '../shared/programWalkthrough'
import { runModuleLesson } from './programModuleLesson'
import { runProgramWalkthrough } from './programWalkthrough'

const moduleLesson: ModuleLesson = {
  moduleName: 'algorithms',
  source: 'def top_up(amount):\n    new_charge = amount + 3\n    return new_charge',
  functionName: 'top_up',
  parameter: 'amount',
  resultVariable: 'result',
  increment: 3,
}
const execution: ProgramWalkthrough = {
  source: 'from algorithms import top_up\ncharge = scan()\nresult = top_up(charge)\nsay(str(result))',
  cases: [],
  moduleLesson,
}

test('a module lesson traces import, argument transfer, and returning to the calling line across files', () => {
  const run = runModuleLesson(execution, 2)
  assert.ok(run)
  assert.equal(run.result, 5)
  assert.equal(run.output, '5')
  assert.deepEqual(run.steps.map(({ kind, file, line, value }) => [kind, file, line, value]), [
    ['define', 'module', 1, undefined],
    ['import', 'main', 1, undefined],
    ['input', 'main', 2, 2],
    ['call', 'main', 3, 2],
    ['calculate', 'module', 2, 5],
    ['return', 'module', 3, 5],
    ['store', 'main', 3, 5],
    ['output', 'main', 4, 5],
  ])
  for (const { file, line, code } of run.steps) {
    assert.equal(code, (file === 'module' ? moduleLesson.source : execution.source).split('\n')[line - 1])
  }
  const raw = runProgramWalkthrough(execution.source, 2, {
    modules: { algorithms: moduleLesson.source },
    traceModules: true,
  })
  const [, , imported, , called, , returned] = raw.frames
  assert.equal(imported.stack.length, 1)
  assert.deepEqual(imported.stack[0].values, [])
  assert.equal(called.sourceName, 'main.py')
  assert.deepEqual(called.stack[1].values, [{ name: 'amount', value: 2, parameter: true }])
  assert.equal(returned.sourceName, 'algorithms.py')
  assert.equal(returned.resumeSourceName, 'main.py')
  assert.equal(returned.resumeLine, called.line)
  assert.deepEqual(returned.stack[0].values, [{ name: 'charge', value: 2 }])
})

test('a module lesson follows actual module code and supports zero input and separate line offsets', () => {
  const changed = {
    ...execution,
    source: '# Run the main program\n' + execution.source,
    moduleLesson: { ...moduleLesson, source: '# Charging helpers\r\n' + moduleLesson.source.replace('+ 3', '+ 5') },
  }
  const run = runModuleLesson(changed, 0)
  assert.equal(run?.result, 5)
  assert.equal(run?.steps.find(step => step.kind === 'return')?.line, 4)
  assert.equal(run?.steps.find(step => step.kind === 'store')?.line, 4)
  assert.equal(run?.steps.find(step => step.kind === 'call')?.value, 0)
  assert.equal(runModuleLesson({ ...execution, source: execution.source.replace('top_up(charge)', 'charge + 3') }, 0), undefined)
  assert.equal(runModuleLesson({ ...execution, source: execution.source.replace('str(result)', 'str(charge)') }, 0), undefined)
})

test('module imports and extra walkthrough traces stay opt-in and existing import rules still apply', () => {
  const modules = { algorithms: moduleLesson.source }
  assert.equal(runProgramWalkthrough(execution.source, 0).issue?.code, 'unknownName')
  const normal = runProgramWalkthrough(execution.source, 0, { modules })
  assert.deepEqual(normal.output, ['3'])
  assert.ok(normal.frames.every(frame => frame.kind !== 'import' && !Object.hasOwn(frame, 'sourceName')))
  const missing = execution.source.replace('from algorithms import', 'from my_algorithms import')
  assert.equal(runProgramWalkthrough(missing, 0, { modules, traceModules: true }).issue?.code, 'unknownName')
  const fileSystem = execution.source.replace('from algorithms import', 'from pathlib import')
  assert.equal(runProgramWalkthrough(fileSystem, 0, { modules, traceModules: true }).issue?.code, 'unsupported')
  const topLevelEffect = { algorithms: 'say("loading")\n' + moduleLesson.source }
  assert.equal(runProgramWalkthrough(execution.source, 0, { modules: topLevelEffect, traceModules: true }).issue?.code, 'unsupported')
})
