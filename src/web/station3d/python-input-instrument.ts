import type { Locale } from '../../shared/types'
import type { DevicePhase } from '../ProgramDevice'
import type { ProgramInterface } from '../../shared/programWalkthrough'
import type { ModelBuilder } from './teaching-model-types'
import type { Kit } from './workshop'

const base = '#3f5c63', metal = '#a6c2b6', dark = '#223d44', gold = '#efbb69', mint = '#8de3ba'

function worktop(kit: Kit) {
  kit.casing([0, .10, 0], [6.6, .20, 2.20], base, .08)
  kit.box([0, .22, 0], [6.44, .045, 2.07], '#587572')
}

function monitor(kit: Kit, x: number, terminal = false) {
  kit.casing([x, .35, -.22], [1.53, .18, .75], dark, .05)
  kit.box([x, .56, -.38], [.21, .43, .16], metal)
  kit.casing([x, 1.04, -.40], [1.77, .99, .21], '#c7cbb3', .076)
  kit.box([x, 1.04, -.283], [1.56, .78, .035], terminal ? '#153a36' : '#2c515c')
  if (terminal) {
    kit.casing([x, .30, .50], [1.44, .10, .40], dark, .04)
    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) {
      kit.box([x - .53 + i * .18, .369, .40 + j * .15], [.13, .048, .09], i === 6 ? gold : metal)
    }
  }
}

type ChargerState = { input: number; output?: string; step: 'input' | 'process' | 'output'; locale: Locale }

export const buildCharger: ModelBuilder<ChargerState> = ({ input, output, step, locale }, kit, tools) => {
  worktop(kit)
  const zh = locale === 'zh'
  kit.cylinder([-2.12, .34, .06], .48, .60, .18, dark)
  kit.cylinder([-2.12, .86, .06], .345, .345, .91, '#91c09c')
  kit.cylinder([-2.12, 1.34, .06], .15, .15, .09, metal)
  tools.label(String(input), [-2.12, .91, .41], .32)
  kit.casing([0, .39, 0], [1.68, .28, 1.14], dark, .07)
  kit.cylinder([0, .83, .01], .24, .24, 1.04, metal, [0, 0, Math.PI / 2])
  for (let i = -2; i <= 2; i++) {
    kit.cylinder([i * .17, .83, .01], .32, .32, .09, step === 'process' ? gold : '#ae8260', [0, 0, Math.PI / 2])
  }
  monitor(kit, 2.08)
  for (const [left, right, active] of [[-1.63, -.82, step === 'process'], [.82, 1.60, step === 'output']] as const) {
    kit.rod([left, .31, .05], [right, .31, .05], .052, active ? mint : dark, active ? 'glow' : 'metal')
  }
  tools.label(step === 'output' && output !== undefined ? output : '—', [2.08, 1.03, -.25], .32)
  const ports = [zh ? '输入' : 'Input', zh ? '补电' : 'Charge', zh ? '输出' : 'Output']
  ports.forEach((label, i) => tools.label(label, [(i - 1) * 2.08, .33, .86], .21))
  const active = step === 'input' ? -2.12 : step === 'process' ? 0 : 2.08
  kit.ring([active, .26, .04], .68, .038, mint, 'glow')
  tools.pick('advance', [active, .85, 0], [1.77, 1.35, 1.45])
}

type InterfaceState = { mode: ProgramInterface; phase: DevicePhase; input: number; output?: string; command: string; locale: Locale; replaying: boolean }

export const buildInterface: ModelBuilder<InterfaceState> = ({ mode, phase, input, output, command, locale, replaying }, kit, tools) => {
  worktop(kit)
  const zh = locale === 'zh', web = mode === 'web'
  const client = -2.02, processor = 2.04
  monitor(kit, client, mode === 'cli')
  if (mode !== 'cli') {
    kit.casing([client, .32, .50], [.78, .12, .33], '#8db49b', .05)
    kit.box([client, .386, .50], [.46, .022, .16], mint, undefined, 'glow')
  }
  tools.label(mode === 'cli' ? (zh ? '终端' : 'Terminal') : web ? (zh ? '浏览器' : 'Browser') : (zh ? '桌面窗口' : 'Desktop window'),
    [client, 1.73, -.36], .21)
  const outputReady = output !== undefined && ['process', 'response', 'output'].includes(phase)
  const screenText = phase === 'output' && output !== undefined ? output : mode === 'cli' ? command + ' ' + input : String(input)
  tools.label(screenText, [client, 1.05, -.25], .27)
  tools.pick('client', [client, .91, 0], [1.76, 1.47, 1.51])

  if (web) {
    kit.casing([processor, .92, -.09], [1.08, 1.38, .93], '#abc1af', .08)
    for (let i = 0; i < 3; i++) {
      kit.casing([processor, .52 + i * .36, .394], [.87, .23, .035], dark, .014)
      kit.box([processor + .30, .52 + i * .36, .42], [.088, .061, .013], outputReady ? mint : '#668983')
    }
  } else {
    kit.casing([processor, .44, 0], [1.25, .31, 1.10], metal, .07)
    kit.casing([processor, .74, -.05], [.89, .35, .87], dark, .045)
    for (let i = -2; i <= 2; i++) kit.box([processor + i * .14, .96, -.06], [.07, .20, .67], '#94aca4')
  }
  tools.label(web ? (zh ? '服务器' : 'Server') : (zh ? '补电程序' : 'Program'), [processor, web ? 1.79 : 1.39, -.05], .21)
  if (replaying) tools.pick('processor', [processor, .90, -.04], [1.28, 1.42, 1.16])
  if (outputReady) tools.label(output, [processor, web ? .94 : .71, .43], .26)
  const sending = phase === 'request' || phase === 'submit' || (mode === 'cli' && phase === 'input')
  const returning = phase === 'response' || phase === 'output'
  for (const [z, engaged, sign, tint] of [[-.17, sending, 1, gold], [.42, returning, -1, mint]] as const) {
    kit.rod([-.98, .32, z], [1.21, .32, z], .047, engaged ? tint : dark, engaged ? 'glow' : 'metal')
    for (const wing of [-.11, .11]) kit.rod([sign * .57, .32, z + wing], [sign * .79, .32, z], .036, tint)
  }
  const packet = sending ? String(input) : returning && outputReady ? output : undefined
  if (packet !== undefined) {
    const z = sending ? -.17 : .42
    kit.casing([0, .53, z], [.64, .28, .42], sending ? gold : mint, .047)
    tools.label(packet, [0, .77, z], .23)
  }
  const lit = phase === 'process' || phase === 'response' ? processor : client
  kit.box([lit, .258, .94], [1.02, .02, .10], phase === 'error' ? '#ed9f87' : mint, undefined, 'glow')
}
