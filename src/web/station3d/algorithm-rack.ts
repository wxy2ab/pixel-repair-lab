import type { Locale } from '../../shared/types'
import type { ModelBuilder } from './teaching-model-types'

export type RackCell = { key: string; label: string; charge?: number; changed: boolean }
export type LiveRack = {
  title: string; cells: RackCell[]; selected?: string; gauges: string[]; locale: Locale
}

const frame = '#344e55', enamel = '#8db9ad', gold = '#efbc70', mint = '#a7efd2'

export const buildAlgorithmRack: ModelBuilder<LiveRack> = ({ title, cells, selected, gauges, locale }, kit, tools) => {
  const columns = Math.max(3, Math.min(4, cells.length))
  const rows = Math.max(1, Math.ceil(cells.length / columns))
  const width = columns * 1.48 + .32, depth = rows * 1.38 + 1.18
  kit.casing([0, .13, 0], [width, .26, depth], frame, .07)
  kit.casing([0, .29, 0], [width - .11, .10, depth - .12], '#63847e', .04)
  const rear = -depth / 2 + .36
  kit.casing([0, .47, rear], [width - .32, .24, .44], frame, .04)
  tools.label(title, [0, .78, rear], .25)
  if (!cells.length) tools.label(locale === 'zh' ? '空槽' : 'Empty rack', [0, .51, .12], .22)
  cells.forEach((cell, index) => {
    const x = (index % columns - (columns - 1) / 2) * 1.48
    const z = rear + .9 + Math.floor(index / columns) * 1.38
    const active = selected === cell.key
    const tint = active ? mint : cell.changed ? gold : enamel
    kit.casing([x, .40, z], [1.30, .13, 1.07], frame, .04)
    const height = cell.charge === undefined ? .42 : .27 + Math.min(.64, Math.log2(1 + Math.abs(cell.charge)) * .12)
    kit.casing([x, .48 + height / 2, z - .12], [.78, height, .59], tint, .058)
    for (const side of [-1, 1]) kit.box([x + side * .22, .52 + height, z - .12], [.13, .09, .15], side === 1 ? gold : frame)
    kit.box([x, .46, z + .43], [1.09, .045, .075], tint, undefined, active || cell.changed ? 'glow' : 'metal')
    tools.label(cell.label, [x, .72 + height, z - .15], .22)
    tools.label(cell.key, [x, .48, z + .45], .19)
    tools.pick(cell.key, [x, .70, z], [1.31, height + .73, 1.08])
  })
  for (let i = 0; i < gauges.length; i++) {
    const x = ((i + .5) / gauges.length - .5) * (width - .2)
    tools.label(gauges[i], [x, .42, depth / 2 - .12], .18)
  }
}
