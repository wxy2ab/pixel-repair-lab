import type { DragEvent, PointerEvent } from 'react'
import type { BreadboardPart, BreadboardPartKind } from '../shared/breadboard'
import type { Locale } from '../shared/types'
import { tr } from './text'

const kinds: BreadboardPartKind[] = ['button', 'resistor', 'led']

export function partLabel(kind: BreadboardPartKind, locale: Locale) {
  if (kind === 'button') return tr(locale, '按钮', 'Button')
  if (kind === 'resistor') return tr(locale, '电阻', 'Resistor')
  return 'LED'
}

export function PartBody({ kind, on = false }: { kind: BreadboardPartKind; on?: boolean }) {
  if (kind === 'resistor') return <g aria-hidden="true">
    <path d="M-27 0H27" className="bread-tin" />
    <path d="M-21 -6Q-17 -10 -11 -7H11Q17 -10 21 -6V6Q17 10 11 7H-11Q-17 10 -21 6Z"
      fill="#ebcd96" stroke="#8d6747" strokeWidth="1.4" />
    {['#ce672f', '#ce672f', '#79523c', '#ad954e'].map((color, i) =>
      <path key={i} d={'M' + [-14, -7, 0, 14][i] + ' -6v12'} stroke={color} strokeWidth="3" />)}
    <path d="M-18 -4H18" stroke="#fff2cb" opacity=".62" strokeWidth="1.3" />
  </g>
  if (kind === 'button') return <g aria-hidden="true">
    <path d="M-24 0H24" className="bread-tin" />
    <rect x="-16" y="-12" width="32" height="25" rx="4" fill="#3e4b48" stroke="#27332f" strokeWidth="1.5" />
    <circle r="9" cy={on ? 1 : -1} fill={on ? '#ca8147' : '#f2b65d'} stroke="#926233" strokeWidth="1.5" />
    <path d={on ? 'M-4 0h8' : 'M-5 -4q5 -4 10 0'} stroke="#ffdea0" fill="none" strokeLinecap="round" />
    <circle cx="-12" cy="9" r="1.2" fill="#b0bab4" /><circle cx="12" cy="-8" r="1.2" fill="#b0bab4" />
  </g>
  return <g aria-hidden="true">
    {on && <g stroke="#e79d37" strokeWidth="2.2" strokeLinecap="round">
      <path d="M-19 -5l-4 -2 M-15 -14l-3 -4 M19 -5l4 -2 M15 -14l3 -4 M0 -18v-4" />
    </g>}
    <path d="M-6 8v8 M6 8v8" className="bread-tin" />
    <path d="M-11 7V-2a11 11 0 0 1 22 0v9Z" fill={on ? '#ff8141' : '#bc635c'} stroke="#794942" strokeWidth="1.4" />
    <path d="M-7 -2q0 -6 6 -7" fill="none" stroke={on ? '#fff3b2' : '#efa59b'} strokeWidth="2.8" strokeLinecap="round" />
    <rect x="-13" y="6" width="26" height="4" rx="1.3" fill={on ? '#feaa54' : '#b9695d'} stroke="#854b41" />
  </g>
}

type TrayProps = {
  locale: Locale; parts: BreadboardPart[]; chosen?: BreadboardPartKind; locked?: boolean
  onChoose: (kind: BreadboardPartKind) => void
  onDrag: (event: DragEvent, kind: BreadboardPartKind) => void; onEnd: () => void
  onPointer: (event: PointerEvent, kind: BreadboardPartKind) => void
  onFlip: () => void; onRemove: (kind: BreadboardPartKind) => void
}

export function BreadboardPartsTray({ locale, parts, chosen, locked, onChoose, onDrag, onEnd, onPointer, onFlip, onRemove }: TrayProps) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <section className="bread-bin" aria-label={t('元件盒', 'Parts box')}>
    <h3>{locked ? t('板上元件', 'Fitted components') : t('元件盒', 'Parts box')}</h3>
    <div className="bread-compartments">
      {kinds.map(kind => {
        const part = parts.find(item => item.kind === kind)
        const label = partLabel(kind, locale)
        return <div className="bread-compartment" key={kind} data-picked={chosen === kind}>
          <button type="button" className="bread-part-pick" data-testid={'bread-tray-' + kind}
            aria-pressed={chosen === kind} disabled={locked} draggable={!locked} onClick={() => onChoose(kind)}
            onPointerDown={event => onPointer(event, kind)} onDragStart={event => onDrag(event, kind)} onDragEnd={onEnd}>
            <svg viewBox="-30 -18 60 36" focusable="false" aria-hidden="true"><PartBody kind={kind} /></svg>
            <strong>{label}</strong>
            <span>{part ? kind === 'led' ? 'A+ ' + part.pins[0] + ' · K− ' + part.pins[1] : part.pins.join(' · ')
              : kind === 'resistor' ? '330 Ω' : kind === 'led' ? t('红色', 'Red') : t('常开', 'Normally open')}</span>
          </button>
          {part && !locked && <div className="bread-part-tools">
            {kind === 'led' && <button type="button" data-testid="bread-flip-led" onClick={onFlip}
              aria-label={t('翻转 LED', 'Flip LED')}>{t('翻转', 'Flip')}</button>}
            <button type="button" data-testid={'bread-remove-' + kind} onClick={() => onRemove(kind)}
              aria-label={t('拔出', 'Remove ') + label}>{t('拔出', 'Lift out')}</button>
          </div>}
        </div>
      })}
    </div>
  </section>
}
