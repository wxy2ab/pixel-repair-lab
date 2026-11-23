import type { Kit } from './workshop'
import type { ModelBuilder } from './teaching-model-types'

export type FieldTile = {
  id: string; x: number; z: number; label: string
  wall?: boolean; current?: boolean; visited?: boolean; pending?: boolean; selected?: boolean
  robot?: 'sprout' | 'rival'; battery?: boolean; reading?: string; raised?: number
}
export type FieldState = {
  tiles: FieldTile[]
  width: number; depth: number
  links?: [string, string][]
  route?: string[]
  bins?: { title: string; items: string[]; picks?: string[]; stack?: boolean }
}

const metal = '#547479', base = '#354f58', gold = '#ffce75', mint = '#9ae4b5'

function robot(kit: Kit, x: number, y: number, z: number, rival: boolean) {
  const shell = rival ? '#c68c74' : '#9ec7a5'
  kit.casing([x, y + .16, z], [.36, .22, .30], metal, .045)
  kit.casing([x, y + .40, z], [.46, .32, .35], shell, .057)
  kit.box([x, y + .40, z + .182], [.35, .14, .02], base)
  for (const side of [-1, 1]) kit.box([x + side * .09, y + .41, z + .197], [.05, .065, .015], rival ? gold : mint, undefined, 'glow')
  kit.rod([x, y + .56, z], [x + .06, y + .70, z], .025, metal)
  kit.casing([x + .07, y + .70, z], [.16, .063, .12], rival ? gold : mint, .028)
}

export const buildGraphField: ModelBuilder<FieldState> = (field, kit, tools) => {
  const { width, depth, tiles, bins } = field
  const centreX = (width - 1) / 2, centreZ = (depth - 1) / 2
  const positions = new Map(tiles.map(tile => [tile.id, tile]))
  kit.casing([0, .10, 0], [width + .23, .20, depth + .23], base, .07)
  const path = new Set(field.route)
  for (const tile of tiles) {
    const x = tile.x - centreX, z = tile.z - centreZ
    const top = .30 + (tile.raised ?? 0)
    const color = tile.wall ? '#465a64' : tile.current ? '#e4b363' : path.has(tile.id) ? '#82bf99'
      : tile.pending ? '#89beb1' : tile.visited ? '#759eab' : '#a9b6a7'
    kit.casing([x, (.20 + top) / 2, z], [.93, top - .20, .93], color, .035)
    if (tile.wall) {
      kit.casing([x, top + .21, z], [.86, .44, .85], '#506873', .05)
      kit.box([x, top + .438, z], [.62, .025, .075], '#839997')
    }
    if (tile.current || tile.selected) kit.ring([x, top + .028, z], .375, .034, tile.selected ? '#eaf0bd' : gold, 'glow')
    if (tile.robot) robot(kit, x - (tile.battery ? .17 : 0), top, z - .11, tile.robot === 'rival')
    if (tile.battery) {
      const bx = x + (tile.robot ? .24 : 0)
      kit.cylinder([bx, top + .19, z - .11], .17, .19, .37, '#76ad8b')
      kit.cylinder([bx, top + .395, z - .11], .09, .09, .05, gold)
    }
    const face = tile.wall ? top + .47 : top + .063
    tools.label(tile.label, [x, face, z + .30], .19)
    if (tile.reading !== undefined) tools.label(tile.reading, [x, top + (tile.robot ? .88 : tile.battery ? .58 : .18), z - .17], .21)
    const height = tile.robot || tile.wall || tile.battery ? .85 : .40
    tools.pick(tile.id, [x, top + height / 2 - .13, z], [.96, height, .96])
  }
  function link(a: string, b: string, tint: string, lit: boolean) {
    const from = positions.get(a), to = positions.get(b)
    if (!from || !to || a === b) return
    kit.rod([from.x - centreX, .345 + (from.raised ?? 0), from.z - centreZ - .12],
      [to.x - centreX, .345 + (to.raised ?? 0), to.z - centreZ - .12], lit ? .046 : .035, tint, lit ? 'glow' : 'metal')
  }
  for (const [a, b] of field.links ?? []) link(a, b, '#6d9090', false)
  field.route?.forEach((cell, i, cells) => { if (i) link(cells[i - 1], cell, mint, true) })
  if (bins) {
    const x = width / 2 + .87, z = 0
    const slots = Math.max(1, bins.items.length)
    const trayDepth = bins.stack ? .95 : slots * .62 + .15
    kit.casing([x, .16, z], [1.04, .28, trayDepth], base, .045)
    tools.label(bins.title, [x, .48 + (bins.stack ? slots * .36 : 0), -trayDepth / 2 + .04], .21)
    bins.items.forEach((text, i) => {
      const cy = .44 + (bins.stack ? i * .36 : 0)
      const cz = bins.stack ? 0 : (i - (slots - 1) / 2) * .62
      kit.casing([x, cy, cz], [.86, .27, .52], i === (bins.stack ? slots - 1 : 0) ? '#d7aa67' : '#719d9b', .04)
      tools.label(text, [x, cy + (bins.stack ? .045 : .17), cz + (bins.stack ? .29 : .02)], .20)
      const pick = bins.picks?.[i]
      if (pick) tools.pick(pick, [x, cy, cz], [.88, .30, .55])
    })
  }
}
