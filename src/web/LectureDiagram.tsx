import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { LectureAnimation, LectureAnimationItem } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { tr } from './text'

/** These drawings show the device state described by its adjacent value. */
function CircuitGlyph({ glyph }: { glyph: NonNullable<LectureAnimationItem['glyph']> }) {
  const on = glyph === 'lamp-on' || glyph === 'switch-closed' || glyph === 'diode-forward' || glyph === 'transistor-on'
  return <svg className="lecture-device" viewBox="0 0 72 48" data-glyph={glyph} data-on={on}
    aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    {glyph.startsWith('lamp') ? <>
      <path d="M28 33h16m-14 4h12m-10 4h8" />
      <path className="lecture-device__glass" d="M28 32c0-7-6-8-6-16a14 14 0 0 1 28 0c0 8-6 10-6 16Z" />
      <path d="m31 17 3 4 2-4 2 4 3-4" />
      {on && <path className="lecture-device__rays" d="m14 8-4-2m4 12H8m7 8-4 3M58 8l4-2m-4 12h6m-7 8 4 3" />}
    </> : glyph.startsWith('switch') ? <>
      <path d="M5 30h15m32 0h15" /><circle cx="23" cy="30" r="3" /><circle cx="49" cy="30" r="3" />
      <g className="lecture-device__lever" style={{ transform: on ? 'rotate(0deg)' : 'rotate(-32deg)' }}>
        <path d="M26 30h20" /><path strokeWidth="5" d="M32 30h10" />
      </g>
    </> : glyph.startsWith('diode') ? <>
      <path d="M3 25h66" />
      <path d="M5 14h7m-3.5-3.5v7M61 14h6" strokeWidth="1.6" />
      <g className="lecture-device__diode" style={{ transform: on ? 'rotate(0deg)' : 'rotate(180deg)' }}>
        <rect x="18" y="16" width="36" height="18" rx="7" fill="#d49463" stroke="#f7c79b" />
        <path d="M45 17v16" stroke="#293d42" strokeWidth="5" />
      </g>
      <path className="lecture-device__direction" d={on ? 'M25 6h21m-4-3 4 3-4 3' : 'M25 6h15m5-3v6'} />
    </> : <>
      <path d="M4 25h22m3-12v23m1-16 15-9V4m-15 25 15 9v6" />
      <path d="m38 31 7 7-9-2" fill="currentColor" />
      <path className="lecture-device__direction" d={on ? 'M57 12v21m-3-4 3 4 3-4' : 'M57 12v12m-4 5h8'} />
    </>}
  </svg>
}

export function LectureDiagram({ animation, step, locale }: {
  animation: LectureAnimation; step: number; locale: Locale
}) {
  const frame = animation.frames[step]
  const previous = animation.frames[step - 1]
  const board = useRef<HTMLDivElement>(null)
  const positions = useRef(new Map<string, { left: number; top: number }>())
  const previousItems = new Map(previous?.items.map(item => [item.id, item]))
  const removed = previous?.items.filter(old => !frame.items.some(item => item.id === old.id)) ?? []
  const deviceChain = animation.layout === 'pipeline' && frame.items.length <= 3 && frame.items.every(item => item.glyph)
  const currentFlows = deviceChain && frame.items.some(item => item.glyph === 'lamp-on')
  const t = (zh: string, en: string) => tr(locale, zh, en)

  useLayoutEffect(() => {
    if (!board.current) return
    const origin = board.current.getBoundingClientRect()
    const next = new Map<string, { left: number; top: number }>()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const running: Animation[] = []
    for (const element of board.current.querySelectorAll<HTMLElement>('[data-item]')) {
      const id = element.dataset.item!
      const rect = element.getBoundingClientRect()
      const point = { left: rect.left - origin.left, top: rect.top - origin.top }
      const from = positions.current.get(id)
      next.set(id, point)
      if (reduce || !positions.current.size || !element.animate) continue
      if (!from) {
        running.push(element.animate([{ opacity: .2, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 300, easing: 'ease-out' }))
      } else {
        const x = from.left - point.left
        const y = from.top - point.top
        if (Math.abs(x) > 1 || Math.abs(y) > 1) {
          running.push(element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0,0)' }],
            { duration: 400, easing: 'cubic-bezier(.2,.7,.25,1)' }))
        }
      }
    }
    positions.current = next
    return () => running.forEach(animation => animation.cancel())
  }, [frame, locale])

  return <div className="lecture-figure">
    <div ref={board} className={'diagram diagram-' + animation.layout} role="list" aria-label={t('当前画面', 'Current scene')}
      data-device-chain={deviceChain || undefined} data-conducting={currentFlows || undefined}
      style={{ '--diagram-size': Math.min(4, Math.ceil(Math.sqrt(frame.items.length))) } as CSSProperties}>
      {frame.items.map(item => {
        const old = previousItems.get(item.id)
        const before = old?.value?.[locale]
        const value = item.value?.[locale]
        const changed = old && (before !== value || old.swatch !== item.swatch || old.height !== item.height || old.glyph !== item.glyph)
        // Long instructions stay on one line of thought. A numeric reading, colour or short state can be compared at a glance.
        const showBefore = before && value && before !== value && before.length <= 13 && value.length <= 18 && !item.glyph
        return <div key={item.id} role="listitem" data-item={item.id} data-changed={changed || undefined}
          className={'diagram-item diagram-' + (item.state ?? 'neutral')}
          style={{ '--bar': (item.height ?? 55) + '%' } as CSSProperties}>
          {animation.layout === 'bars' && <div className="diagram-bar-well" aria-hidden="true"><span className="diagram-bar" /></div>}
          {item.glyph && <CircuitGlyph glyph={item.glyph} />}
          {item.symbol && <span className="diagram-symbol" aria-hidden="true">{item.symbol}</span>}
          {item.swatch && <span className="diagram-swatch" style={{ backgroundColor: item.swatch }} aria-hidden="true" />}
          <div className="diagram-label">{item.label[locale]}</div>
          {value && <div className="diagram-value">
            {showBefore && <span className="diagram-before">{before} → </span>}
            <strong key={value}>{value}</strong>
          </div>}
          {item.annotation && <div className="diagram-annotation" key={item.annotation[locale]}>{item.annotation[locale]}</div>}
        </div>
      })}
    </div>
    {removed.length > 0 && previous && removed.length < previous.items.length &&
      <div className="diagram-exits">
        <span>{t('移出画面', 'Left the scene')}</span>
        {removed.map(item => <s key={item.id}>{item.label[locale]}</s>)}
      </div>}
  </div>
}
