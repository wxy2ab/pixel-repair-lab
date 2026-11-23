import type { ModelBuilder } from './teaching-model-types'

type ArrayCell = { reading: string; selected: boolean }

export const buildArrayInstrument: ModelBuilder<ArrayCell[]> = (cells, kit, tools) => {
  const columns = Math.min(5, Math.max(1, cells.length))
  const rows = Math.max(1, Math.ceil(cells.length / columns))
  kit.casing([0, .09, 0], [columns * 1.14 + .27, .20, rows * .92 + .20], '#4b6969', .07)
  cells.forEach(({ reading, selected }, index) => {
    const x = (index % columns - (columns - 1) / 2) * 1.14
    const z = (Math.floor(index / columns) - (rows - 1) / 2) * .92
    const h = selected ? .48 : .12
    kit.box([x, .21, z], [1.06, .07, .81], '#253b41')
    kit.casing([x, .24 + h / 2, z], [.96, h, .73], selected ? '#83cfb2' : '#667e83', .04)
    tools.label('[' + index + '] ' + reading, [x, .29 + h, z], .17)
  })
}

export const buildGroupInstrument: ModelBuilder<{ group: string; value: number }[]> = (points, kit, tools) => {
  const unit = 2.4 / Math.max(...points.map(point => Math.abs(point.value)), 1)
  const baseline = .22 + Math.max(0, ...points.map(point => -point.value)) * unit
  const width = Math.max(1, points.length) * 1.36
  kit.casing([0, .08, 0], [width + .30, .16, 1.32], '#47666a', .06)
  kit.rod([-width / 2, baseline, -.32], [width / 2, baseline, -.32], .023, '#ede2af')
  points.forEach(({ group, value }, i) => {
    const x = (i - (points.length - 1) / 2) * 1.36
    const h = value * unit
    if (h !== 0) kit.box([x, baseline + h / 2, -.15], [.64, Math.abs(h), .56], h > 0 ? '#78c5b1' : '#dfa078')
    tools.label(String(value), [x, baseline + h + (h < 0 ? -.065 : .12), -.13], .22)
    tools.label(group, [x, .20, .49], .18)
  })
}
