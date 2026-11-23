import { programSourceLines, type ProgramWalkthrough, type ProgramWalkthroughFrame, type WalkthroughScope } from '../shared/programWalkthrough'
import { runProgramWalkthrough } from './programWalkthrough'

export type ModuleLessonStep = {
  kind: 'define' | 'import' | 'input' | 'call' | 'calculate' | 'return' | 'store' | 'output'
  file: 'main' | 'module'
  line: number
  code: string
  value?: number
}

export type ModuleLessonRun = { steps: ModuleLessonStep[]; result: number; output: string }

function binding(scope: WalkthroughScope | undefined, name: string) {
  return scope?.values.find(value => value.name === name)
}

export function runModuleLesson(execution: ProgramWalkthrough, input: number): ModuleLessonRun | undefined {
  if (!execution.moduleLesson) return undefined
  const { moduleName, source, functionName, parameter, resultVariable } = execution.moduleLesson
  const moduleLines = programSourceLines(source)
  if (source.length > 2_000 || moduleLines.length > 30) return undefined

  const { frames, output, issue } = runProgramWalkthrough(execution.source, input, {
    modules: { [moduleName]: moduleLines.join('\n') }, traceModules: true,
  })
  if (issue || frames.length !== 10 || output.length !== 1) return undefined
  const [start, defined, imported, read, called, calculated, returned, stored, displayed, end] = frames
  if (start.kind !== 'start' || end.kind !== 'end' || defined.name !== functionName
    || imported.moduleName !== moduleName || imported.name !== functionName
    || called.name !== functionName || returned.name !== functionName
    || returned.resumeSourceName !== 'main.py' || returned.resumeLine !== called.line || stored.line !== called.line) return undefined

  const inputVariable = read.name
  const result = returned.value
  if (!inputVariable || inputVariable === resultVariable || read.value !== input || typeof result !== 'number'
    || !Number.isSafeInteger(result) || calculated.value !== result || stored.name !== resultVariable
    || stored.value !== result || displayed.value !== String(result) || output[0] !== displayed.value) return undefined

  const [caller, local] = called.stack
  const amount = binding(local, parameter)
  if (called.stack.length !== 2 || local?.name !== functionName || amount?.parameter !== true || amount.value !== input
    || calculated.stack[1]?.id !== local.id || binding(caller, inputVariable)?.value !== input
    || returned.stack.length !== 1 || returned.stack[0]?.id !== caller.id
    || binding(returned.stack[0], resultVariable) || binding(end.stack[0], inputVariable)?.value !== input
    || binding(end.stack[0], resultVariable)?.value !== result) return undefined

  const files = {
    main: { name: 'main.py', lines: programSourceLines(execution.source) },
    module: { name: moduleName + '.py', lines: moduleLines },
  }
  const sequence: [ModuleLessonStep['kind'], ProgramWalkthroughFrame['kind'], ModuleLessonStep['file'], number?][] = [
    ['define', 'define', 'module'],
    ['import', 'import', 'main'],
    ['input', 'assign', 'main', input],
    ['call', 'call', 'main', input],
    ['calculate', 'assign', 'module', result],
    ['return', 'return', 'module', result],
    ['store', 'assign', 'main', result],
    ['output', 'output', 'main', result],
  ]
  const steps: ModuleLessonStep[] = []
  for (const [index, [kind, traceKind, file, value]] of sequence.entries()) {
    const frame = frames[index + 1]
    const { line } = frame
    if (frame.kind !== traceKind || frame.sourceName !== files[file].name || line === undefined) return undefined
    const code = files[file].lines[line - 1]
    if (code === undefined) return undefined
    steps.push({ kind, file, line, code, ...(value !== undefined && { value }) })
  }
  return { steps, result, output: output[0] }
}
