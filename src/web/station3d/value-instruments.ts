import type { Locale } from '../../shared/types'
import type { Kit } from './workshop'
import type { ModelBuilder, TeachingModelTools } from './teaching-model-types'

type Lane = { charge?: string; result?: string; pending?: string; sum?: string; output?: string }
export type AssignmentModel = {
  locale: Locale; input: number; inputName: string; resultName: string
  stage: 'start' | 'read' | 'evaluate' | 'store' | 'output' | 'predict'
  lanes: [Lane, Lane]
}
export type AxisModel = {
  locale: Locale; threshold: number; through: number
  samples: { input: number; value?: boolean }[]
}
type Pick = 'charge' | 'door' | 'and' | 'route'
export type GateModel = {
  locale: Locale; fork: boolean; threshold: number; charge?: number; enough?: boolean
  door?: boolean; decision?: boolean; selected?: 'if' | 'else'; action?: string; nextPick?: Pick
}

const steel = '#76959a', dark = '#213e48', enamel = '#b4c9b8', brass = '#d8a75f'
const green = '#93efb1', amber = '#ffd080', red = '#ef9172', dim = '#496365'
const truth = (value: boolean) => value ? 'True' : 'False'
const light = (value?: boolean) => value === undefined ? dim : value ? green : red

function bench(kit: Kit, x: number, width: number, depth: number) {
  kit.casing([x, .12, 0], [width, .24, depth], dark, .08)
  kit.casing([x, .26, 0], [width - .05, .085, depth - .06], steel, .035)
}

function cell(kit: Kit, x: number, z: number, tint: string) {
  kit.cylinder([x, .36, z], .36, .38, .12, dark)
  kit.cylinder([x, .67, z], .245, .26, .56, tint)
  kit.cylinder([x, .97, z], .252, .252, .08, dark)
  kit.cylinder([x, 1.041, z], .091, .11, .075, brass)
}

// A value is a removable token. An empty cradle exposes its dark socket.
function cradle(kit: Kit, tools: TeachingModelTools, x: number, z: number, name: string, value?: string, written = false) {
  kit.casing([x, .38, z], [.98, .15, .82], dark, .05)
  for (const edge of [-.43, .43]) kit.box([x + edge, .56, z], [.09, .33, .74], enamel)
  kit.box([x, .49, z - .33], [.85, .21, .09], enamel)
  if (value !== undefined) kit.casing([x, .61, z], [.69, .32, .56], written ? green : '#91c2bb', .045)
  const label = name + (value === undefined ? ' · —' : ' = ' + value)
  tools.label(label, [x, value === undefined ? .55 : .84, z + .12], .19)
}

export const buildAssignment: ModelBuilder<AssignmentModel> = (state, kit, tools) => {
  const { locale, input, inputName, resultName, stage, lanes } = state
  const zh = locale === 'zh'
  if (stage === 'start' || stage === 'read') {
    bench(kit, 0, 3.35, 1.67)
    cell(kit, -.86, 0, brass)
    tools.label((zh ? '输入 ' : 'Input ') + input, [-.86, 1.24, 0], .23)
    kit.rod([-.54, .36, 0], [.32, .36, 0], .045, stage === 'read' ? green : dim)
    cradle(kit, tools, .84, 0, inputName, lanes[0].charge, stage === 'read')
    if (stage === 'start') tools.pick('read', [-.86, .73, 0], [.82, 1, .83])
    return
  }
  lanes.forEach((lane, index) => {
    const fresh = index === 0, x = fresh ? -1.56 : 1.56
    bench(kit, x, 2.92, 2.15)
    const source = fresh ? x - .65 : x
    const target = fresh ? x + .65 : x
    const written = stage === 'store' || stage === 'output'
    cradle(kit, tools, source, .40, inputName, lane.charge, !fresh && written)
    if (fresh) cradle(kit, tools, target, .40, resultName, lane.result, written)
    // The rear calculation platter holds the RHS before anything is written.
    kit.cylinder([x, .39, -.55], .35, .41, .18, dark)
    kit.ring([x, .495, -.55], .27, .022, lane.pending === undefined ? steel : amber)
    if (lane.pending !== undefined) {
      kit.casing([x, .64, -.55], [.55, .24, .43], brass, .042)
      const expression = lane.sum ? lane.sum + ' → ' + lane.pending : (zh ? '右边 ' : 'RHS ') + lane.pending
      tools.label(expression, [x, .90, -.55], .21)
      tools.pick('store', [target, .58, .40], [1.12, .82, .96])
    } else if (lane.output !== undefined) {
      kit.casing([x, .76, -.55], [.83, .51, .15], dark, .035)
      kit.box([x, .76, -.461], [.70, .37, .018], '#59877d')
      tools.label((zh ? '输出 ' : 'Out ') + lane.output, [x, .79, -.44], .20)
    }
    kit.rod([x, .352, -.44], [target, .352, .24], .041, written ? green : dim)
    tools.label(fresh ? (zh ? '新变量' : 'New variable') : (zh ? '写回原变量' : 'Write back'), [x, .31, 1.04], .22)
  })
  if (stage === 'predict') tools.label((zh ? '输入 ' : 'Input ') + input, [0, .94, -.99], .19)
}

export const buildComparison: ModelBuilder<AxisModel> = ({ locale, threshold, samples, through }, kit, tools) => {
  const values = samples.map(sample => sample.input)
  const min = Math.min(threshold, ...values), max = Math.max(threshold, ...values)
  const width = Math.max(3.60, Math.min(7.30, samples.length * 1.43))
  const xOf = (v: number) => max === min ? 0 : (v - min) / (max - min) * width - width / 2
  bench(kit, 0, width + 1.10, 1.89)
  kit.rod([-width / 2 - .26, .40, .42], [width / 2 + .26, .40, .42], .043, brass)
  const boundary = xOf(threshold)
  kit.box([boundary, .36, 0], [.08, .08, 1.55], amber)
  tools.label((locale === 'zh' ? '门槛 ≥ ' : 'Minimum ≥ ') + threshold, [boundary, .53, .80], .21)
  samples.forEach(({ input, value }, index) => {
    const x = xOf(input)
    cell(kit, x, -.17, index === through ? brass : '#87b6b5')
    kit.ring([x, .426, -.17], .349, .037, light(value), 'glow')
    tools.label(String(input) + (value === undefined ? '' : ' · ' + truth(value)), [x, 1.25, -.17], .24)
    if (index === through + 1) tools.pick('charge', [x, .75, -.17], [.73, 1.07, .78])
  })
}

function sprout(kit: Kit, x: number, z: number) {
  for (const side of [-1, 1]) kit.casing([x + side * .13, .41, z], [.16, .15, .25], dark, .034)
  kit.casing([x, .62, z], [.40, .37, .32], '#85baa9', .064)
  kit.casing([x, .918, z], [.53, .35, .40], enamel, .067)
  kit.box([x, .93, z + .20], [.40, .17, .033], dark)
  for (const dx of [-.105, .105]) kit.box([x + dx, .936, z + .221], [.063, .070, .025], green, undefined, 'glow')
  kit.rod([x, 1.09, z], [x + .11, 1.23, z], .028, green)
  kit.casing([x + .12, 1.22, z], [.21, .078, .12], '#90c987', .032, [0, 0, .32])
}

export const buildGate: ModelBuilder<GateModel> = (state, kit, tools) => {
  const { locale, threshold, charge, enough, door, decision, fork, selected, action, nextPick } = state
  const zh = locale === 'zh'
  const z = fork ? -.56 : 0
  bench(kit, 0, 5.95, fork ? 3.5 : 1.92)
  // Independent inputs feed the AND indicator; the boom lifts only when the door has been read open.
  cell(kit, -2.12, z, enough === undefined ? enamel : light(enough))
  tools.label((charge ?? '—') + ' ≥ ' + threshold + (enough === undefined ? '' : ' · ' + truth(enough)), [-2.12, 1.28, z], .22)
  if (nextPick === 'charge') tools.pick('charge', [-2.12, .75, z], [.84, 1.25, .84])
  kit.casing([-.56, .40, z], [1.27, .15, .67], dark, .04)
  kit.box([-1.03, .66, z], [.18, .49, .25], brass)
  kit.box([-.09, .61, z], [.13, .39, .22], steel)
  if (door !== undefined) {
    kit.rod([-1.03, .87, z], door ? [-.92, 1.55, z] : [-.09, .87, z], .075, light(door))
  }
  const doorName = zh ? '安全门' : 'Door'
  tools.label(doorName + ' · ' + (door === undefined ? '?' : (door ? (zh ? '开' : 'Open') : (zh ? '关' : 'Closed'))),
    [-.55, .57, z + .41], .20)
  if (nextPick === 'door') tools.pick('door', [-.56, .84, z], [1.35, 1.12, .83])
  const resultX = 1.81
  for (const [source, wireZ, signal] of [[-2.12, z - .59, enough], [-.56, z + .33, door]] as const) {
    kit.rod([source, .323, z], [source, .323, wireZ], .029, light(signal))
    kit.rod([source, .323, wireZ], [resultX, .323, wireZ], .029, light(signal))
    kit.rod([resultX, .323, wireZ], [resultX, .323, z], .029, light(signal))
  }
  kit.casing([resultX, .46, z], [.91, .28, .75], dark, .06)
  kit.cylinder([resultX, .66, z], .22, .26, .12, light(decision), undefined, 'glow')
  tools.label('and' + (decision === undefined ? '' : ' · ' + truth(decision)), [resultX, .93, z], .24)
  if (nextPick === 'and') tools.pick('and', [resultX, .60, z], [1.03, .83, .84])
  if (!fork) return

  // Choosing a route lights it first. Executing its body then moves Sprout.
  for (const path of ['if', 'else'] as const) {
    const end = path === 'if' ? -1.84 : 1.84
    const chosen = path === selected
    const tint = chosen ? amber : dim
    kit.rod([0, .34, .41], [end, .34, 1.07], .074, tint)
    kit.casing([end, .345, 1.17], [.91, .085, .69], tint, .035)
    tools.label(path, [end, .47, 1.59], .22)
    if (chosen && nextPick === 'route') tools.pick('route', [end, .51, 1.20], [.98, .78, .96])
  }
  const moved = selected !== undefined && action !== undefined
  const position = moved ? (selected === 'if' ? -1.84 : 1.84) : 0
  sprout(kit, position, moved ? 1.15 : .48)
  if (moved) tools.label(action, [position, 1.42, 1.15], .22)
}
