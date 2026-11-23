import type { ModuleLessonStep } from '../../engine/programModuleLesson'
import type { ProgramWalkthroughFrame } from '../../shared/programWalkthrough'
import type { Locale } from '../../shared/types'
import { pythonValue } from '../pythonValue'
import type { ModelBuilder } from './teaching-model-types'
import type { Kit } from './workshop'

const ink = '#273e49', enamel = '#99b9b0', amber = '#ffca7c', mint = '#9be9bb', brass = '#c29b64'

function base(kit: Kit, width: number, depth: number) {
  kit.casing([0, .11, 0], [width, .22, depth], ink, .07)
  kit.casing([0, .24, 0], [width - .04, .10, depth - .04], '#789697', .04)
}

type CupState = { cups: { address: number; name?: string; value?: number }[]; selected?: number }

export const buildCupShelf: ModelBuilder<CupState> = ({ cups, selected }, kit, tools) => {
  const columns = Math.min(4, Math.max(1, cups.length))
  const rows = Math.max(1, Math.ceil(cups.length / columns))
  base(kit, columns * 1.55 + .30, rows * 1.55 + .18)
  cups.forEach(({ address, name, value }, index) => {
    const x = (index % columns - (columns - 1) / 2) * 1.55
    const z = (Math.floor(index / columns) - (rows - 1) / 2) * 1.55
    const rim = selected === address ? amber : enamel
    kit.cylinder([x, .34, z], .49, .52, .09, ink)
    kit.cylinder([x, .42, z], .38, .33, .09, '#507577')
    // An open rim and thin wire sides keep the paper card visible inside the cup.
    kit.ring([x, .94, z], .43, .037, rim)
    for (const angle of [.0, 1.57, 3.14, 4.71]) {
      const dx = Math.cos(angle), dz = Math.sin(angle)
      kit.rod([x + .33 * dx, .44, z + .33 * dz], [x + .43 * dx, .94, z + .43 * dz], .022, enamel)
    }
    if (value !== undefined) {
      kit.casing([x, .78, z], [.50, .55, .09], '#e9c284', .033)
      tools.label(String(value), [x, .85, z + .06], .24)
    }
    if (name) tools.label(name, [x, 1.24, z - .21], .19)
    tools.label('@' + address, [x, .35, z + .60], .19)
    tools.pick(String(address), [x, .69, z], [1.12, .85, 1.34])
  })
}

type StackState = { frame?: ProgramWalkthroughFrame; input: number; locale: Locale }

export const buildCallStack: ModelBuilder<StackState> = ({ frame, input, locale }, kit, tools) => {
  const stack = frame?.stack ?? []
  const zh = locale === 'zh'
  const slots = Math.max(2, ...stack.map(entry => entry.values.length))
  const trayWidth = 1.8 + slots * 1.47
  const depth = Math.max(2.65, stack.length * 1.56 + 1.04)
  base(kit, trayWidth + 2.02, depth)
  const portX = -(trayWidth + .63) / 2
  kit.cylinder([portX, .36, .20], .38, .42, .12, ink)
  kit.cylinder([portX, .70, .20], .25, .27, .57, '#8ccb9f')
  kit.cylinder([portX, 1.01, .20], .13, .13, .07, brass)
  tools.label(String(input), [portX, .76, .47], .22)
  tools.pick('input', [portX, .70, .23], [.83, .84, .90])
  const output = frame?.output.at(-1)
  kit.casing([portX, .59, -.85], [.91, .60, .17], ink, .045)
  kit.box([portX, .60, -.75], [.80, .45, .025], output === undefined ? '#355354' : '#5e9177')
  if (output !== undefined) tools.label(output, [portX, .63, -.72], .21)

  stack.forEach((entry, i) => {
    const z = (stack.length - 1) * .78 - i * 1.56
    const y = .39 + i * .45
    const active = i === stack.length - 1 && frame?.kind !== 'end'
    const left = -trayWidth / 2 + .63
    kit.casing([.63, y, z], [trayWidth, .19, 1.31], active ? '#558c82' : '#465e69', .06)
    for (const x of [left + .16, left + trayWidth - .16]) {
      kit.cylinder([x, (y + .27) / 2, z - .42], .07, .09, y - .24, brass)
    }
    kit.box([.63, y + .02, z + .66], [trayWidth - .14, .048, .024], active ? mint : enamel)
    const name = entry.name === '<module>' ? (zh ? '主程序' : 'main') : entry.name + '()'
    tools.label(name, [left + .79, y + .25, z + .10], .235)
    entry.values.forEach((binding, j) => {
      const x = left + 2.36 + j * 1.47
      const current = active && (frame?.kind === 'call' ? binding.parameter : frame?.name === binding.name)
      kit.casing([x, y + .17, z], [1.30, .19, .78], current ? '#c99e57' : '#668a8a', .05)
      const value = pythonValue(binding.value)
      tools.label(binding.name, [x, y + .14, z + .48], .18)
      tools.label(value.length > 14 ? value.slice(0, 13) + '…' : value, [x, y + .39, z - .18], .22)
    })
    if (active) tools.pick('step', [.63, y + .15, z], [trayWidth, .52, 1.29])
  })
  if (frame?.kind === 'call' || frame?.kind === 'return') {
    const returning = frame.kind === 'return'
    const top = stack.length - 1
    const value = returning ? (frame.value === undefined ? '' : pythonValue(frame.value)) :
      stack[top]?.values.filter(binding => binding.parameter).map(binding => pythonValue(binding.value)).join(', ')
    // The bus climbs to a new frame during a call and descends to the resumed frame on return.
    const x = trayWidth / 2 + .69
    const endY = .67 + top * .45, endZ = -top * .78
    const direction = returning ? 1 : -1
    kit.rod([x, endY + direction * .35, endZ - direction * .95], [x, endY, endZ], .038, amber, 'glow')
    for (const dx of [-.11, .11])
      kit.rod([x + dx, endY + direction * .08, endZ - direction * .23], [x, endY, endZ], .030, amber, 'glow')
    const z = depth / 2 - .18
    kit.casing([.52, .38, z - .19], [1.65, .18, .53], returning ? '#ab8251' : '#528779', .05)
    tools.label(returning ? 'return ' + value : (zh ? '传入 ' : 'Pass ') + value, [.52, .55, z - .10], .21)
  }
}

type FileState = {
  file: string; name: string; parameter: string; resultName: string; steps: ModuleLessonStep[]; locale: Locale
}

export const buildFileLink: ModelBuilder<FileState> = ({ file, name, parameter, resultName, steps, locale }, kit, tools) => {
  const step = steps.at(-1)
  const zh = locale === 'zh'
  const given = steps.find(entry => entry.kind === 'input')
  const imported = steps.some(entry => entry.kind === 'import')
  const result = steps.find(entry => entry.kind === 'store')
  base(kit, 6.65, 2.45)
  for (const [x, side] of [[-1.95, 'main'], [1.95, 'module']] as const) {
    const lit = step?.file === side
    kit.casing([x, .40, -.12], [2.25, .24, 1.76], lit ? '#639986' : '#4b6873', .07)
    // Upright file cartridges, with a tab for the filename and a front data socket.
    kit.casing([x, .86, -.48], [1.96, .75, .31], side === 'main' ? enamel : '#9eabc7', .06)
    kit.casing([x - .43, 1.27, -.48], [.86, .18, .28], side === 'main' ? enamel : '#9eabc7', .04)
    tools.label(side === 'main' ? 'main.py' : file, [x, 1.14, -.24], .245)
    kit.casing([x, .55, .63], [1.80, .12, .35], ink, .04)
  }
  // Import installs a name link. Arguments and returned values travel only on calls.
  kit.rod([-.90, .53, -.56], [.90, .53, -.56], .052, imported ? mint : '#597171')
  if (steps.some(entry => entry.kind === 'define')) tools.label(name + '()', [1.95, .80, .30], .19)
  if (imported) tools.label(name, [-1.92, .83, .27], .18)
  if (step?.kind === 'import') tools.label('← import', [0, .67, -.56], .195)
  if (given) tools.label(result ? resultName + ' = ' + result.value : String(given.value), [-1.95, .66, .84], .205)
  if (step?.kind === 'call') tools.label(parameter + ' = ' + step.value, [1.95, .66, .84], .20)
  if (step?.kind === 'calculate') tools.label((zh ? '算出 ' : 'Computed ') + step.value, [1.95, .66, .84], .20)
  if (step?.kind === 'output') tools.label((zh ? '输出 ' : 'Output ') + step.value, [-1.95, 1.68, -.42], .22)
  const sending = step?.kind === 'call', returning = step?.kind === 'return'
  if (sending || returning) {
    const direction = sending ? 1 : -1
    kit.rod([-.92, .59, .33], [.92, .59, .33], .044, amber)
    for (const dz of [-.15, .15])
      kit.rod([direction * .60, .59, .33 + dz], [direction * .88, .59, .33], .042, amber)
    tools.label((returning ? 'return ' : zh ? '传入 ' : 'Pass ') + step.value, [0, .87, .32], .20)
  }
}

export type VerifiedChargeState = { input: number; output?: string; caller?: { name: string; value?: string }; locale: Locale }

export const buildVerifiedCharge: ModelBuilder<VerifiedChargeState> = ({ input, output, caller, locale }, kit, tools) => {
  const zh = locale === 'zh'
  const items = [{ name: zh ? '输入' : 'Input', value: String(input) },
    ...(caller ? [{ name: caller.name, value: caller.value }] : []),
    { name: caller ? 'return' : zh ? '输出' : 'Output', value: output }]
  base(kit, items.length * 1.60 + .18, 1.75)
  items.forEach(({ name, value }, i) => {
    const x = (i - (items.length - 1) / 2) * 1.60
    kit.casing([x, .40, 0], [1.40, .20, 1.05], '#4b676e', .045)
    if (value !== undefined) {
      kit.casing([x, .73, -.13], [.89, .50, .31], i ? '#82b39f' : '#c3a575', .045)
      tools.label(value, [x, .80, .075], .26)
    }
    tools.label(name, [x, .50, .56], .20)
  })
}
