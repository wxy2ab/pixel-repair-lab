import type { ArenaScenario } from '../shared/advanced'
import type { Locale, Position } from '../shared/types'
import { tr } from './text'

export function arenaGateCells({ shifts, combat }: ArenaScenario): Position[] {
  const cells = [...(shifts ?? []).flatMap(shift => [...(shift.open ?? []), ...(shift.close ?? [])]),
    ...(combat?.switches ?? []).flatMap(control => control.open)]
  return [...new Map(cells.map(cell => [cell.x + ',' + cell.y, cell])).values()]
}

export function switchDescription(open: readonly Position[], locale: Locale) {
  const cells = open.map(cell => `(${cell.x}, ${cell.y})`).join(' · ')
  return tr(locale, `闸门开关 · 打开 ${cells}`, `Gate switch · opens ${cells}`)
}
