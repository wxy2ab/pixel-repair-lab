import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { meterDisplay } from './BreadboardMeter'
import { pinName } from './breadboardRepairLabels'
import type { RepairReplayFrame } from './breadboardRepairReplay'
import { replayStepFilters, replayStepIndices, type ReplayStepFilter } from './breadboardReplaySteps'
import { tr } from './text'
import './breadboard-replay-steps.css'

const categoryLabels: Record<ReplayStepFilter, Record<Locale, string>> = {
  all: { zh: '完整过程', en: 'Full process' },
  measure: { zh: '测量', en: 'Measurements' },
  diagnosis: { zh: '判断', en: 'Diagnosis' },
  edit: { zh: '改线', en: 'Wiring' },
  retest: { zh: '复测', en: 'Retests' },
  test: { zh: '试灯', en: 'Light tests' },
}

type Props = {
  locale: Locale
  frames: readonly RepairReplayFrame[]
  visibleIndices: readonly number[]
  currentIndex: number
  category: ReplayStepFilter
  onCategoryChange: (category: ReplayStepFilter) => void
  onStepSelect: (globalIndex: number) => void
  describeStep: (frame: RepairReplayFrame) => string
  children?: ReactNode
}

function stepDetail({ action, bench }: RepairReplayFrame, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (action.kind === 'test') {
    const button = bench.pressed === undefined ? '' : (bench.pressed ? t('按下', 'Pressed') : t('松开', 'Released')) + ' · '
    return button + 'D2 ' + (action.observation.d2 ? 'HIGH' : 'LOW') + ' · D13 ' + (action.observation.d13 ? 'HIGH' : 'LOW')
  }
  if (action.kind !== 'measure' && action.kind !== 'retest' && action.kind !== 'button' && action.kind !== 'power') return
  if (!bench.red || !bench.black) return
  const tips = t('红 ', 'Red ') + pinName(bench.red) + ' · ' + t('黑 ', 'Black ') + pinName(bench.black)
  return bench.reading ? tips + ' · ' + meterDisplay(bench.reading, locale).value : tips
}

export default function BreadboardReplayStepList({ locale, frames, visibleIndices, currentIndex, category, onCategoryChange, onStepSelect, describeStep, children }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const heading = useId()
  const list = useRef<HTMLOListElement>(null)
  const activeRow = useRef<HTMLButtonElement>(null)
  const categories = useMemo(() => replayStepFilters.map(filter => ({
    filter, count: replayStepIndices(frames, filter).length,
  })), [frames])

  // Keep the selected row visible without moving the page or taking focus from playback.
  useEffect(() => {
    if (!list.current || !activeRow.current) return
    const row = activeRow.current.getBoundingClientRect()
    const top = list.current.getBoundingClientRect().top + list.current.clientTop
    const bottom = top + list.current.clientHeight
    if (row.top < top) list.current.scrollTop += row.top - top
    else if (row.bottom > bottom) list.current.scrollTop += row.bottom - bottom
  }, [currentIndex, category, visibleIndices])

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, position: number) {
    let next: number
    switch (event.key) {
      case 'ArrowDown': next = Math.min(position + 1, visibleIndices.length - 1); break
      case 'ArrowUp': next = Math.max(position - 1, 0); break
      case 'Home': next = 0; break
      case 'End': next = visibleIndices.length - 1; break
      default: return
    }
    event.preventDefault()
    const index = visibleIndices[next]
    list.current?.querySelector<HTMLButtonElement>('[data-frame-index="' + index + '"]')?.focus({ preventScroll: true })
    onStepSelect(index)
  }

  return <div className="repair-step-directory" data-testid="bread-replay-steps" role="region" aria-labelledby={heading}>
    <h4 id={heading}>{t('步骤清单', 'Step list')}</h4>
    <div className="repair-step-filters" role="group" aria-label={t('按步骤类型筛选', 'Filter by step type')}>
      {categories.map(({ filter, count }) => <button key={filter} type="button" data-testid={'bread-replay-filter-' + filter}
        aria-pressed={category === filter} onClick={() => onCategoryChange(filter)}>
        {categoryLabels[filter][locale]} <span aria-hidden="true">{count}</span>
      </button>)}
    </div>
    {visibleIndices.length ? <ol className="repair-step-list" ref={list} data-testid="bread-replay-step-list" aria-labelledby={heading}>
      {visibleIndices.map((index, position) => {
        const frame = frames[index]
        const selected = currentIndex === index
        const detail = stepDetail(frame, locale)
        return <li key={frame.id} value={index + 1}>
          <button type="button" ref={selected ? activeRow : undefined} data-frame-index={index} data-kind={frame.action.kind}
            data-testid={'bread-replay-step-' + (index + 1)} aria-current={selected ? 'step' : undefined}
            tabIndex={selected ? 0 : -1} onClick={() => onStepSelect(index)} onKeyDown={event => moveFocus(event, position)}>
            <span className="repair-step-number"><span className="sr-only">{t('完整过程第 ', 'Full process step ')}</span>{index + 1}<span className="sr-only">{t(' 步', '')}</span></span>
            <span className="repair-step-text">{describeStep(frame)}{detail && <small>{detail}</small>}</span>
          </button>
        </li>
      })}
    </ol> : <div className="repair-step-empty" data-testid="bread-replay-steps-empty" role="status">
      {t('这张维修记录里没有这类步骤。', 'This repair record has no steps of this type.')}
      <button type="button" onClick={() => onCategoryChange('all')}>{t('看完整过程', 'View full process')}</button>
    </div>}
    {children}
  </div>
}
