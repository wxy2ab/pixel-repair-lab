import type { Locale } from '../shared/types'
import type { ArenaChallengeDraft } from './challengeDraft'
import { challengeTypeLabels } from './challengeModel'
import type { ChallengeContinuation } from './challengeRoutes'
import { tr } from './text'
import './continue-challenge.css'

type Props = {
  continuation?: ChallengeContinuation
  locale: Locale
  arenaMode?: ArenaChallengeDraft['mode']
  hasArenaMatch?: boolean
  onPlay: (id: string) => void
  onRestart?: () => void
  onRoutes: () => void
  onBrowse: () => void
}

export function ContinueChallenge({ continuation, locale, arenaMode, hasArenaMatch, onPlay, onRestart, onRoutes, onBrowse }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { route, last, target, status } = continuation ?? {}
  const resume = status === 'resume'
  const title = t('继续闯关', 'Continue challenges')

  return <section className="continue-challenge" aria-labelledby="continue-challenge-title" data-continue-status={status ?? 'new'}>
    <div className="continue-challenge-details">
      <h2 id="continue-challenge-title">{title}</h2>
      {route && <div className="continue-challenge-route">
        <p>
          <strong>{challengeTypeLabels[route.type][locale]}</strong>
          <span data-testid="continue-challenge-progress">
            {t('已通关', 'Cleared')} <b>{route.completed} / {route.entries.length}</b>
          </span>
        </p>
        <progress aria-label={t('路线通关进度', 'Route progress')} value={route.completed} max={route.entries.length} />
      </div>}
      {last && last.level.id !== target?.level.id && <p className="continue-challenge-last">
        <span>{t('上次关卡', 'Last challenge')}</span>
        <strong>{last.level.title[locale]}</strong>
        <span>{last.won ? t('已通关', 'Cleared') : t('已跳过', 'Skipped')}</span>
      </p>}
      {target && <p className="continue-challenge-target">
        <span>{resume ? t('上次未通关', 'Not yet cleared') : t('推荐下一关', 'Suggested next')}</span>
        <strong>{target.level.title[locale]}</strong>
        {arenaMode && <span className="continue-challenge-mode" data-continue-mode={arenaMode}>
          {arenaMode === 'timed' ? t('紧张模式', 'Timed mode') : t('从容模式', 'Relaxed mode')}
        </span>}
        {hasArenaMatch && <span data-testid="saved-arena-match">{t('对局已保存', 'Match saved')}</span>}
      </p>}
      {status === 'cleared' && <p className="continue-challenge-target">{t('这条路线已全部通关！', 'You cleared every challenge on this route!')}</p>}
      {status === 'skipped' && <p className="continue-challenge-target">{t('剩余关卡已跳过，可回到路线重玩。', 'The remaining challenges were skipped. Revisit them on the route.')}</p>}
    </div>
    <div className="continue-challenge-actions">
      {target && <button type="button" className="primary-button" data-continue-challenge={target.level.id}
        onClick={() => onPlay(target.level.id)}>
        {resume ? t('继续闯关', 'Continue') : t('挑战下一关', 'Play next challenge')}
      </button>}
      {onRestart && <button type="button" className="subtle-button" onClick={onRestart}>{t('重新开始', 'Start over')}</button>}
      <button type="button" className={target ? 'subtle-button' : 'primary-button'} onClick={onRoutes}>
        {route ? t('切换路线', 'Switch routes') : t('选择路线', 'Choose a route')}
      </button>
      <button type="button" className="subtle-button" onClick={onBrowse}>{t('自由选关', 'Browse challenges')}</button>
    </div>
  </section>
}
