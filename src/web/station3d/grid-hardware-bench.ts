import type { Locale } from '../../shared/types'
import type { ModelBuilder } from './teaching-model-types'
import type { Kit } from './workshop'

const steel = '#637f80', casing = '#365657', ivory = '#c5cfba', gold = '#e9b065', mint = '#8de1ba', sky = '#8cd1e1'
export type GridBenchState = {
  mode: 'binary' | 'logic' | 'memory'; values: number[]; selected: number; locale: Locale
  action?: 'scan' | 'submit' | 'load' | 'store'; address?: number; reading?: string
}

function arrow(kit: Kit, x: number, z: number, direction: number, tint: string) {
  const tip = x + direction * .16
  for (const dz of [-.09, .09]) kit.rod([x - direction * .13, .33, z + dz], [tip, .33, z], .027, tint, 'glow')
}

export const buildGridHardware: ModelBuilder<GridBenchState> = (s, kit, tools) => {
  const memory = s.mode === 'memory', cols = Math.min(4, s.values.length), rows = Math.ceil(s.values.length / cols)
  const boardWidth = cols * 1.13 + 2.1, depth = Math.max(2.1, rows * 1.12 + .63)
  const left = -boardWidth / 2, port = left + .79, rack = left + 2.46
  kit.casing([0, .12, 0], [boardWidth, .24, depth], casing, .08)
  kit.casing([0, .255, 0], [boardWidth - .12, .07, depth - .12], '#759291', .03)
  kit.casing([port, .51, 0], [1.11, .42, 1.11], ivory, .07)
  kit.casing([port, .76, 0], [.88, .14, .71], casing, .035)
  tools.label(s.reading ?? '—', [port, .91, .03], .24)
  tools.label(s.locale === 'zh' ? '程序' : 'Program', [port, .38, .75], .20)
  const lit = s.action === 'load' || s.action === 'store' || s.action === 'scan'
  const bus = s.action === 'store' ? gold : sky
  s.values.forEach((value, i) => {
    const x = rack + (i % cols) * 1.13, z = (Math.floor(i / cols) - (rows - 1) / 2) * 1.12
    const access = memory ? s.address === i : s.action === 'scan'
    const cableZ = z - .49, tinted = lit && access
    if (tinted) {
      const turn = port + .65
      for (const [a, b] of [[[port + .46, .33, 0], [turn, .33, 0]], [[turn, .33, 0], [turn, .33, cableZ]],
        [[turn, .33, cableZ], [x, .33, cableZ]], [[x, .33, cableZ], [x, .33, z - .21]]] as const) {
        kit.rod([...a], [...b], .032, bus, 'glow')
      }
      arrow(kit, port + .91, cableZ, s.action === 'store' ? 1 : -1, bus)
    }
    kit.casing([x, .38, z], [.96, .14, .84], access ? bus : steel, .045)
    if (memory) {
      kit.casing([x, .56, z - .04], [.73, .22, .54], casing, .04)
      for (const side of [-1, 1]) for (const lead of [-.15, 0, .15]) {
        kit.box([x + side * .39, .47, z + lead], [.12, .07, .07], ivory)
      }
    } else {
      kit.cylinder([x, .51, z - .08], .28, .32, .16, casing)
      kit.cylinder([x, .66, z - .08], .18, .235, .18, value ? mint : '#496356', undefined, value ? 'glow' : 'metal')
    }
    if (i === s.selected) kit.box([x, .47, z + .32], [.73, .031, .055], gold, undefined, 'glow')
    const slot = memory ? '[' + i + ']' : s.mode === 'logic' ? String.fromCharCode(65 + i) : String(2 ** (s.values.length - i - 1)) + '×'
    tools.label(slot, [x, .46, z + .40], .18)
    tools.label(String(value), [x, .85, z - .07], .24)
    tools.pick(String(i), [x, .60, z], [1.02, .70, .96])
  })
}
