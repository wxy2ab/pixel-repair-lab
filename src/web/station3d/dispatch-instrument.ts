import type { DispatchStep } from '../../engine/batteryDispatch'
import type { DispatchCase } from '../../shared/batteryDispatch'
import type { CollectionBattery } from '../../shared/programWalkthrough'
import type { Locale } from '../../shared/types'
import type { ModelBuilder } from './teaching-model-types'
import { packColor } from './structure-instrument'

export type DispatchInstrumentState = {
  locale: Locale
  batch: DispatchCase
  step?: DispatchStep
  moving?: CollectionBattery
  arrivals: string[]
  running: boolean
  next?: DispatchStep
}

export const buildDispatchBench: ModelBuilder<DispatchInstrumentState> = (state, kit, tools) => {
  const { batch, step, next, moving, locale } = state
  const zh = locale === 'zh'
  const n = Math.max(1, batch.arrivals.length, step?.queue.length ?? 0, step?.order.length ?? 0)
  const pitch = 1.03, width = pitch * n + .24
  const steel = '#42626b', enamel = '#a1b8a7', brass = '#e4b46f', light = '#90e3b3'
  function xAt(i: number) { return (i - (n - 1) / 2) * pitch }
  function tray(x: number, z: number, w: number, title: string, active = false) {
    kit.casing([x, .14, z], [w, .24, 1.34], steel, .06)
    kit.box([x, .28, z], [w - .10, .045, 1.24], enamel)
    kit.box([x, .32, z + .58], [w - .12, .052, .09], active ? light : steel, undefined, active ? 'glow' : 'metal')
    tools.label(title, [x, .29, z + .81], .23)
  }
  function pack(x: number, y: number, z: number, name: string, tag: string, hit?: string, active = false, covered = false) {
    kit.casing([x, y, z], [.82, .36, .70], packColor(name), .05)
    for (const side of [-1, 1]) kit.box([x + side * .20, y + .20, z - .06], [.12, .045, .13], side === -1 ? brass : enamel)
    if (active) kit.box([x, y - .10, z + .35], [.6, .065, .02], light, undefined, 'glow')
    tools.label(tag, [x, y + .08, z + .38], .22, covered ? 'angled' : undefined)
    if (hit) {
      kit.ring([x, y + .21, z], .29, .031, brass, 'glow')
      tools.pick(hit, [x, y, z], [.93, .49, .86])
    }
  }
  const incoming = state.arrivals
  const inputZ = state.running ? -2.54 : 0
  tray(0, inputZ, width, zh ? '到站电池' : 'Arrivals')
  incoming.forEach((name, i) => pack(xAt(i), .56, inputZ, name, name + ' · ' + batch.records[name],
    next?.kind === 'enqueue' && next.battery === name ? 'advance' : undefined))
  if (!state.running) return

  const queue = step?.queue ?? [], stack = step?.stack ?? []
  const records = step?.records ?? batch.records, order = step?.order ?? []
  const queueZ = -.65, registerZ = 1.28, pickupZ = 3.12
  const stackX = width / 2 + 1.17
  tray(0, queueZ, width, zh ? '队列' : 'Queue', step?.kind === 'queueTake' || step?.kind === 'enqueue')
  for (let i = 0; i < n * 2; i++) {
    kit.cylinder([-width / 2 + .33 + i * pitch / 2, .35, queueZ], .07, .07, .95, steel, [Math.PI / 2, 0, 0])
  }
  queue.forEach((name, i) => pack(xAt(i), .61, queueZ, name, name, next?.kind === 'queueTake' && i === 0 ? 'advance' : undefined, step?.battery === name))
  if (queue.length) tools.label(zh ? '队头' : 'Front', [xAt(0), 1.11, queueZ], .20)

  tray(stackX, queueZ, 1.32, zh ? '暂放栈' : 'Stack', step?.kind === 'stackAdd' || step?.kind === 'stackTake')
  const height = .68 + Math.max(1, stack.length) * .42
  for (const side of [-1, 1]) kit.rod([stackX + side * .54, .30, queueZ - .39], [stackX + side * .54, height, queueZ - .39], .045, brass)
  stack.forEach(({ name, charge }, i) => pack(stackX, .54 + i * .42, queueZ, name, name + ' · ' + charge,
    i === stack.length - 1 && next?.kind === 'stackTake' ? 'advance' : undefined, name === step?.battery, i < stack.length - 1))
  tray(stackX, registerZ, 1.32, zh ? '交接台' : 'Transfer')
  if (moving) pack(stackX, .54, registerZ, moving.name, moving.name + ' · ' + moving.charge, next ? 'advance' : undefined, true)

  tray(0, registerZ, width, zh ? '按名登记' : 'Register', step?.kind === 'update')
  batch.arrivals.forEach((name, i) => {
    const x = xAt(i)
    kit.casing([x, .44, registerZ], [.87, .23, .85], step?.kind === 'update' && step.battery === name ? brass : steel, .04)
    tools.label(name + ' → ' + records[name], [x, .63, registerZ + .12], .21)
    if (next?.kind === 'update' && next.battery === name) tools.pick('advance', [x, .47, registerZ], [.87, .46, .92])
  })
  tray(0, pickupZ, width, zh ? '取件清单' : 'Pickup list', step?.kind === 'record' || step?.kind === 'return')
  order.forEach((name, i) => pack(xAt(i), .56, pickupZ, name, i + ' · ' + name))
  if (next?.kind === 'record' || next?.kind === 'return') tools.pick('advance', [0, .55, pickupZ], [width, .73, 1.5])
  if (next?.kind === 'stackAdd') tools.pick('advance', [stackX, height / 2 + .19, queueZ], [1.32, height, 1.4])
}
