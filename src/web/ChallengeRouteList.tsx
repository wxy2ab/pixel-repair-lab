import { useRef } from 'react'
import type { Locale } from '../shared/types'
import { challengeDifficultyLabels, challengeTypeLabels, type ChallengeType } from './challengeModel'
import type { ChallengeRoute } from './challengeRoutes'
import { tr } from './text'
import './challenge-routes.css'

const stepLabels = {
  cleared: { zh: '已通关', en: 'Cleared' },
  skipped: { zh: '已跳过', en: 'Skipped' },
  next: { zh: '推荐下一关', en: 'Suggested next' },
  pending: { zh: '待挑战', en: 'To play' },
}

type Props = {
  routes: readonly ChallengeRoute[]
  skippedIds: readonly string[]
  selectedType?: ChallengeType
  locale: Locale
  onSelect: (type: ChallengeType) => void
  onSetSkipped: (id: string, skipped: boolean) => void
  onOpen: (id: string) => void
}

export function ChallengeRouteList({ routes, skippedIds, selectedType, locale, onSelect, onSetSkipped, onOpen }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const route = routes.find(({ type }) => type === selectedType) ?? routes[0]
  if (!route) return null

  const skipped = new Set(skippedIds)
  const next = route.next
  const nextId = next?.level.id

  function skipNext(id: string) {
    if (route.entries.length - route.completed - route.skipped === 1) heading.current?.focus({ preventScroll: true })
    onSetSkipped(id, true)
  }

  return <section id="challenge-routes" className="challenge-routes" aria-labelledby="challenge-routes-title" tabIndex={-1}>
    <div className="challenge-routes-heading">
      <h3 id="challenge-routes-title">{t('闯关路线', 'Challenge routes')}</h3>
      <a href="#challenge-browse" className="challenge-routes-browse">{t('自由选关', 'Browse challenges')} <span aria-hidden="true">↓</span></a>
    </div>
    <div className="challenge-route-options">
      {routes.map(option => {
        const label = challengeTypeLabels[option.type][locale]
        const titleId = 'challenge-route-name-' + option.type
        const descriptionId = 'challenge-route-summary-' + option.type
        const progress = option.completed / option.entries.length
        return <button key={option.type} type="button" className="challenge-route-option" data-challenge-route={option.type}
          aria-pressed={option.type === route.type} aria-controls="challenge-route-detail" aria-labelledby={titleId}
          aria-describedby={descriptionId} onClick={() => onSelect(option.type)}>
          <strong id={titleId}>{label}</strong>
          <span id={descriptionId} className="challenge-route-description">
            <span className="challenge-route-count">
              <span>{t('已通关', 'Cleared')} <b>{option.completed} / {option.entries.length}</b></span>
              {option.skipped > 0 && <span>{t(`跳过 ${option.skipped}`, `${option.skipped} skipped`)}</span>}
            </span>
            <span className="challenge-route-meter" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
            <span className="challenge-route-overview-next">{option.next
              ? <>{t('下一关', 'Next')} · {option.next.level.title[locale]}</>
              : option.skipped > 0 ? t('剩余关卡已跳过', 'Remaining challenges skipped') : t('全线通关', 'Route cleared')}
            </span>
          </span>
        </button>
      })}
    </div>

    <section id="challenge-route-detail" className="challenge-route-detail" aria-labelledby="challenge-route-detail-title">
      <div className="challenge-route-detail-heading">
        <h4 id="challenge-route-detail-title" ref={heading} tabIndex={-1}>{challengeTypeLabels[route.type][locale]}</h4>
        <span>{t('从易到难', 'Easier to harder')}</span>
      </div>
      <div className="challenge-route-next">
        <p className="challenge-route-next-copy" aria-live="polite">
          {next ? <><span>{stepLabels.next[locale]}</span><strong>{next.level.title[locale]}</strong></>
            : <strong>{route.skipped > 0
              ? t('可以回玩已跳过的关卡。', 'You can go back to any skipped challenge.')
              : t('这条路线已全部通关！', 'Every challenge on this route is cleared!')}</strong>}
        </p>
        {nextId && <div className="challenge-route-next-actions">
          <button type="button" className="primary-button" data-route-next={nextId} onClick={() => onOpen(nextId)}>
            {t('玩下一关', 'Play next')}
          </button>
          <button type="button" className="subtle-button" data-route-skip={nextId} onClick={() => skipNext(nextId)}>
            {t('跳过这关', 'Skip this challenge')}
          </button>
        </div>}
      </div>
      <ol className="challenge-route-steps">
        {route.entries.map(({ level, difficulty, won }, index) => {
          const id = level.id
          const status = won ? 'cleared' : skipped.has(id) ? 'skipped' : id === nextId ? 'next' : 'pending'
          const titleId = 'challenge-route-step-title-' + id
          const statusId = 'challenge-route-step-status-' + id
          return <li key={id} className="challenge-route-step" data-route-step={id} data-route-status={status}>
            <button type="button" className="challenge-route-step-open" aria-labelledby={titleId} aria-describedby={statusId}
              aria-current={status === 'next' ? 'step' : undefined} onClick={() => onOpen(id)}>
              <span className="challenge-route-step-number" aria-hidden="true">{index + 1}</span>
              <span className="challenge-route-step-info">
                <strong id={titleId}>{level.title[locale]}</strong>
                <span id={statusId} className="challenge-route-step-meta">
                  <span className="challenge-route-step-status">{stepLabels[status][locale]}</span>
                  <span className="challenge-difficulty" data-difficulty={difficulty}>{challengeDifficultyLabels[difficulty][locale]}</span>
                </span>
              </span>
              <span aria-hidden="true" className="challenge-route-step-arrow">→</span>
            </button>
            {status === 'skipped' && <button type="button" className="text-button challenge-route-undo" data-route-unskip={id}
              aria-label={t(`取消跳过 ${level.title.zh}`, `Unskip ${level.title.en}`)}
              onClick={event => {
                event.currentTarget.parentElement?.querySelector('button')?.focus()
                onSetSkipped(id, false)
              }}>
              {t('取消跳过', 'Unskip')}
            </button>}
          </li>
        })}
      </ol>
    </section>
  </section>
}
