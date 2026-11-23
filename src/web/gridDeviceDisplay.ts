import type { Direction, GridDevice, GridDeviceState, GridHazard, Locale } from '../shared/types'
import { isGridDoorOpen, reflectGridDirection } from '../shared/gridDevices'
import { tr } from './text'

type DeviceStatus = 'on' | 'off' | 'armed' | 'spent' | 'burst' | 'open' | 'locked' | 'ready' | 'taken' | 'fixed'
export type BoardDevice = GridDevice & { status: DeviceStatus; remaining?: number }

export function boardDevice(device: GridDevice, state: GridDeviceState, turn: number): BoardDevice {
  let status: DeviceStatus
  switch (device.kind) {
    case 'cannon': status = turn > 0 && turn % device.period === (device.phase ?? 0) ? 'on' : 'off'; break
    case 'laser': status = device.switchId && state.switches.includes(device.switchId) ? 'off' : 'on'; break
    case 'switch': status = state.switches.includes(device.id) ? 'on' : 'off'; break
    case 'door': status = isGridDoorOpen(device, state) ? 'open' : 'locked'; break
    case 'key': status = state.keys.includes(device.id) ? 'taken' : 'ready'; break
    case 'chest': status = state.openedChests.includes(device.id) ? 'open' : device.keyId && !state.keys.includes(device.keyId) ? 'locked' : 'ready'; break
    case 'bomb': return { ...device, status: turn < device.atTurn ? 'armed' : turn === device.atTurn ? 'burst' : 'spent', remaining: Math.max(0, device.atTurn - turn) }
    case 'mirror': status = 'fixed'; break
  }
  return { ...device, status }
}

const names = {
  cannon: ['脉冲大炮', 'Pulse cannon'], switch: ['开关', 'Switch'], laser: ['激光器', 'Laser'],
  mirror: ['反光镜', 'Mirror'], bomb: ['倒计时炸弹', 'Countdown bomb'], chest: ['宝箱', 'Chest'],
  key: ['钥匙', 'Key'], door: ['门', 'Door'],
} as const

export const deviceName = (kind: GridDevice['kind'], locale: Locale) => names[kind][locale === 'zh' ? 0 : 1]
export const directionArrow: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' }

export function describeDevice(device: BoardDevice, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const name = deviceName(device.kind, locale)
  switch (device.kind) {
    case 'mirror': return name + ' ' + device.orientation
    case 'bomb': return name + ' · ' + (device.status === 'armed' ? t('还剩 ' + device.remaining + ' 回合', device.remaining + (device.remaining === 1 ? ' turn left' : ' turns left'))
      : device.status === 'burst' ? t('本回合爆发', 'Burst this turn') : t('已耗尽', 'Spent'))
    case 'cannon': return name + ' ' + directionArrow[device.direction] + ' · ' + (device.status === 'on' ? t('本回合发射', 'Firing this turn') : t('蓄能中', 'Charging'))
    case 'laser': return name + ' ' + directionArrow[device.direction] + ' · ' + (device.status === 'on' ? t('已开启', 'On') : t('已关闭', 'Off'))
    case 'switch': return name + ' · ' + (device.status === 'on' ? t('已踩下', 'Pressed') : t('未踩下', 'Unpressed'))
    case 'key': return name + ' · ' + (device.status === 'taken' ? t('已拿到', 'Collected') : t('待领取', 'Available'))
    case 'door': return name + ' · ' + (device.status === 'open' ? t('已打开', 'Open') : t('已锁定', 'Locked'))
    case 'chest': return name + ' · ' + (device.status === 'open' ? t('已打开', 'Opened') : device.status === 'locked' ? t('需要钥匙', 'Needs a key') : t('可以打开', 'Ready to open'))
  }
}

export const hazardName = (kind: GridHazard['kind'], locale: Locale) => {
  if (kind === 'bomb') return tr(locale, '炸弹波及区', 'Bomb burst')
  return kind === 'laser' ? tr(locale, '激光束', 'Laser beam') : tr(locale, '大炮脉冲', 'Cannon pulse')
}

const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export function emittingRay(device: BoardDevice | undefined, hazards?: readonly GridHazard[]) {
  if ((device?.kind === 'laser' || device?.kind === 'cannon') && hazards?.some(hazard => hazard.sourceId === device.id)) return device
}

// Draw both halves of a reflected beam so its path stays visible at the mirror.
export function rayArms(hazard: GridHazard, device?: BoardDevice): Direction[] {
  if (!hazard.direction) return []
  const direction = hazard.direction
  const outgoing = hazard.kind === 'laser' && device?.kind === 'mirror'
    ? reflectGridDirection(direction, device.orientation) : direction
  return [opposite[direction], outgoing]
}
