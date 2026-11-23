import type { ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { DeviceWindow } from './DeviceWindow'
import { tr } from './text'
import './coding-device.css'

type Device = 'debugger' | 'sorter' | 'scanner' | 'navigator'

const deviceTitles = {
  debugger: ['Python 调试器', 'Python debugger'],
  sorter: ['电池分拣台', 'Battery sorter'],
  scanner: ['电池检测仪', 'Battery scanner'],
  navigator: ['维修站导航仪', 'Station navigator'],
} as const

export function ChargeInput({ value, locale, onRead, started, className, testId }: {
  value: number
  locale: Locale
  onRead: () => void
  started: boolean
  className: string
  testId: string
}) {
  const action = started ? tr(locale, '重新读取', 'Read again') : tr(locale, '读取电量', 'Read charge')
  return <button type="button" onClick={onRead} className={'device-charge-key ' + className}
    aria-label={action + ' ' + value}>
    <strong data-testid={testId}>{value}</strong><small>{action}</small>
  </button>
}

export function CodingDevice({ device, locale, controls, children, workbench = false }: {
  device: Device
  locale: Locale
  controls: ReactNode
  children: ReactNode
  workbench?: boolean
}) {
  const [zh, en] = deviceTitles[device]
  return <DeviceWindow kind={device === 'debugger' ? 'desktop' : 'instrument'} locale={locale} title={tr(locale, zh, en)} className="coding-device">
    <div className="coding-device-console" data-workbench={workbench || undefined}>
      <div className="coding-device-controls">{controls}</div>
      <div className="coding-device-readout">{children}</div>
    </div>
  </DeviceWindow>
}
