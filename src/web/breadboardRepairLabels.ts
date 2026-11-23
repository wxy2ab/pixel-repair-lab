import type { RepairChange } from './breadboardRepairHistory'
import type { FaultKind, MeterNote } from './breadboardRepairTicket'

type Translate = (zh: string, en: string) => string
export const pinName = (pin: string) => pin.replace('uno-', '')

const voltage = (volts: number) => (volts < 0 ? '−' : '') + Math.abs(volts).toFixed(1) + ' V'

export function meterValue(note: MeterNote, t: Translate) {
  if (note.kind === 'voltage') return voltage(note.volts)
  if (note.kind === 'floating') return t('悬空', 'Floating')
  return note.connected ? t('相通', 'Connected') : t('未直通', 'No continuity')
}

export function readingDifference(before: MeterNote, after: MeterNote, t: Translate) {
  if (before.kind === 'voltage' && after.kind === 'voltage') {
    const delta = Math.round((after.volts - before.volts) * 10) / 10
    if (!delta) return t('电压没变', 'Voltage unchanged')
    return t('电压变化 ', 'Voltage change ') + (delta > 0 ? '+' : '') + voltage(delta)
  }
  if (before.kind === 'continuity' && after.kind === 'continuity') {
    if (before.connected === after.connected) return t('通断没变', 'Continuity unchanged')
    return after.connected ? t('现在两点直通了', 'The two contacts are now connected')
      : t('两点之间的直通断开了', 'The direct connection is gone')
  }
  if (after.kind === 'voltage') return t('现在能读到电压了', 'There is now a voltage reading')
  return before.kind === 'floating' && after.kind === 'floating' ? t('两次都悬空', 'Both readings are floating')
    : t('现在测点悬空', 'The reading is now floating')
}

export function noteConditions(note: MeterNote, t: Translate) {
  const mode = note.kind === 'continuity' ? t('断电测通断', 'Power off · Continuity') : t('通电测电压', 'Power on · DC voltage')
  const button = note.pressed ? t('按钮按下', 'Button pressed') : t('按钮松开', 'Button released')
  return mode + ' · ' + button
}

export function diagnosisText(kind: FaultKind, t: Translate) {
  return kind === 'wrong-jumper' ? t('跳线插错孔', 'Misplaced jumper') : t('LED 接反', 'Reversed LED')
}

export function changeText(change: RepairChange, t: Translate) {
  const endpoints = (pins: string[]) => pins.map(pinName).join(' ↔ ')
  if (change.kind === 'wire-moved') return t('跳线一端留在 ', 'The jumper stayed in ') + pinName(change.fixed)
    + t('，另一端从 ', ' at one end. The other moved from ') + pinName(change.from) + t(' 移到 ', ' to ') + pinName(change.to)
  if (change.kind === 'wire-added') return t('新接跳线 ', 'Added jumper ') + endpoints(change.pins)
  if (change.kind === 'wire-removed') return t('取下跳线 ', 'Removed jumper ') + endpoints(change.pins)
  const names = { led: 'LED', button: t('按钮', 'button'), resistor: t('电阻', 'resistor') }
  if (change.kind === 'part-added') return t('插入', 'Inserted ') + names[change.part.kind] + ' · ' + endpoints(change.part.pins)
  if (change.kind === 'part-removed') return t('拔出', 'Removed ') + names[change.part.kind] + ' · ' + endpoints(change.part.pins)
  if (change.kind === 'led-flipped' || change.kind === 'part-moved' && change.part === 'led') {
    return (change.kind === 'led-flipped' ? t('翻转 LED。', 'Flipped LED. ') : t('移动 LED。', 'Moved LED. '))
      + t('阳极从 ', 'Anode moved from ') + pinName(change.from[0]) + t(' 移到 ', ' to ') + pinName(change.to[0])
      + t('，阴极从 ', ', cathode from ') + pinName(change.from[1]) + t(' 移到 ', ' to ') + pinName(change.to[1])
  }
  if (change.kind === 'part-moved') return t('移动', 'Moved ') + names[change.part] + t('，从 ', ' from ') + endpoints(change.from) + t(' 移到 ', ' to ') + endpoints(change.to)
}
