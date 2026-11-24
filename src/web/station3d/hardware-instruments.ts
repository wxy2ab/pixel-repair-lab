import type { Bit, CircuitInput, MachineInstruction, MachineState } from '../../shared/hardware'
import type { Kit } from './workshop'
import type { TeachingModelTools } from './teaching-model-types'

type Point = [number, number, number]
const graphite = '#253d47'
const board = '#366660'
const steel = '#acc2b9'
const gold = '#eead59'
const mint = '#8af2bd'
const idle = '#66797a'

function baseplate(kit: Kit, left: number, right: number, back: number, front: number) {
  const width = right - left, depth = front - back
  const x = (right + left) / 2, z = (back + front) / 2
  kit.casing([x, .10, z], [width, .20, depth], graphite, .085)
  kit.casing([x, .21, z], [width - .09, .085, depth - .09], board, .035)
  for (const px of [left + .17, right - .17]) for (const pz of [back + .17, front - .17]) {
    kit.cylinder([px, .262, pz], .054, .056, .028, steel)
    kit.box([px, .279, pz], [.071, .006, .012], graphite)
  }
}

function trace(kit: Kit, points: Point[], active: boolean, lit = mint) {
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i]
    if (from.every((value, axis) => value === to[axis])) continue
    kit.rod(from, to, active ? .025 : .018, active ? lit : '#68887d', active ? 'glow' : 'metal')
  }
}

export type CpuModelState = {
  state: MachineState; previous: MachineState; instruction?: MachineInstruction; phase: 'fetch' | 'decode' | 'execute'
  locale: 'zh' | 'en'; pinned?: number; equation?: string; canStep: boolean
}

function direction(kit: Kit, x: number, z: number, dx: number, dz: number, tint: string) {
  const tip: Point = [x, .365, z]
  for (const sign of [-1, 1]) {
    kit.rod([x - dx * .15 + sign * dz * .093, .365, z - dz * .15 - sign * dx * .093], tip, .035, tint, 'glow')
  }
}

export function buildCpuModel({ state, previous, instruction, phase, pinned, locale, equation, canStep }: CpuModelState, kit: Kit, tools: TeachingModelTools) {
  const columns = Math.min(4, Math.max(1, state.memory.length))
  const rows = Math.max(1, Math.ceil(state.memory.length / columns))
  const x0 = 1.42, z0 = -.96
  const xAt = (index: number) => x0 + (index % columns) * 1.15
  const zAt = (index: number) => z0 + Math.floor(index / columns) * 1.20
  baseplate(kit, -3.43, xAt(columns - 1) + .62, -1.96, Math.max(1.68, zAt((rows - 1) * columns) + .78))
  const op = instruction?.op
  const active = instruction && instruction.op !== 'HALT' ? instruction.address : undefined
  const execute = !!op && phase === 'execute'
  const access = execute && active !== undefined
  const writing = op === 'STORE'
  const math = execute && (op === 'ADD' || op === 'SUB')
  const read = mint, write = gold, compute = '#b7c8ff', selected = '#bfe8ff'
  const track = '#6f9084'
  const y = .315
  function line(coords: [number, number][], illuminated: boolean, tint: string) {
    trace(kit, coords.map(([x,z]): Point => [x, y, z]), illuminated, tint)
  }
  function chip(x: number, z: number, width: number, depth: number, lit: string | undefined) {
    kit.casing([x,.35,z], [width+.08,.15,depth+.08], lit ?? '#78908c', .045)
    kit.casing([x,.51,z], [width,.25,depth], graphite, .055)
    for (const sign of [-1,1]) for (const offset of [-.27,0,.27]) {
      kit.box([x+width/2*sign,.35,z+offset*depth], [.16,.065,.072], steel)
    }
    kit.box([x,.653,z+depth*.31], [width*.64,.022,.045], lit ?? track, undefined, lit ? 'glow' : 'metal')
  }

  // Program addresses use the instruction store. Its chip is separate from data RAM.
  const fetch = phase === 'fetch'
  line([[-2.14,-1.23],[-1.75,-1.23]], fetch, read)
  line([[-1.04,-1.23],[-.67,-1.23]], fetch, read)
  if (fetch) direction(kit,-1.84,-1.23,1,0,read)
  chip(-2.68,-1.23,1.00,.70, previous.pc !== state.pc || fetch ? read : undefined)
  tools.label('PC ' + state.pc, [-2.68,.77,-1.23], .235)
  kit.casing([-1.39,.40,-1.23], [.69,.26,.61], '#587a8b', .035)
  for (const x of [-1.61,-1.39,-1.17]) kit.box([x,.54,-1.23], [.09,.028,.46], steel)
  tools.label(locale === 'zh' ? '程序' : 'Code', [-1.39,.72,-1.52], .16)
  chip(-.08,-1.23,1.22,.67, phase === 'decode' ? compute : undefined)
  tools.label(instruction ? op + (active === undefined ? '' : ' [' + active + ']') : 'IR', [-.08,.79,-1.22], .23)
  if (phase === 'decode' && active !== undefined) {
    line([[.55,-1.23],[.72,-1.23],[.72,zAt(active)-.46],[xAt(active),zAt(active)-.46]], true, compute)
  }

  const accChanged = previous.accumulator !== state.accumulator
  chip(-2.35,.02,1.46,.78, execute && op !== 'HALT' ? writing ? read : write : undefined)
  const accWrite = access && !writing
  tools.label('ACC ' + (accWrite ? previous.accumulator + '→' : '') + state.accumulator, [-2.35,.77,.01], .24)
  if (accChanged) kit.box([-2.35,.664,-.29], [.90,.020,.055], write, undefined, 'glow')

  // The ALU takes two operands on its north side and sends the result back on a separate rail.
  line([[-1.58,-.12],[-.37,-.12],[-.37,.46]], math, read)
  line([[.61,-.12],[.13,-.12],[.13,.46]], math, read)
  line([[-.69,.90],[-1.37,.90],[-1.37,.20],[-1.58,.20]], math, write)
  if (math) {
    direction(kit,-.37,.41,0,1,read)
    direction(kit,.13,.41,0,1,read)
    direction(kit,-1.49,.20,-1,0,write)
  }
  chip(-.15,.89,1.16,.75, math ? compute : undefined)
  kit.box([-.15,.653,.67], [.63,.020,.070], math ? compute : track, undefined, math ? 'glow' : 'metal')
  tools.label('ALU', [-.15,.80,.83], .23)
  if (math && equation) tools.label(equation, [-.15,.54,1.37], .205)

  // LOAD and STORE bypass the ALU, with opposite directions along the upper rail.
  const direct = execute && (op === 'STORE' || op === 'LOAD')
  line([[-1.58,-.24],[-1.35,-.40],[.61,-.40]], direct, writing ? write : read)
  if (direct) direction(kit, -.77,-.40,writing ? 1 : -1,0,writing ? write : read)

  for (let row=0; row<rows; row++) {
    const z = z0 + row*1.20 - .46
    const last = Math.min((row + 1)*columns, state.memory.length) - 1
    if (last >= 0) line([[.61,z],[xAt(last),z]], false, track)
  }
  line([[.61,Math.min(-.40,z0-.46)],[.61,Math.max(-.12,z0+(rows-1)*1.20-.46)]], false, track)
  if (access && active < state.memory.length) {
    const z = zAt(active)-.46
    line([[.61,math ? -.12 : -.40],[.61,z],[xAt(active),z],[xAt(active),zAt(active)]], true, writing ? write : read)
    direction(kit,.98,z,writing ? 1 : -1,0,writing ? write : read)
  }
  for (const [i,value] of state.memory.entries()) {
    const x=xAt(i), z=zAt(i)
    const addressed = phase !== 'fetch' && active === i
    const tint = addressed ? (phase === 'decode' ? compute : writing ? write : read) : undefined
    kit.casing([x,.354,z], [.95,.16,.83], tint ?? '#94aaa1', .045)
    kit.casing([x,.495,z], [.80,.19,.68], tint ? '#506758' : graphite, .045)
    for (const dx of [-.44,.44]) for (const dz of [-.21,0,.21]) kit.box([x+dx,.37,z+dz], [.09,.065,.062], steel)
    kit.box([x,.62,z-.23], [.46,.038,.075], tint ?? track, undefined, tint ? 'glow' : 'metal')
    if (pinned === i) kit.ring([x,.29,z],.54,.029,selected,'glow')
    const reading = execute && addressed ? writing ? previous.memory[i] + '→' + value : '↑ ' + value : String(value)
    tools.label(reading,[x,.82,z-.13],.225)
    tools.label('['+i+']',[x,.54,z+.36],.17)
    tools.pick('ram:'+i,[x,.55,z],[1.04,.74,1.04])
  }

  // A physical clock advances the same cursor as the accessible step controls.
  kit.cylinder([-2.53,.345,1.02], .32,.35,.17,graphite)
  kit.cylinder([-2.53,.475,1.02], .255,.28,.15,canStep ? gold : idle,undefined,canStep ? 'glow' : 'metal')
  tools.label(locale === 'zh' ? '时钟' : 'Clock', [-2.53,.715,1.02], .19)
  if (execute && state.halted) tools.label('■ HALT', [-2.53,.47,1.46], .19)
  if (canStep) tools.pick('clock',[-2.53,.52,1.02],[.83,.61,.83])
}

export type SwitchboardModelState = CircuitInput & {
  binary: boolean; value: number; output?: Bit; focusBit?: number
  changedBits: boolean[]; changedGate: boolean; changedValue: boolean; changedOutput: boolean
  gateSelectable: boolean
}

export function buildSwitchboardModel(state: SwitchboardModelState, kit: Kit, tools: TeachingModelTools) {
  const { bits, gate, binary, value, output } = state
  const spacing = 1.02
  const width = Math.max(gate && binary ? 4.50 : 2.50, bits.length * spacing + .28)
  baseplate(kit, -width / 2, width / 2, -1.42, 1.24)
  const switchX = (i: number) => (i - (bits.length - 1) / 2) * spacing
  const chipX = binary ? .19 : -.36
  const meterX = gate ? -1.35 : 0
  const power = '#9dffb1'

  if (gate) {
    if (state.changedGate) kit.casing([chipX, .286, -.74], [1.04, .045, .82], gold, .035)
    kit.casing([chipX, .405, -.74], [.92, .24, .70], '#263e48', .055)
    for (const x of [-.37, -.13, .13, .37]) {
      for (const z of [-1.11, -.365]) kit.box([chipX + x, .315, z], [.078, .068, .17], steel)
    }
    tools.label(gate, [chipX, .66, -.77], .22)
    if (state.gateSelectable) tools.pick('gate', [chipX, .50, -.74], [.98, .48, .78])
    const lampX = chipX + 1.10
    const lit = output === 1
    trace(kit, [[chipX + .42, .29, -.73], [lampX, .29, -.73]], lit)
    kit.cylinder([lampX, .32, -.73], .214, .245, .14, graphite)
    kit.cylinder([lampX, .46, -.73], .16, .18, .18, lit ? power : '#486358', undefined, lit ? 'glow' : 'metal')
    kit.cylinder([lampX, .57, -.73], .067, .16, .077, lit ? power : '#648075', undefined, lit ? 'glow' : 'metal')
    if (state.changedOutput) kit.ring([lampX, .29, -.73], .30, .025, gold, 'glow')
    tools.label(String(output), [lampX, .78, -.73], .20)
  }
  if (binary) {
    if (state.changedValue) kit.casing([meterX, .281, -.76], [1.62, .045, .86], gold, .048)
    kit.casing([meterX, .40, -.76], [1.48, .28, .74], graphite, .06)
    tools.label(String(value), [meterX, .73, -.76], .29)
  }
  bits.forEach((bit, i) => {
    const x = switchX(i)
    const on = bit === 1
    if (state.changedBits[i] || state.focusBit === i) {
      kit.casing([x, .273, .52], [.82, .041, .92], gold, .045)
    }
    if (binary) {
      const pinX = meterX + (i + .5) / bits.length * 1.14 - .57
      const z = .23 - i / bits.length * .50
      // Separate traces carry each bit to its own contact on the binary register.
      trace(kit, [[x - .16, .276, .39], [x - .16, .276, z], [pinX, .276, z], [pinX, .276, -.42]], on && (state.focusBit === undefined || i <= state.focusBit), '#79d5ec')
      kit.box([pinX, .551, -.51], [Math.min(.18, .8 / bits.length), .025, .08], on ? '#87e1ee' : idle, undefined, on ? 'glow' : 'metal')
    }
    const connected = gate && (i === 0 || i === 1 && gate !== 'NOT')
    if (connected) {
      const z = i === 0 ? -.20 : .025
      const pinX = chipX + (i === 0 ? -.31 : .30)
      trace(kit, [[x, .28, .40], [x, .28, z], [pinX, .28, z], [pinX, .28, -.37]], on)
    }
    kit.casing([x, .35, .52], [.68, .16, .77], '#c3c9b9', .055)
    kit.casing([x, .445, .50], [.45, .095, .56], graphite, .04)
    kit.cylinder([x, .53, .52], .104, .104, .42, steel, [0, 0, Math.PI / 2])
    const leverZ = on ? .35 : .70
    kit.rod([x, .53, .52], [x, .80, leverZ], .067, steel)
    kit.casing([x, .81, leverZ], [.30, .135, .19], on ? '#9ae7ac' : '#c18a61', .047)
    kit.cylinder([x + .235, .463, .36], .045, .059, .051, on ? power : idle, undefined, on ? 'glow' : 'metal')
    const pin = i === 0 ? 'A' : 'B'
    const annotation = binary ? (2 ** (bits.length - i - 1)) + '×' + bit : pin + ' · ' + bit
    tools.label(annotation, [x, .39, .99], .17)
    tools.pick(String(i), [x, .58, .61], [.81, .76, 1.14])
  })
}
