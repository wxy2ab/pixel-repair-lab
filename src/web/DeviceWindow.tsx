import { useId, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import './device-window.css'

type DeviceWindowProps = {
  locale: Locale
  title: string
  kind?: 'instrument' | 'desktop' | 'terminal' | 'browser'
  caption?: string
  className?: string
  children: ReactNode
}

export function DeviceWindow({ locale, title, kind = 'desktop', caption, className = '', children }: DeviceWindowProps) {
  const id = useId()
  return <section lang={locale} className={`device-window ${className}`} data-device={kind} aria-labelledby={id}>
    <header className="device-window__bar">
      <span className="device-window__icon" aria-hidden="true" />
      <h2 id={id}>{title}</h2>
      {caption && <span className="device-window__caption">{caption}</span>}
    </header>
    <div className="device-window__body">{children}</div>
  </section>
}
