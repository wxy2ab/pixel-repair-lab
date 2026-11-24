import { useEffect, useRef, useState } from 'react'
import type { UnfinishedArenaMatch } from '../engine/arenaMatchPreview'
import type { ArenaLevel } from '../shared/advanced'
import type { Locale, Position } from '../shared/types'
import { actorTitle, SavedArenaScores, savedArenaTime } from './ArenaPanels'
import type { ArenaMatchMode } from './arenaMatchProgress'
import { SavedArenaBoard } from './SavedArenaBoard'
import { readSavedArenaChange, readSavedArenaChanges, type SavedArenaChange, type SavedArenaChangeKind } from './savedArenaChanges'
import { tr } from './text'
import './unfinished-arena-comparison.css'

type ComparedMatch = UnfinishedArenaMatch & { level: ArenaLevel }
type ChangeSelection = { source: 'board'; kind: SavedArenaChangeKind; position: Position }
  | { source: 'list'; kind: SavedArenaChangeKind; id: string }
type ChangePlayback = 'stopped' | 'playing' | 'paused'
type ChangeReview = { selection?: ChangeSelection; playback: ChangePlayback }

const changePlaybackDelayMs = 2500

const changeGroups = [
  { id: 'actors', zh: '芽芽和对手', en: 'Sprout and rivals' },
  { id: 'batteries', zh: '电池', en: 'Batteries' },
  { id: 'gates', zh: '通道', en: 'Gates' },
] as const
type ChangeCategory = 'all' | (typeof changeGroups)[number]['id']

type Props = {
  entries: readonly ComparedMatch[]
  locale: Locale
  onContinue: (levelId: string, mode: ArenaMatchMode) => void
  onBack: () => void
}

function groupForChange(kind: SavedArenaChangeKind) {
  if (kind === 'gate') return 'gates'
  if (kind === 'battery') return 'batteries'
  return 'actors'
}

function changesInCategory(changes: readonly SavedArenaChange[], category: ChangeCategory) {
  return category === 'all' ? changes : changes.filter(change => groupForChange(change.kind) === category)
}

function includesChange(selected: SavedArenaChange | undefined, change: SavedArenaChange) {
  return selected?.kind === change.kind && selected.entries.some(entry => entry.id === change.entries[0].id)
}

function listedSelection(change: SavedArenaChange): ChangeSelection {
  return { source: 'list', kind: change.kind, id: change.entries[0].id }
}

function modeName(mode: ArenaMatchMode, locale: Locale) {
  return mode === 'timed' ? tr(locale, '紧张', 'Timed') : tr(locale, '从容', 'Relaxed')
}

function formatDifference(delta: number, unit: 'turn' | 'point', locale: Locale) {
  const signed = delta > 0 ? `+${delta}` : String(delta)
  return tr(locale, `${signed} ${unit === 'turn' ? '回合' : '分'}`, `${signed} ${unit}${Math.abs(delta) === 1 ? '' : 's'}`)
}

function MatchDifferences({ first, second, locale }: { first: ComparedMatch; second: ComparedMatch; locale: Locale }) {
  const firstMode = modeName(first.mode, locale)
  const secondMode = modeName(second.mode, locale)
  const turnDelta = second.turn - first.turn
  const secondScores = new Map(second.scores.map(({ id, score }) => [id, score]))

  return <section className="panel arena-match-differences" aria-labelledby="arena-match-differences-title">
    <div className="arena-match-differences-heading">
      <h2 id="arena-match-differences-title">{tr(locale, '比分与回合差', 'Score and turn differences')}</h2>
      <p>{tr(locale, `「${secondMode}」相比「${firstMode}」`, `${secondMode} compared with ${firstMode}`)}</p>
    </div>
    <dl>
      <div data-change-metric="turn" data-delta={turnDelta}>
        <dt>{tr(locale, '回合', 'Turns')}</dt>
        <dd>{formatDifference(turnDelta, 'turn', locale)}</dd>
      </div>
      {first.scores.map(({ id, score }) => {
        const secondScore = secondScores.get(id)
        if (secondScore === undefined) return null
        const delta = secondScore - score
        return <div key={id} data-change-metric="score" data-actor-id={id} data-delta={delta}>
          <dt>{actorTitle(first.level, locale, id)}</dt>
          <dd>{formatDifference(delta, 'point', locale)}</dd>
        </div>
      })}
    </dl>
  </section>
}

function describeChange(change: SavedArenaChange, level: ArenaLevel, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const coordinates = ({ x, y }: Position) => `(${x}, ${y})`
  const gateState = (open: boolean) => open ? t('开着', 'Open') : t('关着', 'Closed')
  const absent = change.kind === 'battery' ? t('已取走', 'Collected') : t('未出现', 'Absent')
  const location = (position: Position | undefined) => position ? coordinates(position) : absent
  if (change.kind === 'gate') return change.entries.map(entry => ({
    id: entry.id,
    label: t(`通道 ${coordinates(change.positions[0])}`, `Gate ${coordinates(change.positions[0])}`),
    first: gateState(entry.first),
    second: gateState(entry.second),
  }))
  return change.entries.map(entry => {
    let label = actorTitle(level, locale, entry.id)
    if (change.kind === 'battery') {
      const itemIndex = level.items.findIndex(item => item.id === entry.id)
      const batteryName = itemIndex < 0 ? entry.id : itemIndex + 1
      label = level.combat ? t(`道具 ${entry.id}`, `Item ${entry.id}`) : t(`电池 ${batteryName}`, `Battery ${batteryName}`)
    }
    return {
      id: entry.id,
      label,
      first: location(entry.first),
      second: location(entry.second),
    }
  })
}

function MatchChangeList({
  changes, category, hasChanges, selected, currentIndex, playback, first, second, locale, onSelect, onCategoryChange, onTogglePlayback,
}: {
  changes: readonly SavedArenaChange[]
  category: ChangeCategory
  hasChanges: boolean
  selected: SavedArenaChange | undefined
  currentIndex: number
  playback: ChangePlayback
  first: ComparedMatch
  second: ComparedMatch
  locale: Locale
  onSelect: (change: SavedArenaChange, trigger: HTMLElement) => void
  onCategoryChange: (category: ChangeCategory, trigger: HTMLSelectElement) => void
  onTogglePlayback: (trigger: HTMLButtonElement) => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const list = useRef<HTMLDivElement>(null)
  const currentRow = useRef<HTMLButtonElement>(null)
  const groups = changeGroups.map(group => ({
    ...group, ...(group.id === 'batteries' && first.level.combat && { zh: '道具', en: 'Items' }),
    items: changesInCategory(changes, group.id),
  }))
  const current = changes[currentIndex]
  const previous = changes[currentIndex - 1]
  const next = changes[currentIndex + 1]
  const currentKind = current?.kind
  const currentId = current?.entries[0].id
  const total = changes.length
  const playing = playback === 'playing'
  const playbackLabel = playing ? t('暂停播放', 'Pause autoplay')
    : playback === 'paused' ? t('继续播放', 'Resume autoplay') : t('自动播放', 'Autoplay')
  const position = currentIndex < 0 ? t(`共 ${total} 条`, `${total} ${total === 1 ? 'change' : 'changes'}`)
    : t(`第 ${currentIndex + 1} 条，共 ${total} 条`, `${currentIndex + 1} of ${total}`)

  useEffect(() => {
    if (!list.current || !currentRow.current) return
    const viewport = list.current.getBoundingClientRect()
    const row = currentRow.current.getBoundingClientRect()
    if (row.top < viewport.top) list.current.scrollTop += row.top - viewport.top - 3
    else if (row.bottom > viewport.bottom) list.current.scrollTop += row.bottom - viewport.bottom + 3
  }, [category, currentId, currentKind])

  return <section className="panel arena-match-change-list" aria-labelledby="arena-match-change-list-title">
    <div className="arena-match-change-list-heading">
      <h2 id="arena-match-change-list-title">{t('变化清单', 'Change list')}</h2>
      {hasChanges && <span>{modeName(first.mode, locale)} / {modeName(second.mode, locale)}</span>}
    </div>
    {hasChanges && <>
      <label className="arena-match-change-filter">
        <span>{t('变化分类', 'Change category')}</span>
        <select value={category} onChange={event => onCategoryChange(event.currentTarget.value as ChangeCategory, event.currentTarget)}>
          <option value="all">{t('全部变化', 'All changes')}</option>
          {groups.map(group => <option key={group.id} value={group.id}>{t(group.zh, group.en)}</option>)}
        </select>
      </label>
      <div className="arena-match-change-navigation">
        <button type="button" className="subtle-button" aria-disabled={!previous}
          onClick={event => previous && onSelect(previous, event.currentTarget)}>{t('上一条', 'Previous')}</button>
        <span role="status">{position}</span>
        <button type="button" className="subtle-button" aria-disabled={!next}
          onClick={event => next && onSelect(next, event.currentTarget)}>{t('下一条', 'Next')}</button>
      </div>
      <button type="button" className="subtle-button arena-match-change-autoplay" data-playing={playing || undefined}
        aria-disabled={!next} onClick={event => onTogglePlayback(event.currentTarget)}>{playbackLabel}</button>
    </>}
    {total ? <div className="arena-match-change-groups" ref={list}>
      {groups.filter(group => group.items.length > 0).map(group => <section key={group.id} className="arena-match-change-group">
        <h3>{t(group.zh, group.en)}</h3>
        <ul>{group.items.map(change => {
          const [row] = describeChange(change, first.level, locale)
          const opponentNumber = change.kind === 'rivals' ? first.level.opponents.findIndex(opponent => opponent.id === row.id) + 1 : 0
          return <li key={row.id}>
            <button type="button" className="arena-match-change-list-row" data-change-list-kind={change.kind} data-change-list-id={row.id}
              ref={current === change ? currentRow : undefined} aria-pressed={includesChange(selected, change)}
              aria-current={current === change ? 'true' : undefined} onClick={event => onSelect(change, event.currentTarget)}>
              <span className="arena-match-change-list-name">
                {opponentNumber > 0 && <small className="saved-arena-opponent-number" aria-hidden="true">{opponentNumber}</small>}
                {row.label}
              </span>
              <span className="arena-match-change-list-summary">{row.first} / {row.second}</span>
            </button>
          </li>
        })}</ul>
      </section>)}
    </div> : <p>{hasChanges ? t('这一类没有变化。', 'No changes in this category.')
      : t('两份存档的棋盘一样。', 'The boards are the same in both saves.')}</p>}
  </section>
}

function SelectedMatchChange({ change, first, second, locale, onClear }: {
  change: SavedArenaChange; first: ComparedMatch; second: ComparedMatch; locale: Locale; onClear: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const rows = describeChange(change, first.level, locale)
  const firstName = modeName(first.mode, locale)
  const secondName = modeName(second.mode, locale)

  return <section className="panel arena-match-selected-change" aria-labelledby="arena-match-selected-change-title">
    <div className="arena-match-selected-change-heading">
      <h2 id="arena-match-selected-change-title">{t('选中的变化', 'Selected changes')}</h2>
      <button type="button" className="subtle-button" onClick={onClear}>{t('清除选择', 'Clear selection')}</button>
    </div>
    <table className="arena-match-change-table">
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">{t('变化对象', 'Changed item')}</span></th>
          <th scope="col" data-mode={first.mode}>{firstName}</th>
          <th scope="col" data-mode={second.mode}>{secondName}</th>
        </tr>
      </thead>
      <tbody aria-live="polite">
        {rows.map(row => <tr key={row.id} data-selected-change-entity={row.id}>
          <th scope="row">{row.label}</th>
          <td data-mode={first.mode}>{row.first}</td>
          <td data-mode={second.mode}>{row.second}</td>
        </tr>)}
      </tbody>
    </table>
  </section>
}

export function UnfinishedArenaComparison({ entries, locale, onContinue, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const selectionTrigger = useRef<HTMLElement>(null)
  const [showChanges, setShowChanges] = useState(false)
  const [review, setReview] = useState<ChangeReview>({ playback: 'stopped' })
  const [category, setCategory] = useState<ChangeCategory>('all')
  const { selection, playback } = review
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [first, second] = entries
  const sameLevel = entries.length === 2 && first.levelId === second.levelId
  const highlightChanges = sameLevel && showChanges
  const boards = highlightChanges && first.board && second.board ? [first.board, second.board] as const : undefined
  const changes = boards && readSavedArenaChanges(...boards, (first.level.shifts ?? []).flatMap(shift => [
    ...(shift.open ?? []), ...(shift.close ?? []),
  ]))
  const selectedChange = boards && selection && (selection.source === 'board'
    ? readSavedArenaChange(...boards, selection.kind, selection.position)
    : changes?.find(change => change.kind === selection.kind && change.entries[0].id === selection.id))
  const visibleChanges = changesInCategory(changes ?? [], category)
  const currentIndex = visibleChanges.findIndex(change => includesChange(selectedChange, change))
  const nextChange = visibleChanges[currentIndex + 1]
  const nextKind = nextChange?.kind
  const nextId = nextChange?.entries[0].id
  const nextIsLast = currentIndex + 2 === visibleChanges.length

  useEffect(() => { heading.current?.focus() }, [])

  useEffect(() => {
    if (review.playback !== 'playing' || nextKind === undefined || nextId === undefined) return
    const timer = window.setTimeout(() => {
      setReview(current => current === review ? {
        selection: { source: 'list', kind: nextKind, id: nextId },
        playback: nextIsLast ? 'stopped' : 'playing',
      } : current)
    }, changePlaybackDelayMs)
    return () => window.clearTimeout(timer)
  }, [review, nextKind, nextId, nextIsLast])

  function togglePlayback(trigger: HTMLButtonElement) {
    if (!nextChange) return
    if (playback === 'playing') {
      setReview({ selection, playback: 'paused' })
      return
    }
    const start = Math.max(0, currentIndex)
    selectionTrigger.current = trigger
    setReview({
      selection: listedSelection(visibleChanges[start]),
      playback: start < visibleChanges.length - 1 ? 'playing' : 'stopped',
    })
  }

  function selectBoardChange(kind: SavedArenaChangeKind, position: Position) {
    const focused = document.activeElement
    selectionTrigger.current = focused instanceof HTMLButtonElement && focused.dataset.changeKind === kind ? focused : null
    if (category !== 'all') setCategory(groupForChange(kind))
    setReview({ selection: { source: 'board', kind, position }, playback: 'stopped' })
  }

  function selectListedChange(change: SavedArenaChange | undefined, trigger: HTMLElement) {
    selectionTrigger.current = trigger
    setReview({ selection: change && listedSelection(change), playback: 'stopped' })
  }

  function changeCategory(nextCategory: ChangeCategory, trigger: HTMLSelectElement) {
    setCategory(nextCategory)
    const nextChanges = changesInCategory(changes ?? [], nextCategory)
    if (nextChanges.some(change => includesChange(selectedChange, change))) setReview({ selection, playback: 'stopped' })
    else selectListedChange(nextChanges[0], trigger)
  }

  function clearSelection() {
    setReview({ playback: 'stopped' })
    selectionTrigger.current?.focus()
  }

  return <section className="arena-match-comparison" aria-labelledby="arena-match-comparison-title">
    <div className="arena-match-comparison-header">
      <h1 id="arena-match-comparison-title" ref={heading} tabIndex={-1}>{t('对比存档', 'Compare saved matches')}</h1>
      <div className="arena-match-comparison-actions">
        {sameLevel && <label className="arena-match-change-toggle">
          <input type="checkbox" checked={showChanges} onChange={event => {
            setShowChanges(event.currentTarget.checked)
            setReview({ playback: 'stopped' })
            setCategory('all')
            selectionTrigger.current = null
          }} />
          {t('标出变化', 'Highlight changes')}
        </label>}
        <button type="button" className="subtle-button" onClick={onBack}>{t('返回列表', 'Back to list')}</button>
      </div>
    </div>
    {highlightChanges && <MatchDifferences first={first} second={second} locale={locale} />}
    <div className="arena-match-comparison-workspace">
      {changes && <MatchChangeList changes={visibleChanges} category={category} hasChanges={changes.length > 0}
        selected={selectedChange} currentIndex={currentIndex} playback={playback} first={first} second={second} locale={locale}
        onSelect={selectListedChange} onCategoryChange={changeCategory} onTogglePlayback={togglePlayback} />}
      <div className="arena-match-comparison-cards">
        {entries.map(({ level, mode, turn, scores, remainingMs, board }, index) => {
          const key = `${level.id}-${mode}`
          const titleId = `compared-match-title-${key}`
          const modeId = `compared-match-mode-${key}`
          const description = `${titleId} ${modeId}`
          const compareBoard = boards?.[1 - index]
          return <article key={key} className="panel arena-match-comparison-card" aria-labelledby={description}
            data-compared-match={level.id} data-mode={mode} data-match-turn={turn} data-remaining-ms={remainingMs}>
            <div className="arena-match-comparison-match-heading">
              <h2 id={titleId}>{level.title[locale]}</h2>
              <span id={modeId} className="arena-match-comparison-mode">{modeName(mode, locale)}</span>
            </div>
            <dl className="arena-match-comparison-detail">
              <div><dt>{t('当前回合', 'Turn')}</dt><dd>{turn} / {level.maxTurns}</dd></div>
              <div><dt>{t('剩余时间', 'Time left')}</dt><dd>{savedArenaTime(remainingMs, locale)}</dd></div>
            </dl>
            {board ? <SavedArenaBoard level={level} board={board} locale={locale} testId="compared-arena-board" compareBoard={compareBoard}
              onSelectChange={compareBoard ? selectBoardChange : undefined} selectedChange={selectedChange} />
              : <p className="arena-match-comparison-board-notice">{t('暂时无法显示棋盘。', 'The saved board is unavailable.')}</p>}
            <SavedArenaScores level={level} scores={scores} locale={locale} numberOpponents={Boolean(board)} />
            <button type="button" className="primary-button" onClick={() => onContinue(level.id, mode)} aria-describedby={description}>
              {t('继续这局', 'Continue this match')}
            </button>
          </article>
        })}
      </div>
    </div>
    {selectedChange && <SelectedMatchChange change={selectedChange} first={first} second={second} locale={locale} onClear={clearSelection} />}
  </section>
}
