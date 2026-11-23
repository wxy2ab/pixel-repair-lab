import type { ProgramWalkthrough, WalkthroughScope } from '../shared/programWalkthrough'
import { runProgramWalkthrough } from './programWalkthrough'

type FunctionLessonRun = { returned: number; callerValue: number; output: string }

function binding(scope: WalkthroughScope | undefined, name: string) {
  return scope?.values.find(value => value.name === name)
}

export function runFunctionLesson(execution: ProgramWalkthrough, input: number): FunctionLessonRun | undefined {
  if (!execution.functionLesson) return undefined
  const { functionName, parameter, resultVariable } = execution.functionLesson
  const { frames, output, issue } = runProgramWalkthrough(execution.source, input)
  const end = frames.at(-1)
  if (issue || end?.kind !== 'end' || output.length !== 1) return undefined

  const calls = frames.filter(frame => frame.kind === 'call')
  const returns = frames.filter(frame => frame.kind === 'return')
  const [call] = calls
  const [returned] = returns
  if (calls.length !== 1 || returns.length !== 1 || call.name !== functionName || returned.name !== functionName
    || returned.resumeLine !== call.line || typeof returned.value !== 'number') return undefined

  const [caller, local] = call.stack
  const inputBinding = binding(local, parameter)
  if (call.stack.length !== 2 || caller.name !== '<module>' || local.name !== functionName
    || binding(caller, parameter)?.value !== input || !inputBinding?.parameter || inputBinding.value !== input) return undefined

  const callIndex = frames.indexOf(call)
  const returnIndex = frames.indexOf(returned)
  const reading = frames.slice(0, callIndex).findLast(frame =>
    frame.kind === 'assign' && frame.name === parameter && frame.stack[0]?.id === caller.id)
  const calculation = frames.slice(callIndex + 1, returnIndex).findLast(frame =>
    frame.kind === 'assign' && frame.name === parameter && frame.stack[1]?.id === local.id)
  if (reading?.value !== input || calculation?.value !== returned.value || returned.value === input
    || binding(calculation.stack[0], parameter)?.value !== input
    || binding(calculation.stack[1], parameter)?.value !== returned.value) return undefined

  const resumed = returned.stack[0]
  const stored = frames[returnIndex + 1]
  if (returned.stack.length !== 1 || resumed.id !== caller.id || binding(resumed, parameter)?.value !== input
    || binding(resumed, resultVariable) || stored?.kind !== 'assign' || stored.line !== returned.resumeLine
    || stored.name !== resultVariable || stored.value !== returned.value
    || binding(stored.stack[0], resultVariable)?.value !== returned.value
    || !frames.slice(returnIndex + 2).some(frame => frame.kind === 'output')) return undefined

  const finished = end.stack[0]
  const callerValue = binding(finished, parameter)?.value
  if (callerValue !== input || binding(finished, resultVariable)?.value !== returned.value) return undefined
  return { returned: returned.value, callerValue, output: output[0] }
}
