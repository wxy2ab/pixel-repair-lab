import type { StructureKind } from '../../shared/programWalkthrough'
import type { Locale } from '../../shared/types'
import type { Kit } from './workshop'
import type { TeachingModelTools } from './teaching-model-types'

export type StructureInstrumentState = {
  kind: StructureKind
  names: readonly string[]
  values?: Readonly<Record<string, number>>
  active?: string
  capacity: number
  locale: Locale
  waiting?: readonly string[]
  taken?: readonly string[]
  arrival?: { name: string; charge: number }
  inserting: boolean
}

const frame = '#314c57'
const metal = '#87a7a3'
const brass = '#d6ab6b'
const light = '#ffce73'
const packColors = ['#63aa9d', '#6892bf', '#c98b6d', '#8ba16a', '#9a82b4']

// A battery keeps its enamel colour when it moves to another position.
export function packColor(name: string) {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return packColors[hash % packColors.length]
}

function tray(kit: Kit, width: number, depth: number) {
  kit.casing([0, .12, 0], [width, .24, depth], frame, .08)
  kit.casing([0, .26, 0], [width - .07, .07, depth - .08], metal, .028)
}

function flatPack(kit: Kit, name: string, x: number, y: number, z: number, active: boolean) {
  kit.casing([x, y, z], [1.19, .41, .79], packColor(name), .065)
  for (const side of [-1, 1]) kit.box([x + side * .44, y, z], [.095, .425, .81], frame)
  kit.box([x - .18, y + .22, z], [.16, .048, .15], brass)
  kit.box([x + .18, y + .22, z], [.16, .048, .15], metal)
  if (active) kit.box([x, y - .13, z + .40], [.65, .058, .024], light, undefined, 'glow')
}

export function buildStructureInstrument(state: StructureInstrumentState, kit: Kit, tools: TeachingModelTools) {
  const { kind, names, values, active, locale } = state
  const count = Math.max(1, names.length, state.capacity)
  const zh = locale === 'zh'
  if (state.taken) {
    const n = Math.max(1, state.taken.length)
    const x0 = kind === 'stack' ? 1.34 : -(n - 1) * .46
    const z = kind === 'stack' ? .05 : 1.63
    const mid = x0 + (n - 1) * .46
    kit.casing([mid, .15, z], [n * .92 + .20, .24, .88], frame, .06)
    tools.label(zh ? '已取出' : 'Removed', [mid, .32, z + .52], .21)
    state.taken.forEach((name, index) => {
      const x = x0 + index * .92
      kit.casing([x, .46, z], [.78, .33, .66], packColor(name), .05)
      tools.label((index + 1) + ' · ' + name, [x, .66, z + .1], .21)
    })
  }
  if (state.waiting) {
    // The supply board stays in place when its last battery is moved to the rack.
    const cx = kind === 'stack' ? -1.07 - count * .48 : 0
    const cz = kind === 'stack' ? 0 : -1.52
    kit.casing([cx, .13, cz], [count * .94 + .14, .22, 1.10], '#996d49', .07)
    tools.label(zh ? '待放入' : 'Waiting', [cx, .24, cz + .52], .22)
    for (let i = 0; i < count; i++) {
      const x = cx + (i - (count - 1) / 2) * .94
      const z = cz
      kit.casing([x, .265, z], [.81, .075, .80], frame, .04)
      const name = state.waiting[i]
      if (name === undefined) continue
      kit.casing([x, .51, z], [.63, .41, .65], packColor(name), .06)
      kit.box([x - .13, .735, z], [.13, .04, .13], brass)
      kit.box([x + .13, .735, z], [.13, .04, .13], metal)
      tools.label(name, [x, .55, z + .34], .21)
      tools.pick(name, [x, .51, z], [.70, .47, .73])
    }
  }
  if (kind === 'stack') {
    // The magazine is open above. The first name in Python's list lies on its floor.
    const pitch = .51
    const height = .25 + count * pitch
    tray(kit, 1.9, 1.46)
    for (const x of [-.74, .74]) {
      kit.rod([x, .27, -.43], [x, height + .11, -.43], .064, metal)
      kit.cylinder([x, height + .12, -.43], .084, .084, .07, brass)
    }
    names.forEach((name, index) => {
      const y = .54 + index * pitch
      flatPack(kit, name, 0, y, 0, name === active)
      tools.label(name, [0, y + .04, .45], .22, index < names.length - 1 ? 'angled' : undefined)
      tools.pick(name, [0, y, .025], [1.19, .44, .96])
    })
    if (names.length) {
      const y = .98 + pitch * (names.length - 1)
      tools.label(zh ? '栈顶' : 'Top', [0, y, -.10], .21)
      tools.pick(names[names.length - 1], [0, y, -.10], [.42, .20, .25])
    }
    return
  }

  if (kind === 'dictionary') {
    // Each socket carries its own key. The gauge above that very socket is its value.
    const columns = Math.min(count, 4)
    const rows = Math.ceil(count / columns)
    tray(kit, columns * 1.27 + .24, rows * 1.31 + .25)
    if (state.arrival) {
      const x = -columns * .635 - .84
      kit.casing([x, .20, 0], [1.08, .27, 1.05], brass, .05)
      kit.cylinder([x, .56, 0], .28, .32, .48, packColor(state.arrival.name))
      tools.label(String(state.arrival.charge), [x, .97, -.05], .24)
      tools.label(state.arrival.name, [x, .60, .32], .22)
      tools.label(zh ? '待登记' : 'New arrival', [x, .31, .55], .20)
      tools.pick(state.arrival.name, [x, .57, 0], [1.0, .81, .98])
    }
    for (let i = 0; i < count; i++) {
      const x = ((i % columns) - (columns - 1) / 2) * 1.27
      const z = (Math.floor(i / columns) - (rows - 1) / 2) * 1.31
      kit.casing([x, .35, z], [1.15, .11, 1.12], frame, .05)
      const name = names[i]
      if (name === undefined) continue
      kit.cylinder([x, .51, z - .10], .32, .36, .25, metal)
      kit.cylinder([x, .76, z - .10], .28, .29, .44, packColor(name))
      kit.cylinder([x, 1.00, z - .10], .14, .14, .07, brass)
      if (name === active) kit.ring([x, .413, z - .10], .416, .033, light, 'glow')
      tools.label(name, [x, .49, z + .44], .22)
      if (values && Object.hasOwn(values, name)) {
        tools.label(String(values[name]), [x, 1.21, z - .10], .27)
        tools.pick(name, [x, 1.21, z - .10], [.52, .23, .30])
      }
      tools.pick(name, [x, .69, z], [1.13, .78, 1.12])
    }
    return
  }

  const queue = kind === 'queue'
  const pitch = 1.39
  const width = count * pitch + .28
  tray(kit, width, 1.48)
  if (queue) {
    // The roller bed feeds the oldest battery out through the left end.
    for (let n = 0; n < count * 3; n++) {
      const x = -width / 2 + .34 + n * pitch / 3
      kit.cylinder([x, .34, -.04], .085, .085, .90, metal, [Math.PI / 2, 0, 0])
    }
    for (const z of [-.56, .50]) kit.box([0, .38, z], [width - .14, .12, .07], frame)
  }
  for (let index = 0; index < count; index++) {
    const x = (index - (count - 1) / 2) * pitch
    if (!queue) {
      kit.casing([x, .34, 0], [1.30, .10, .99], frame, .032)
      if (index < names.length) {
        tools.label(String(index), [x, .32, .65], .20)
        tools.pick(names[index], [x, .32, .65], [.52, .20, .25])
      }
    }
    const name = names[index]
    if (name === undefined) continue
    flatPack(kit, name, x, .67, -.045, name === active)
    tools.label(name, [x, .75, .40], .23)
    tools.pick(name, [x, .67, 0], [1.22, .47, .96])
    if (queue && (index === 0 || index === names.length - 1)) {
      const ends = names.length === 1 ? (zh ? '队头 / 队尾' : 'Front / Back')
        : index === 0 ? (zh ? '队头' : 'Front') : (zh ? '队尾' : 'Back')
      tools.label(ends, [x, 1.27, -.04], .21)
      tools.pick(name, [x, 1.27, -.04], [.67, .19, .25])
    }
  }
  if (state.inserting) {
    for (let index = 0; index <= names.length; index++) {
      const x = (index - count / 2) * pitch
      kit.casing([x, .29, .79], [.32, .15, .34], brass, .04)
      tools.label('+', [x, .40, .83], .19)
      tools.pick('insert:' + index, [x, .34, .80], [.42, .26, .40])
    }
  }
}
