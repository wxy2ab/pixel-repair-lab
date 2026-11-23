import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CardDefinition, CardInstance, GridLevel, Locale } from '../shared/types'
import { changeList, insertCommand, pathAfterInsertion } from './cardInsertion'
import { editSelectedCards, type CardEditAction } from './cardSelection'
import { tr } from './text'

type InsertSide = 'before' | 'after'

function cardCounts(cards: CardInstance[], selection: ReadonlySet<string>) {
  let total = 0, selected = 0
  function count(items: CardInstance[], prefix: string, inherited: boolean) {
    for (const [index, item] of items.entries()) {
      const key = prefix + index
      const checked = inherited || selection.has(key)
      total++
      if (checked) selected++
      if (item.children?.length) count(item.children, key + '.', checked)
    }
  }
  count(cards, '', false)
  return { total, selected }
}

type Props = {
  level: GridLevel
  locale: Locale
  cards: CardInstance[]
  setCards: (cards: CardInstance[]) => void
  disabled: boolean
  guideTarget?: string
  linePaths: readonly string[]
  currentLine?: number
  nextLine?: number
}

export function ProgramEditor({ level, locale, cards, setCards, disabled, guideTarget, linePaths, currentLine, nextLine }: Props) {
  const [insertion, setInsertion] = useState<number[]>([])
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const [side, setSide] = useState<InsertSide>('after')
  const [addedAfter, setAddedAfter] = useState(0)
  const [deletion, setDeletion] = useState<{
    before: CardInstance[]; after: CardInstance[]; selection: Set<string>; insertion: number[]; count: number; singleKey?: string
    side: InsertSide; addedAfter: number
  }>()
  const program = useRef<HTMLElement>(null)
  const nextFocus = useRef('')
  useLayoutEffect(() => {
    if (!nextFocus.current) return
    program.current?.querySelector<HTMLElement>(nextFocus.current)?.focus({ preventScroll: true })
    nextFocus.current = ''
  }, [cards, selection])
  const { counts, canMoveUp, canMoveDown } = useMemo(() => {
    const counts = cardCounts(cards, selection)
    return {
      counts,
      canMoveUp: counts.selected > 0 && editSelectedCards(cards, selection, 'up').cards !== cards,
      canMoveDown: counts.selected > 0 && editSelectedCards(cards, selection, 'down').cards !== cards,
    }
  }, [cards, selection])
  const atLimit = counts.total >= 100
  const canUndo = deletion?.after === cards
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const currentCard = currentLine === undefined ? undefined : linePaths[currentLine - 1]
  const nextCard = nextLine === undefined ? undefined : linePaths[nextLine - 1]

  const selectedKey = selection.size === 1 ? selection.values().next().value : undefined
  const selectedPath = selectedKey?.split('.').map(Number)
  const listPath = selectedPath?.slice(0, -1) ?? insertion
  const siblings = listPath.reduce((items, index) => items[index]?.children ?? [], cards)
  const selectedIndex = selectedPath?.at(-1)
  const anchor = selectedIndex === undefined ? undefined : siblings[selectedIndex]
  const anchorLabel = anchor && level.cards.find(card => card.id === anchor.cardId)?.label[locale]
  const insertIndex = selectedIndex === undefined ? siblings.length
    : selectedIndex + (side === 'after' ? 1 + addedAfter : 0)
  const markedEdge = selectedPath && [...listPath, side === 'after' ? insertIndex - 1 : insertIndex].join('.')

  function select(next: Set<string>) {
    setAddedAfter(0)
    setSelection(next)
  }

  function toggle(key: string) {
    const next = new Set(selection)
    for (const child of selection) if (child.startsWith(key + '.')) next.delete(child)
    if (selection.has(key)) next.delete(key)
    else next.add(key)
    select(next)
  }

  function chooseList(path: number[]) {
    setInsertion(path)
    if (selectedPath) select(new Set())
  }

  function edit(action: CardEditAction, singleKey?: string) {
    if (disabled) return
    const selected = singleKey === undefined ? selection : new Set([singleKey])
    const next = editSelectedCards(cards, selected, action)
    if (next.cards === cards) return
    if (action === 'delete') {
      const count = singleKey === undefined ? counts.selected : cardCounts(cards, selected).selected
      setDeletion({ before: cards, after: next.cards, selection, insertion, count, singleKey, side, addedAfter })
      nextFocus.current = '[data-undo-deletion]'
    } else setDeletion(undefined)
    setInsertion(next.remapPath(insertion))
    select(singleKey === undefined ? next.selection : new Set())
    setCards(next.cards)
  }

  function undoDeletion() {
    if (disabled || !canUndo) return
    nextFocus.current = deletion.singleKey === undefined ? '.instruction-batch' : `[data-select-card="${deletion.singleKey}"]`
    setInsertion(deletion.insertion)
    setSelection(deletion.selection)
    setSide(deletion.side)
    setAddedAfter(deletion.addedAfter)
    setCards(deletion.before)
    setDeletion(undefined)
  }

  function add(definition: CardDefinition) {
    const card = { cardId: definition.id, ...(definition.block ? { children: [] } : {}) }
    const next = insertCommand(cards, listPath, insertIndex, card)
    if (next === cards) return
    if (selectedPath) {
      if (side === 'after') setAddedAfter(addedAfter + 1)
      else setSelection(new Set([pathAfterInsertion(selectedPath, listPath, insertIndex).join('.')]))
      setInsertion(pathAfterInsertion(insertion, listPath, insertIndex))
    }
    setCards(next)
  }

  function renderCards(items: CardInstance[], parent: number[], inherited = false) {
    return items.map((item, index) => {
      const definition = level.cards.find(card => card.id === item.cardId)
      if (!definition) return null
      const path = [...parent, index]
      const key = path.join('.')
      const isCurrent = key === currentCard
      const isNext = key === nextCard
      const target = !selectedPath && insertion.join('.') === key
      const checked = inherited || selection.has(key)
      const number = path.map(i => i + 1).join('.')

      return <li key={index} className={'instruction' + (definition.block ? ' instruction--block' : '')} data-card={item.cardId}
        data-selected={checked || undefined} data-insert-edge={key === markedEdge ? side : undefined}
        data-execution-current={isCurrent || undefined} data-execution-next={isNext || undefined} aria-current={isCurrent ? 'step' : undefined}>
        <div className="instruction-main">
          {isCurrent && <span className="sr-only">{t('当前指令', 'Current command')}</span>}
          {isNext && <span className="sr-only">{t('下一条指令', 'Next command')}</span>}
          <label className="instruction-select">
            <input type="checkbox" data-select-card={key} disabled={disabled || inherited} checked={checked} onChange={() => toggle(key)}
              aria-label={t(`选择指令 ${number} · ${definition.label.zh}`, `Select command ${number} · ${definition.label.en}`)} />
            <span className="instruction-label">{definition.label[locale]}</span>
          </label>
          <div className="instruction-choices">
            {definition.parameters?.map(parameter => <label key={parameter.name}>
              <span className="sr-only">{parameter.label[locale]}</span>
              <select disabled={disabled} aria-label={parameter.label[locale]} data-parameter={parameter.name}
                value={item.values?.[parameter.name] ?? parameter.choices[0].id}
                onChange={event => {
                  const value = event.target.value
                  setCards(changeList(cards, parent, list => list.map((entry, position) => position === index
                    ? { ...entry, values: { ...entry.values, [parameter.name]: value } }
                    : entry)))
                }}>
                {parameter.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label[locale]}</option>)}
              </select>
            </label>)}
          </div>
          {!counts.selected && <div className="instruction-actions">
            <button type="button" disabled={disabled || index === 0} aria-label={t('上移', 'Move earlier')} onClick={() => edit('up', key)}>↑</button>
            <button type="button" disabled={disabled || index === items.length - 1} aria-label={t('下移', 'Move later')} onClick={() => edit('down', key)}>↓</button>
            <button type="button" disabled={disabled} aria-label={t('移除', 'Remove')} onClick={() => edit('delete', key)}>×</button>
          </div>}
        </div>
        {definition.block && <div className={'instruction-body' + (target ? ' active' : '')}>
          <button type="button" className="insertion-button" aria-pressed={target} disabled={disabled || path.length > 5} onClick={() => chooseList(target ? [] : path)}>
            {target ? t('在此处添加', 'Adding here') : t('向代码块添加指令', 'Add inside this block')}
          </button>
          <ol className="instruction-list">{renderCards(item.children ?? [], path, checked)}</ol>
        </div>}
      </li>
    })
  }

  return <>
    <section className={'palette-section' + (guideTarget === 'palette' ? ' guided' : '')}>
      <h3>{t('指令卡', 'Command cards')}</h3>
      {selectedPath && <div className="card-insert-position" role="group" aria-label={t('插入位置', 'Insert position')}>
        <span className="card-insert-anchor">{t('已选', 'Selected')} {selectedPath.map(i => i + 1).join('.')} · {anchorLabel}</span>
        <div className="card-insert-choices">
          {(['after', 'before'] as const).map(option => <button type="button" key={option}
            aria-pressed={side === option} disabled={disabled} onClick={() => {
              if (side !== option) { setSide(option); setAddedAfter(0) }
            }}>{option === 'after' ? t('在后面添加', 'Insert after') : t('在前面添加', 'Insert before')}</button>)}
        </div>
      </div>}
      <div className="palette">
        {level.cards.map(card => <button type="button" className="palette-card" key={card.id} data-add-card={card.id}
          disabled={disabled || atLimit || Boolean(card.block && listPath.length >= 5)} onClick={() => add(card)}>
          <span>{card.label[locale]}</span><span aria-hidden="true">+</span>
        </button>)}
      </div>
    </section>
    <section ref={program} className={'program-section' + (guideTarget === 'program' ? ' guided' : '')}>
      <div className="section-label instruction-heading">
        <h3>{t('我的程序', 'My program')}</h3>
        {(currentCard !== undefined || nextCard !== undefined) && <div className="instruction-run-key">
          <span className="instruction-run-key-current">{t('当前指令', 'Current command')}</span>
          <span className="instruction-run-key-next">{t('下一条指令', 'Next command')}</span>
        </div>}
        <div className="instruction-heading-actions">
          {cards.length > 0 && <button type="button" className="text-button" disabled={disabled || counts.selected === counts.total}
            onClick={() => select(new Set(cards.map((_, index) => String(index))))}>{t('全选', 'Select all')}</button>}
          {(insertion.length > 0 || listPath.length > 0) && <button type="button" className="text-button" disabled={disabled} onClick={() => chooseList([])}>{t('回到主程序', 'Back to main program')}</button>}
        </div>
      </div>
      {(counts.selected > 0 || canUndo) && <div className="instruction-batch" role="group" tabIndex={-1} aria-label={t('批量操作', 'Edit selected commands')}>
        {counts.selected > 0 ? <>
          <span className="instruction-count" role="status">{t(`已选 ${counts.selected} 条`, `${counts.selected} selected`)}</span>
          <button type="button" className="subtle-button" disabled={disabled || !canMoveUp} onClick={() => edit('up')}>
            <span aria-hidden="true">↑ </span>{t('上移', 'Move up')}</button>
          <button type="button" className="subtle-button" disabled={disabled || !canMoveDown} onClick={() => edit('down')}>
            <span aria-hidden="true">↓ </span>{t('下移', 'Move down')}</button>
          <button type="button" className="subtle-button instruction-delete" disabled={disabled} onClick={() => edit('delete')}>{t('删除', 'Delete')}</button>
          <button type="button" className="text-button" disabled={disabled} onClick={() => {
            nextFocus.current = `[data-select-card="${selection.values().next().value}"]`
            select(new Set())
          }}>{t('取消选择', 'Clear selection')}</button>
        </> : canUndo && <span className="instruction-count" role="status">{t(`已删除 ${deletion.count} 条`, `${deletion.count} deleted`)}</span>}
        {canUndo && <button type="button" data-undo-deletion className="subtle-button" disabled={disabled} onClick={undoDeletion}>{t('撤销删除', 'Undo deletion')}</button>}
      </div>}
      {cards.length ? <ol className="instruction-list">{renderCards(cards, [])}</ol> : <div className="program-empty">
        <span aria-hidden="true">＋</span>{t('点击一张指令卡，添加到这里', 'Click a command card to add it here')}
      </div>}
    </section>
  </>
}
