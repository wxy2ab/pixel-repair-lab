import { CodingDevice } from './CodingDevice'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { StepExplanation } from './LessonNotes'
import { useId, useMemo, useState, type CSSProperties } from 'react'
import { runBatterySearch, type BatterySearchStep } from '../engine/programBatterySearch'
import { runFirstBatterySearch, type FirstBatterySearchStep } from '../engine/programFirstBatterySearch'
import type { FirstBatterySearchInput, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { runIssueText, tr } from './text'
import './first-battery-search-lesson.css'

type Translate = (zh: string, en: string) => string
type SearchStep = BatterySearchStep | FirstBatterySearchStep

function describeStep(step: SearchStep | undefined, sample: FirstBatterySearchInput,
  firstMatch: boolean, result: number | undefined, t: Translate) {
  if (!step) {
    return t('点待查范围的中间。位置从 0 开始数，有两个中间位置时选靠左的那格。',
      'Tap the middle of the search range. Positions start at 0. When there are two middle positions, pick the left one.')
  }
  const { index, charge } = step
  const battery = index === undefined ? undefined : sample.batteries[index]
  switch (step.kind) {
    case 'select':
      return (step.last - step.first + 1) % 2 === 0
        ? t(`中间有两格。// 2 向下取整，选靠左的位置 ${index}。${battery?.name} 号电池有 ${charge} 格电量。`,
          `There are two middle positions. The // 2 rounds down to the left one, index ${index}. Battery ${battery?.name} has ${charge} units.`)
        : t(`中点是位置 ${index}。${battery?.name} 号电池有 ${charge} 格电量，跟目标比一比。`,
          `The middle is index ${index}. Battery ${battery?.name} has ${charge} units. Compare that with the target.`)
    case 'compare':
      if (step.match) {
        return firstMatch
          ? t('电量相同。先记下这格，左边可能还有一样的电池。', 'The charge matches. Remember this position in case there is another match to its left.')
          : t('电量相同。这次只要找到一块，程序可以返回这个位置。', 'The charge matches. This search only needs one match, so it can return this position.')
      }
      return charge !== undefined && charge < sample.target
        ? t('中点的电量低于目标，只可能在右边找到。', 'The middle charge is below the target, so the match can only be on the right.')
        : t('中点的电量高于目标，只可能在左边找到。', 'The middle charge is above the target, so the match can only be on the left.')
    case 'remember':
      return t(`${battery?.name} 号的位置 ${index} 是目前找到的最左位置。先记住它，再查它的左边。`,
        `Battery ${battery?.name} at index ${index} is the leftmost match found so far. Keep it and search to its left.`)
    case 'narrow':
      if (step.match) {
        return t('中点已经记下，它右边的电池位置更靠后。只查左边，看看能不能找到更早的一格。',
          'The middle position is saved. Anything on its right is later in the row, so only search the left side for an earlier match.')
      }
      return charge !== undefined && charge < sample.target
        ? t('中点和它左边的电量都低于目标，把这些位置划出待查范围。', 'The middle and everything on its left are below the target. Rule out those positions.')
        : t('中点和它右边的电量都高于目标，把这些位置划出待查范围。', 'The middle and everything on its right are above the target. Rule out those positions.')
    case 'return': {
      const found = result === undefined ? undefined : sample.batteries[result]
      if (!found) return t('范围为空，程序返回 -1，表示没有找到。', 'The range is empty. The program returns -1 for no match.')
      return firstMatch
        ? t(`已经没有更靠左的候选。返回 ${found.name} 号的位置 ${result}，这是第一块匹配的电池。`,
          `There are no earlier candidates left. Return index ${result} for battery ${found.name}, the first match.`)
        : t(`找到了 ${found.name} 号电池，返回位置 ${result}。`, `The program found battery ${found.name} and returns index ${result}.`)
    }
  }
}

function actionLabel(step: SearchStep | undefined, t: Translate) {
  switch (step?.kind) {
    case 'compare': return t('比较电量', 'Compare charges')
    case 'remember': return t('记下这个位置', 'Remember this position')
    case 'narrow': return t('缩小范围', 'Narrow the range')
    case 'return': return t('查看结果', 'See the result')
  }
}

function SearchRow({ sample, locale, first, last, middle, found, saved, stopped, added, relation, onPick }: {
  sample: FirstBatterySearchInput; locale: Locale; first: number; last: number; middle?: number;
  found?: number; saved?: number; stopped: boolean; added: string[]; relation?: string; onPick?: (index: number) => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  return <ol className="first-search-row" style={{ '--first-search-count': sample.batteries.length } as CSSProperties}
    aria-label={t('按电量排列的电池', 'Batteries sorted by charge')} data-testid="first-battery-search-row">
    {sample.batteries.map(({ name, charge }, index) => {
      const inRange = index >= first && index <= last
      const state = index === found ? 'found' : index === saved ? 'saved'
        : !inRange ? 'excluded' : index === middle ? 'checking' : stopped ? 'unvisited' : 'candidate'
      const status = state === 'found' ? t('最终找到', 'Final match')
        : state === 'saved' ? t('已记下', 'Saved match')
          : state === 'checking' ? t('中点', 'Midpoint')
            : state === 'excluded' ? t('已排除', 'Ruled out')
              : state === 'unvisited' ? t('无需检查', 'No check needed') : t('待查', 'In range')
      const label = t(`${name} 号，位置 ${index}，${charge} 格电量，${status}`, `Battery ${name}, index ${index}, charge ${charge}, ${status}`)
      const attributes = {
        className: 'search-battery-tile first-search-card',
        'data-testid': `first-battery-${name}`,
        'data-battery-name': name,
        'data-charge': charge,
        'data-index': index,
        'data-state': state,
        'data-saved': index === saved || undefined,
        'data-in-range': inRange || undefined,
        'data-added': added.includes(name) || undefined,
      }
      const face = <>
        <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
        {(state === 'saved' || state === 'checking' || state === 'found') && <small className="first-search-marker">{status}</small>}
        {index === middle && relation && <small className="first-search-marker" data-testid="first-battery-search-relation">{relation}</small>}
      </>
      return <li key={name}>
        {onPick && inRange
          ? <button type="button" {...attributes} aria-label={label} onClick={() => onPick(index)}>{face}</button>
          : <div {...attributes} aria-label={label}>{face}</div>}
      </li>
    })}
  </ol>
}

function SearchReplay({ sample, source, firstMatch, added, locale, onReady, onSwitch }: {
  sample: FirstBatterySearchInput; source: string; firstMatch: boolean; added: string[];
  locale: Locale; onReady: () => void; onSwitch: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const trial = useMemo(() => firstMatch
    ? runFirstBatterySearch(source, sample.batteries, sample.target)
    : runBatterySearch('binary', source, sample.batteries, sample.target), [firstMatch, sample, source])
  const [position, setPosition] = useState(-1)
  const [wrongTile, setWrongTile] = useState(false)
  const step = trial.steps[position]
  const next = trial.steps[position + 1]
  const first = step?.first ?? 0
  const last = step?.last ?? sample.batteries.length - 1
  const stopped = step?.kind === 'return'
  const found = stopped && trial.result && trial.result.index >= 0 ? trial.result.index : undefined
  const saved = step && 'saved' in step && step.saved !== undefined && step.saved >= 0 ? step.saved : undefined
  const rangeText = first <= last ? t(`位置 ${first} 到 ${last}`, `Index ${first} to ${last}`)
    : t(`空（${first} > ${last}）`, `Empty (${first} > ${last})`)
  const picking = next?.kind === 'select'
  const action = actionLabel(next, t)
  const compared = step?.kind === 'compare' ? step.charge : undefined
  const relation = compared === undefined ? undefined : compared + (compared === sample.target ? ' = ' : compared < sample.target ? ' < ' : ' > ') + sample.target

  function goTo(index: number) {
    setWrongTile(false)
    setPosition(index)
    if (firstMatch && trial.steps[index]?.kind === 'return' && trial.result && !trial.issue) onReady()
  }

  function pick(index: number) {
    if (!picking) return
    if (next.index === index) goTo(position + 1)
    else setWrongTile(true)
  }

  return <section className="classroom-demonstration panel first-search-lesson" aria-labelledby={heading} data-testid="first-battery-search-lesson"
    data-phase={firstMatch ? 'repeated' : 'unique'}>
    <CodingDevice device="scanner" locale={locale} workbench controls={<>
      {/* The task, the buttons and what the last step did stay together, beside the row the learner taps. */}
      <p className="first-search-task">{firstMatch
        ? t(`找最左边的 ${sample.target} 格电池`, `Find the leftmost battery with ${sample.target} units`)
        : t(`找一块 ${sample.target} 格电池`, `Find a battery with ${sample.target} units`)}</p>
      <SearchRow sample={sample} locale={locale} first={first} last={last} middle={step?.index} found={found}
        saved={saved} stopped={stopped} added={added} relation={relation} onPick={picking ? pick : undefined} />
      <div className="search-step-controls first-search-controls">
        <button type="button" className="subtle-button" onClick={() => goTo(position - 1)} disabled={position < 0}>
          {t('上一步', 'Previous step')}
        </button>
        {action && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{action}</button>}
        {!firstMatch && stopped && trial.result && !trial.issue && <button type="button" className="primary-button" onClick={onSwitch}>
          {t('加入相同电量的电池', 'Add batteries with the same charge')}
        </button>}
        {firstMatch && <button type="button" className="subtle-button" onClick={onSwitch}>{t('回到第一排', 'Return to the first row')}</button>}
      </div>
      <div className="first-search-step" data-testid="first-battery-search-step" data-kind={step?.kind ?? 'start'}
        data-line={step?.line} data-index={step?.index} data-first={first} data-last={last} data-saved={saved}>
        {stopped ? <p role="status" data-testid="first-battery-search-result">{describeStep(step, sample, firstMatch, found, t)}</p>
          : <StepExplanation locale={locale}>{describeStep(step, sample, firstMatch, found, t)}</StepExplanation>}
        {picking && <p className="first-search-hint">{t('点待查范围的中点', 'Tap the middle of the range')}</p>}
        {wrongTile && <p className="first-search-hint" role="status" data-testid="first-battery-search-hint">
          {t('再找一下待查范围的中间。有两个中间位置时，选靠左的那格。',
            'Try the middle of the search range. If there are two middle positions, pick the left one.')}
        </p>}
      </div>
      <div className="first-search-metrics">
        <span>{t('目标电量', 'Target charge')} <strong>{sample.target}</strong></span>
        <span>{t('待查范围', 'Search range')} <strong data-testid="first-battery-search-range"
          data-first={first} data-last={last}>{rangeText}</strong></span>
        {firstMatch && <span>{t('记下的位置', 'Saved position')} <strong data-testid="first-battery-search-saved">
          {saved === undefined ? t('还没有', 'None yet') : `${sample.batteries[saved].name} · ${saved}`}
        </strong></span>}
      </div>
    </>}>
      <div className="panel-heading">
        <h2 id={heading}>{firstMatch ? t('有相同电量时，找第一块', 'Find the first of several matches')
          : t('在有序电池里找一块', 'Find one battery in a sorted row')}</h2>
      </div>
      <div className="first-search-body">
        <AlgorithmBatteryRack scene="first-match-search-rack" locale={locale} label={t('二分查找架', 'Binary search rack')}
          batteries={sample.batteries} range={[first, last]} step={step} codeId="first-battery-search-code"
          marked={[found, saved, picking ? undefined : step?.index].filter((i): i is number => i !== undefined && i >= 0)}
          badges={{ ...(step?.kind === 'select' || step?.kind === 'compare' ? { [step.index!]: t('中点', 'Mid') } : {}),
            ...(saved === undefined ? {} : { [saved]: t('记下', 'Saved') }), ...(found === undefined ? {} : { [found]: t('找到', 'Found') }) }}
          readout={relation}
          onCell={picking ? index => { if (index >= first && index <= last) pick(index) } : undefined}
          onAdvance={action ? () => goTo(position + 1) : undefined} />
        {trial.issue && <p className="error-message" role="alert">{runIssueText(locale, trial.issue)}</p>}
      </div>
    </CodingDevice>
  </section>
}

export function FirstBatterySearchLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const [firstMatch, setFirstMatch] = useState(false)
  const settings = execution.firstBatterySearch
  if (!settings) return null

  const { unique, repeated } = settings.demo
  const added = repeated.batteries.filter(({ name }) => !unique.batteries.some(battery => battery.name === name)).map(({ name }) => name)

  return <SearchReplay key={firstMatch ? 'repeated' : 'unique'} sample={firstMatch ? repeated : unique}
    source={firstMatch ? settings.firstSource : execution.source} firstMatch={firstMatch} added={firstMatch ? added : []}
    locale={locale} onReady={onReady} onSwitch={() => setFirstMatch(current => !current)} />
}
