import { parser } from '@lezer/python'
import type { SyntaxNode } from '@lezer/common'
import type { AlgorithmLevel, AlgorithmResult, PersonalAlgorithms } from '../shared/advanced'
import type { ProgramWalkthroughFrame, WalkthroughScope } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { selectHelpers } from '../shared/courseHelpers'
import { traceAlgorithmCase } from './algorithms'
import { ProgramError } from './python'

const MAX_TRACE_STEPS = 240
const MAX_SOURCE = 12_000

export type ChargingStep = {
  kind: ProgramWalkthroughFrame['kind']
  line: number
  code: string
  file: 'main' | 'helper'
  sourceName: string
  stack: WalkthroughScope[]
  value?: Json
  name?: string
}

export type ChargingTrial = AlgorithmResult['cases'][number] & { steps: ChargingStep[] }

export function runChargingTrial(level: AlgorithmLevel, source: string, caseIndex: number,
  personal: PersonalAlgorithms, course: PersonalAlgorithms): ChargingTrial {
  const files = new Map([['main.py', source.split(/\r\n?|\n/u)]])
  const helpers = level.helpers ?? []
  for (const [moduleName, library] of [['algorithms', course], ['my_algorithms', personal]] as const) {
    for (const [name, helper] of Object.entries(selectHelpers(helpers, library))) {
      if (helper !== undefined) files.set(`${moduleName}.${name}.py`, helper.split(/\r\n?|\n/u))
    }
  }

  const steps: ChargingStep[] = []
  const result = traceAlgorithmCase(level, source, caseIndex, personal, course, frame => {
    const { kind, line, sourceName, stack, value, name } = frame
    if (line === undefined || sourceName === undefined) return
    const code = files.get(sourceName)?.[line - 1]
    if (code === undefined) return
    if (steps.length >= MAX_TRACE_STEPS) throw new ProgramError({ code: 'limit', line })
    steps.push({ kind, line, code, file: sourceName === 'main.py' ? 'main' : 'helper', sourceName, stack, value, name })
  })
  return { ...result, steps }
}

function lastStatement(body: SyntaxNode | null | undefined): SyntaxNode | undefined {
  for (let child = body?.lastChild; child; child = child.prevSibling) {
    if (child.name !== 'Comment' && child.name !== ':') return child
  }
  return undefined
}

function lineIndent(source: string, node: SyntaxNode) {
  const start = source.lastIndexOf('\n', node.from - 1) + 1
  const prefix = source.slice(start, node.from)
  return /^[ \t]+$/u.test(prefix) ? { start, prefix } : undefined
}

export function repairChargingReturn(source: string, functionName: string): string | undefined {
  if (source.length > MAX_SOURCE) return undefined
  const tree = parser.parse(source)
  let valid = true
  tree.iterate({ enter: node => {
    if (node.type.isError) valid = false
  } })
  if (!valid) return undefined
  const definitions = tree.topNode.getChildren('FunctionDefinition').filter(node => {
    const name = node.getChild('VariableName')
    return name && source.slice(name.from, name.to) === functionName
  })
  if (definitions.length !== 1) return undefined

  const outerLoop = lastStatement(definitions[0].getChild('Body'))
  if (outerLoop?.name !== 'ForStatement') return undefined
  const returned = lastStatement(outerLoop.getChild('Body'))
  if (returned?.name !== 'ReturnStatement') return undefined

  const loopIndent = lineIndent(source, outerLoop)
  const returnIndent = lineIndent(source, returned)
  if (!loopIndent || !returnIndent || !returnIndent.prefix.startsWith(loopIndent.prefix)
    || returnIndent.prefix.length <= loopIndent.prefix.length) return undefined
  return source.slice(0, returnIndent.start) + loopIndent.prefix + source.slice(returned.from)
}
