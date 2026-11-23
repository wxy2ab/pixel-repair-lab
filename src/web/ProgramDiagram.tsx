import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { programGraphics, programSourceLines, type ProgramGraphic, type ProgramVisual } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './program-diagram.css'

type DiagramProps = {
  visual: ProgramVisual
  locale: Locale
  source: string
  order?: readonly string[]
  active?: string
  revealed?: ReadonlySet<string>
  values?: Readonly<Record<string, string>>
  onPick?: (block: ProgramGraphic) => void
  onMove?: (id: string, offset: -1 | 1) => void
  showFunctions?: boolean
  compact?: boolean
}

function GraphicSymbol({ icon }: { icon: ProgramGraphic['icon'] }) {
  const interior = icon === 'compute' ? <b>+</b>
    : icon === 'return' ? <b>↶</b>
      : <><i /><i /><i /></>
  return <span className="program-symbol" data-symbol={icon} aria-hidden="true">{interior}</span>
}

export function ProgramDiagram({ visual, locale, source, order, active, revealed, values, onPick, onMove,
  showFunctions = true, compact = false }: DiagramProps) {
  const titleId = useId()
  const tiles = useRef(new Map<string, HTMLLIElement>())
  const positions = useRef(new Map<string, DOMRect>())
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const codeLines = programSourceLines(source)
  const functions = new Map(visual.functions.map(group => [group.id, group]))
  const main = order ? order.flatMap(id => visual.main.find(block => block.id === id) ?? []) : visual.main
  const linkedFunction = programGraphics(visual).find(block => block.id === active)?.calls

  useLayoutEffect(() => {
    const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animations: Animation[] = []
    const next = new Map<string, DOMRect>()
    for (const [id, element] of tiles.current) {
      const current = element.getBoundingClientRect()
      const previous = positions.current.get(id)
      next.set(id, current)
      if (!motionAllowed || !previous) continue

      const x = previous.left - current.left
      const y = previous.top - current.top
      if (Math.abs(x) > 1 || Math.abs(y) > 1) {
        animations.push(element.animate([
          { transform: `translate(${x}px, ${y}px)` },
          { transform: 'translate(0, 0)' },
        ], { duration: 220, easing: 'ease-out' }))
      }
    }
    positions.current = next
    return () => animations.forEach(animation => animation.cancel())
  }, [order, revealed, showFunctions])

  function tile(block: ProgramGraphic, index?: number) {
    const converted = revealed?.has(block.id) === true
    const label = block.label[locale]
    const line = codeLines[block.line - 1] ?? ''
    const value = values && Object.hasOwn(values, block.id) ? values[block.id] : undefined
    const linked = block.calls ? functions.get(block.calls) : undefined
    const face = <>
      {converted ? <>
        <span className="program-code-marker" aria-hidden="true">{block.line}</span>
        <code data-visual-code data-testid="visual-revealed-code">{line}</code>
      </> : <>
        <GraphicSymbol icon={block.icon} />
        <span className="program-tile-label">{label}</span>
      </>}
      {value !== undefined && <span className="program-tile-value">{value}</span>}
    </>

    return <li className="program-graphic-tile" key={block.id} data-visual-block={block.id} data-graphic-icon={block.icon}
      ref={element => { if (element) tiles.current.set(block.id, element); else tiles.current.delete(block.id) }}
      data-graphic-line={block.line} data-active={active === block.id || undefined} data-revealed={converted || undefined}>
      {onPick ? <button type="button" className="program-graphic-face" data-visual-pick
        aria-pressed={active === block.id} aria-label={converted ? `${label} · ${line.trim()}` : undefined} onClick={() => onPick(block)}>{face}</button>
        : <div className="program-graphic-face">{face}</div>}
      {linked && showFunctions && !converted && !compact && <span className="program-call-link">
        <span aria-hidden="true">↳</span> {linked.title[locale]}
      </span>}
      {index !== undefined && onMove && <div className="program-moves">
        <button type="button" className="subtle-button" data-move="earlier" disabled={index === 0}
          aria-label={t(`把「${label}」往前移`, `Move ${label} earlier`)} onClick={() => onMove(block.id, -1)} />
        <button type="button" className="subtle-button" data-move="later" disabled={index + 1 === main.length}
          aria-label={t(`把「${label}」往后移`, `Move ${label} later`)} onClick={() => onMove(block.id, 1)} />
      </div>}
    </li>
  }

  return <section className="program-diagram" data-program-diagram data-compact={compact || undefined} aria-labelledby={titleId}>
    <h3 className="program-diagram-title" id={titleId}>{visual.title[locale]}</h3>
    <ol className="program-main-path" aria-label={t('主程序顺序', 'Main program order')}
      style={{ '--diagram-columns': main.length } as CSSProperties}>
      {main.map(tile)}
    </ol>
    {showFunctions && visual.functions.length > 0 && <div className="program-functions" aria-label={t('函数结构', 'Function structure')}>
      {visual.functions.map(group => <section className="program-function" key={group.id} aria-label={group.title[locale]}
        data-visual-function={group.id} data-linked={linkedFunction === group.id || undefined}>
        <h4 className="program-function-title">{group.title[locale]}</h4>
        <ol className="program-function-steps">
          {[group.header, ...group.steps].map(block => tile(block))}
        </ol>
      </section>)}
    </div>}
  </section>
}
