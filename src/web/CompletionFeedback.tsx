import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Locale, Localized } from '../shared/types'
import type { CompletionMilestone } from './completionMilestone'
import { Icon } from './icons'
import { VictoryAction, type VictoryDestination } from './VictoryAction'
import { tr } from './text'
import './completion-feedback.css'

const headings: Record<CompletionMilestone['scope'], Localized> = {
  lesson: { zh: '本关完成', en: 'Level complete' },
  optional: { zh: '选做挑战通关', en: 'Optional challenge cleared' },
  topic: { zh: '知识点已学完', en: 'Topic complete' },
  unit: { zh: '学习模块已完成', en: 'Module complete' },
  course: { zh: '课程主线已完成', en: 'Course complete' },
  series: { zh: '系列挑战全部通关', en: 'Challenge series cleared' },
}

export function CompletionFeedback({ event, locale, destination, onDismiss }: {
  event?: CompletionMilestone
  locale: Locale
  destination?: VictoryDestination
  onDismiss: () => void
}) {
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement)
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  const progress = event?.progress
  const progressLabel = progress && (event.title[locale] !== progress.label[locale] ? progress.label[locale]
    : event.scope === 'series' ? tr(locale, '挑战关卡', 'Challenges') : tr(locale, '必修课节', 'Core lessons'))
  const announcement = event ? [
    headings[event.scope][locale], event.title[locale],
    progress && `${progressLabel} ${progress.done} / ${progress.total}`,
  ].filter(Boolean).join(' · ') : ''
  return createPortal(<>
    <span aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</span>
    {event && <CompletionCard key={event.levelId} event={event} locale={locale} progressLabel={progressLabel} destination={destination} onDismiss={onDismiss} />}
  </>, fullscreen ?? document.body)
}

function CompletionCard({ event, locale, progressLabel, destination, onDismiss }: {
  event: CompletionMilestone; locale: Locale; progressLabel?: string; destination?: VictoryDestination; onDismiss: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const dismiss = useEffectEvent(onDismiss)
  useEffect(() => {
    if (hovered || focused) return
    const timer = window.setTimeout(() => dismiss(), event.tier === 'stage' ? 9000 : 6000)
    return () => window.clearTimeout(timer)
  }, [event, hovered, focused])

  const progress = event.progress
  return <aside className="completion-feedback" data-testid="completion-feedback" data-tier={event.tier} data-scope={event.scope}
    aria-label={tr(locale, '完成反馈', 'Completion feedback')}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
    <div className="completion-feedback__emblem" aria-hidden="true">
      <span className="completion-feedback__sprout" />
      <span className="completion-feedback__seal">{event.tier === 'stage' ? '★' : '✓'}</span>
    </div>
    <div className="completion-feedback__copy" aria-hidden="true">
      <span className="completion-feedback__heading">{headings[event.scope][locale]}</span>
      <strong className="completion-feedback__title">{event.title[locale]}</strong>
      {progress && <div className="completion-feedback__progress">
        <span>{progressLabel}</span>
        <b>{progress.done} / {progress.total}</b>
        <div className="completion-feedback__meter" style={{
          '--completed': progress.done / progress.total,
          '--previous': Math.max(0, progress.done - 1) / progress.total,
        } as CSSProperties}><i /></div>
      </div>}
    </div>
    <button type="button" className="completion-feedback__dismiss" onClick={onDismiss}
      aria-label={tr(locale, '关闭完成反馈', 'Dismiss completion feedback')}>
      <Icon name="close" size={15} />
    </button>
    {destination && <VictoryAction destination={destination} />}
  </aside>
}
