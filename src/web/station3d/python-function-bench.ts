import type { Json, Locale, PythonFlowEvent } from '../../shared/types'
import { pythonValue } from '../pythonValue'
import type { ModelBuilder, TeachingModelTools } from './teaching-model-types'
import type { Kit } from './workshop'

type CallBench = {
  locale: Locale
  name: string
  args: Json[]
  argumentsOmitted?: boolean
  caseIndex: number
  caseCount: number
  actual?: Json
  stopped: boolean
  pending: boolean
  line?: number
  sourceName?: string
  flow?: PythonFlowEvent
}

const base = '#354e57', ivory = '#c1cabc', golden = '#e4aa64', green = '#8ddabd'

function valueDock(kit: Kit, tools: TeachingModelTools, value: Json, x: number, z: number, outgoing: boolean) {
  const collection = value !== null && typeof value === 'object'
  const tint = outgoing ? green : golden
  kit.casing([x, .36, z], [1.67, .13, .87], base, .04)
  if (collection) {
    const length = Object.keys(value).length
    kit.casing([x, .57, z], [1.51, .27, .74], '#66888a', .04)
    for (let i = 0; i < Math.min(5, length); i++) {
      kit.box([x - .54 + i * .27, .76, z], [.21, .15, .48], tint)
    }
  } else {
    kit.cylinder([x, .52, z], .32, .36, .23, '#68868a')
    kit.cylinder([x, .70, z], .25, .30, .16, tint)
  }
  const text = pythonValue(value)
  tools.label(text.length > 19 ? text.slice(0, 18) + '…' : text, [x, .96, z], .21)
}

export const buildFunctionBench: ModelBuilder<CallBench> = (state, kit, tools) => {
  const { args, locale, line, stopped, pending, sourceName, flow } = state
  const actual = flow?.kind === 'return' ? flow.value : state.actual
  const zh = locale === 'zh'
  const depth = Math.max(3.10, args.length * 1.02 + 1.1)
  kit.casing([0, .12, 0], [6.64, .24, depth], '#496b6c', .08)
  const inputX = -2.24, outputX = 2.19, rim = -depth / 2 + .17
  tools.label(zh ? '传入' : 'Arguments', [inputX, .36, rim], .23)
  if (state.argumentsOmitted) tools.label('…', [inputX, .57, .15], .23)
  args.forEach((value, index) => {
    const z = (index - (args.length - 1) / 2) * 1.02 + .15
    valueDock(kit, tools, value, inputX, z, false)
    kit.rod([inputX + .84, .31, z], [-.98, .31, z], .045, golden)
  })
  if (args.length > 1) {
    const limit = (args.length - 1) * .51
    kit.rod([-.98, .31, .15 - limit], [-.98, .31, .15 + limit], .045, golden)
  }
  kit.rod([-.98, .31, .15], [-.65, .31, .15], .045, golden)
  kit.casing([0, .55, .08], [1.42, .64, 1.42], ivory, .08)
  kit.casing([0, .95, .08], [1.19, .25, 1.05], base, .04)
  kit.box([0, 1.09, .08], [.99, .047, .69], stopped ? '#c17a62' : '#426b69')
  tools.label((flow?.functionName ?? state.name) + '()', [0, 1.42, -.24], .22)
  const chip = stopped ? (zh ? '出错' : 'Error') : line ? (zh ? '第 ' + line + ' 行' : 'Line ' + line)
    : pending ? (zh ? '运行中' : 'Running') : actual !== undefined ? 'return' : (zh ? '待调用' : 'Ready')
  const operation = flow?.kind === 'if' || flow?.kind === 'for' || flow?.kind === 'while'
    ? (flow.name === 'else' ? 'else' : flow.kind + ' · ' + (flow.condition ? '✓' : '×')) : flow?.kind
  tools.label(operation ?? chip, [0, 1.14, .36], .23)
  if (line && sourceName && sourceName !== 'main.py') tools.label(sourceName, [0, .38, .92], .17)
  const front = depth / 2 - .26
  tools.label((zh ? '用例 ' : 'Case ') + (state.caseIndex + 1), [0, .37, front], .18)
  for (const [offset, glyph] of [[-1, '‹'], [1, '›']] as const) {
    const index = state.caseIndex + offset
    const enabled = index >= 0 && index < state.caseCount
    kit.casing([offset * .82, .34, front], [.43, .16, .37], enabled ? golden : base, .035)
    tools.label(glyph, [offset * .82, .44, front], .21)
    if (enabled) tools.pick(String(index), [offset * .82, .37, front], [.52, .30, .44])
  }
  kit.rod([.73, .31, .15], [outputX - .82, .31, .15], .048, actual === undefined ? '#516d70' : green)
  tools.label(zh ? '交回' : 'Return value', [outputX, .36, rim], .23)
  if (actual === undefined) {
    kit.casing([outputX, .34, .15], [1.67, .12, .87], base, .04)
    tools.label('—', [outputX, .51, .15], .28)
  } else valueDock(kit, tools, actual, outputX, .15, true)
}
