import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArenaLevel } from '../shared/advanced'
import type { Level, Locale } from '../shared/types'
import { SavedArenaScores, savedArenaTime } from './ArenaPanels'
import type { ArenaMatchMode } from './arenaMatchProgress'
import { SavedArenaBoard } from './SavedArenaBoard'
import { UnfinishedArenaComparison } from './UnfinishedArenaComparison'
import { useUnfinishedArenaMatches, type UnfinishedArenaMatch } from './unfinishedArenaMatches'
import { tr } from './text'
import './unfinished-arena-matches.css'

type Props = {
  levels: readonly Level[]
  locale: Locale
  onContinue: (levelId: string, mode: ArenaMatchMode) => boolean
  onRestart: (levelId: string, mode: ArenaMatchMode) => boolean
  onAbandon: (levelId: string, mode: ArenaMatchMode) => boolean
  onBack: () => void
  onBrowse: () => void
}

function matchKey({ levelId, mode }: UnfinishedArenaMatch) {
  return `${levelId}-${mode}`
}

export function UnfinishedArenaMatches({ levels, locale, onContinue, onRestart, onAbandon, onBack, onBrowse }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const modeName = (mode: ArenaMatchMode) => mode === 'timed' ? t('紧张', 'Timed') : t('从容', 'Relaxed')
  const heading = useRef<HTMLHeadingElement>(null)
  const compareButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [abandoning, setAbandoning] = useState<{ level: ArenaLevel; mode: ArenaMatchMode }>()
  const [abandonFailed, setAbandonFailed] = useState(false)
  const { matches, loading, failed, reload } = useUnfinishedArenaMatches(levels, undefined, true)
  const entries = useMemo(() => {
    const arenaLevels = new Map(levels.flatMap(level => level.kind === 'arena' ? [[level.id, level]] : []))
    return matches.flatMap(match => {
      const level = arenaLevels.get(match.levelId)
      return level ? [{ level, ...match }] : []
    })
  }, [levels, matches])
  const selectedEntries = entries.filter(entry => selectedKeys.includes(matchKey(entry)))
  const canCompare = selectedEntries.length === 2
  const showSelection = entries.length >= 2 || selectedEntries.length > 0
  const savedTime = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'medium' })

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    if (loading || failed) return
    const available = selectedKeys.filter(key => entries.some(entry => matchKey(entry) === key))
    if (available.length === selectedKeys.length) return
    setSelectedKeys(available)
    if (comparing) {
      setComparing(false)
      heading.current?.focus()
    }
  }, [comparing, entries, failed, loading, selectedKeys])

  useEffect(() => {
    if (!abandoning || !dialog.current || dialog.current.open) return
    dialog.current.showModal()
    cancelButton.current?.focus()
  }, [abandoning])

  function selectMatch(key: string, checked: boolean) {
    setSelectedKeys(previous => {
      if (!checked) return previous.filter(selected => selected !== key)
      if (previous.length >= 2 || previous.includes(key)) return previous
      return [...previous, key]
    })
  }

  function continueMatch(levelId: string, mode: ArenaMatchMode) {
    if (!onContinue(levelId, mode)) reload()
  }

  function returnToList() {
    setComparing(false)
    window.requestAnimationFrame(() => (compareButton.current ?? heading.current)?.focus())
  }

  function closeConfirmation() {
    dialog.current?.close()
    setAbandoning(undefined)
    setAbandonFailed(false)
  }

  function confirmAbandon() {
    if (!abandoning) return
    if (!onAbandon(abandoning.level.id, abandoning.mode)) {
      setAbandonFailed(true)
      return
    }
    closeConfirmation()
    heading.current?.focus()
    reload()
  }

  if (comparing && canCompare) return <UnfinishedArenaComparison entries={selectedEntries} locale={locale}
    onContinue={continueMatch} onBack={returnToList} />

  return <section className="unfinished-arena" aria-labelledby="unfinished-arena-title">
    <div className="unfinished-arena-header">
      <h1 id="unfinished-arena-title" tabIndex={-1} ref={heading}>{t('未完成的对局', 'Unfinished matches')}</h1>
      <div className="unfinished-arena-actions">
        <button type="button" className="subtle-button" onClick={onBack}>{t('返回挑战场', 'Back to challenge arena')}</button>
        <button type="button" className="subtle-button" onClick={onBrowse}>{t('自由选关', 'Browse challenges')}</button>
      </div>
    </div>
    {loading && <p className="unfinished-arena-notice" role="status">{t('正在读取对局…', 'Loading matches…')}</p>}
    {failed && <div className="panel unfinished-arena-notice">
      <p role="alert">{t('暂时读不到保存的对局。', 'Saved matches could not be loaded.')}</p>
      <button type="button" className="subtle-button" onClick={reload}>{t('重试', 'Retry')}</button>
    </div>}
    {!loading && !failed && entries.length === 0 && <p className="panel unfinished-arena-notice">
      {t('还没有未完成的对局。', 'No unfinished matches yet.')}
    </p>}
    {showSelection && <div className="panel unfinished-arena-compare-tools">
      <span role="status">{t(`已选 ${selectedEntries.length} / 2`, `${selectedEntries.length} of 2 selected`)}</span>
      <button type="button" className="primary-button" ref={compareButton} disabled={!canCompare}
        onClick={() => setComparing(true)}>{t('对比所选', 'Compare selected')}</button>
    </div>}
    {entries.length > 0 && <div className="unfinished-arena-rows">{entries.map(entry => {
      const { level, mode, turn, scores, remainingMs, savedAt, board } = entry
      const key = matchKey(entry)
      const selected = selectedKeys.includes(key)
      const levelTitle = `unfinished-match-level-${key}`
      const modeTitle = `unfinished-match-mode-${key}`
      const description = `${levelTitle} ${modeTitle}`
      return <article key={key} className="panel unfinished-arena-row" aria-labelledby={description}
        data-unfinished-match={level.id} data-mode={mode} data-match-turn={turn} data-remaining-ms={remainingMs} data-match-saved-at={savedAt}
        data-selected-for-comparison={selected || undefined}>
        <div className="unfinished-arena-match-heading">
          <h2 id={levelTitle}>{level.title[locale]}</h2>
          <span id={modeTitle} className="unfinished-arena-mode">{modeName(mode)}</span>
          {showSelection && <label className="unfinished-arena-select">
            <input type="checkbox" checked={selected} disabled={canCompare && !selected}
              onChange={event => selectMatch(key, event.currentTarget.checked)} aria-describedby={description} />
            {t('加入对比', 'Add to comparison')}
          </label>}
        </div>
        <div className="unfinished-arena-snapshot">
          {board && <SavedArenaBoard level={level} board={board} locale={locale} testId="unfinished-arena-board" />}
          <dl className="unfinished-arena-detail">
            <div><dt>{t('当前回合', 'Turn')}</dt><dd>{turn} / {level.maxTurns}</dd></div>
            <div><dt>{t('剩余时间', 'Time left')}</dt><dd>{savedArenaTime(remainingMs, locale)}</dd></div>
            <div><dt>{t('保存时间', 'Saved at')}</dt><dd>{savedAt === undefined ? t('未记录', 'Unknown')
              : <time dateTime={new Date(savedAt).toISOString()}>{savedTime.format(savedAt)}</time>}</dd></div>
          </dl>
        </div>
        <SavedArenaScores level={level} scores={scores} locale={locale} numberOpponents={Boolean(board)} />
        <div className="unfinished-arena-actions">
          <button type="button" className="primary-button" onClick={() => continueMatch(level.id, mode)}
            aria-describedby={description}>{t('继续', 'Continue')}</button>
          <button type="button" className="subtle-button" onClick={() => { if (!onRestart(level.id, mode)) reload() }}
            aria-describedby={description}>{t('重新开始', 'Start over')}</button>
          <button type="button" className="subtle-button unfinished-arena-abandon" aria-haspopup="dialog"
            onClick={() => setAbandoning({ level, mode })} aria-describedby={description}>{t('放弃对局', 'Abandon match')}</button>
        </div>
      </article>
    })}</div>}
    {abandoning && <dialog className="panel unfinished-arena-dialog" ref={dialog} aria-modal="true"
      aria-labelledby="unfinished-arena-confirm-title" aria-describedby="unfinished-arena-confirm-match unfinished-arena-confirm-detail"
      onCancel={event => { event.preventDefault(); closeConfirmation() }}>
      <h2 id="unfinished-arena-confirm-title">{t('放弃这局？', 'Abandon this match?')}</h2>
      <p id="unfinished-arena-confirm-match">{abandoning.level.title[locale]} · {modeName(abandoning.mode)}</p>
      <p id="unfinished-arena-confirm-detail">{t('这局的进度会清除。代码草稿和已有成绩会保留。',
        'This will clear the match progress. Your code draft and recorded scores will be kept.')}</p>
      {abandonFailed && <p className="unfinished-arena-error" role="alert">{t('暂时无法放弃这局，请重试。', 'This match could not be abandoned. Try again.')}</p>}
      <div className="unfinished-arena-actions">
        <button type="button" className="subtle-button" ref={cancelButton} onClick={closeConfirmation}>{t('取消', 'Cancel')}</button>
        <button type="button" className="subtle-button unfinished-arena-confirm" onClick={confirmAbandon}>{t('确认放弃', 'Confirm abandon')}</button>
      </div>
    </dialog>}
  </section>
}
