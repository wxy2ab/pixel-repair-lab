import type { Level, Locale } from '../shared/types'
import { SavedArenaScores, savedArenaTime } from './ArenaPanels'
import type { ArenaMatchMode } from './arenaMatchProgress'
import { SavedArenaBoard } from './SavedArenaBoard'
import { tr } from './text'
import { useUnfinishedArenaMatches } from './unfinishedArenaMatches'
import './recent-arena-match.css'

type Props = {
  levels: readonly Level[]
  locale: Locale
  onOpen: (levelId: string, mode: ArenaMatchMode) => boolean
  onAll: () => void
}

export function RecentArenaMatch({ levels, locale, onOpen, onAll }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { matches, loading, failed, reload } = useUnfinishedArenaMatches(levels, 1, true)
  const [match] = matches
  const level = match && levels.find(candidate => candidate.id === match.levelId)
  const saved = match && level?.kind === 'arena' ? { match, level } : undefined
  const remainingMs = saved?.match.remainingMs

  return <section className="recent-arena-match" aria-labelledby="recent-arena-match-title">
    <h2 id="recent-arena-match-title">{t('最近保存的对局', 'Most recent saved match')}</h2>
    {saved ? <div className="recent-arena-match-summary">
      <div className="recent-arena-match-info">
        <strong id="recent-arena-level">{saved.level.title[locale]}</strong>
        <p id="recent-arena-position">
          <span className="recent-arena-mode" data-mode={saved.match.mode}>
            {saved.match.mode === 'timed' ? t('紧张模式', 'Timed mode') : t('从容模式', 'Relaxed mode')}
          </span>
          <span>{t(`第 ${saved.match.turn} / ${saved.level.maxTurns} 回合`, `Turn ${saved.match.turn} / ${saved.level.maxTurns}`)}</span>
          <span className="recent-arena-time" data-remaining-ms={remainingMs}>
            {remainingMs !== undefined && t('剩余时间 ', 'Time left ')}
            <strong>{savedArenaTime(remainingMs, locale)}</strong>
          </span>
        </p>
        <SavedArenaScores level={saved.level} scores={saved.match.scores} locale={locale} numberOpponents={Boolean(saved.match.board)} />
      </div>
      {saved.match.board && <SavedArenaBoard level={saved.level} board={saved.match.board} locale={locale} testId="recent-arena-board" />}
    </div> : <p className="recent-arena-match-note" role="status">
      {loading ? t('正在读取对局…', 'Loading saved match…')
        : failed ? t('暂时读不到保存的对局。', 'Saved match could not be loaded.')
          : t('还没有未完成的对局。', 'No unfinished matches yet.')}
    </p>}
    <div className="recent-arena-match-actions">
      {saved && <button type="button" className="primary-button" data-recent-match={saved.match.levelId}
        data-mode={saved.match.mode} data-match-turn={saved.match.turn} aria-describedby="recent-arena-level recent-arena-position"
        onClick={() => { if (!onOpen(saved.match.levelId, saved.match.mode)) reload() }}>
        {t('打开这局', 'Open match')}
      </button>}
      <button type="button" className="subtle-button" onClick={onAll}>
        {t('查看全部未完成的对局', 'View all unfinished matches')}
      </button>
    </div>
  </section>
}
