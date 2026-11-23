import { CodingDevice } from './CodingDevice'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { useId, useMemo, useRef, useState } from 'react'
import { runBatterySearch, type BatterySearchStep } from '../engine/programBatterySearch'
import type { BatterySearchCase, BatterySearchMethod, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { runIssueText, tr } from './text'
import './battery-search-lesson.css'

type Translate = (zh: string, en: string) => string

export function SearchBatteryFace({ name, charge, index, locale }: {
  name: string; charge?: number; index?: number; locale: Locale;
}) {
  const meterUnits = charge !== undefined && Number.isInteger(charge) && charge >= 0 && charge <= 20 ? charge : undefined
  return <>
    <strong className="search-battery-name">{name}</strong>
    <span className="search-battery-charge" data-hidden={charge === undefined || undefined}
      aria-label={charge === undefined ? tr(locale, '电量未知', 'Charge unknown') : tr(locale, `${charge} 格电量`, `${charge} units of charge`)}
      role="img">{charge ?? '?'}
      {meterUnits !== undefined && <span className="search-battery-meter" aria-hidden="true">
        {Array.from({ length: meterUnits }, (_, index) => <i key={index} />)}
      </span>}
    </span>
    {index !== undefined && <small className="search-battery-index">
      <span aria-label={tr(locale, `位置 ${index}`, `Index ${index}`)}>{index}</span>
    </small>}
  </>
}

function ManualSearch({ demo, locale, onFound }: {
  demo: BatterySearchCase & { manualOrder: string[] }; locale: Locale; onFound: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const [revealed, setRevealed] = useState<string[]>([])
  const byName = new Map(demo.batteries.map(battery => [battery.name, battery]))
  const latest = byName.get(revealed.at(-1) ?? '')
  const found = latest?.charge === demo.target

  function inspect(name: string, charge: number) {
    if (revealed.includes(name) || found) return
    setRevealed([...revealed, name])
    if (charge === demo.target) onFound()
  }

  return <section className="classroom-demonstration panel search-workbench" data-testid="battery-search-manual" aria-labelledby={heading}>
    <CodingDevice device="scanner" locale={locale} workbench controls={<>
      <ol className="search-battery-row" aria-label={t('待检查的电池', 'Batteries to inspect')}>
        {demo.manualOrder.map(name => {
          const battery = byName.get(name)
          if (!battery) return null
          const charge = revealed.includes(name) ? battery.charge : undefined
          const state = charge === undefined ? 'covered' : charge === demo.target ? 'found' : 'revealed'
          return <li key={name}>
            <button type="button" className="subtle-button search-battery-tile" data-testid={`battery-search-manual-card-${name}`}
              data-battery-name={name} data-charge={charge} data-state={state} aria-disabled={charge !== undefined || found || undefined}
              aria-label={charge === undefined ? t(`查看 ${name} 号电池`, `Inspect battery ${name}`)
                : t(`${name} 号电池，${charge} 格电量`, `Battery ${name}, ${charge} units of charge`)}
              onClick={() => inspect(name, battery.charge)}>
              <SearchBatteryFace name={name} charge={charge} locale={locale} />
            </button>
          </li>
        })}
      </ol>
    </>}>
      <div className="panel-heading">
        <h2 id={heading}>{t('先找一块电池', 'Find a battery by hand')}</h2>
      </div>
      <div className="search-panel-body">
        <AlgorithmBatteryRack scene="manual-search-rack" locale={locale}
          label={t('点电池测电量', 'Tap a battery to test its charge')}
          batteries={demo.manualOrder.map(name => ({ name, charge: revealed.includes(name) ? byName.get(name)?.charge : undefined }))}
          marked={latest ? [demo.manualOrder.indexOf(latest.name)] : undefined}
          onCell={!found ? index => {
            const battery = byName.get(demo.manualOrder[index])
            if (battery) inspect(battery.name, battery.charge)
          } : undefined} />
        <p>{t(`维修台需要一块 ${demo.target} 格电量的电池。点一块电池，看看它有几格电量。`,
          `The repair bench needs a battery with ${demo.target} units of charge. Select a battery to reveal its charge.`)}</p>
        {latest && <p role="status" className={found ? 'search-manual-feedback is-found' : 'search-manual-feedback'}>
          {found ? t(`找到了！${latest.name} 号电池有 ${latest.charge} 格电量。你一共检查了 ${revealed.length} 块。`,
            `Found it! Battery ${latest.name} has ${latest.charge} units of charge. You checked ${revealed.length}.`)
            : t(`${latest.name} 号电池有 ${latest.charge} 格电量。再找找。`,
              `Battery ${latest.name} has ${latest.charge} units of charge. Try another one.`)}
        </p>}
      </div>
    </CodingDevice>
  </section>
}

function explanation(method: BatterySearchMethod, sample: BatterySearchCase, step: BatterySearchStep | undefined, t: Translate) {
  if (!step) {
    return method === 'linear'
      ? t('从第一块开始，一次检查一块。没排过序也能这样找。', 'Start with the first battery. This method can check a row in any order.')
      : t('先确认电量从小到大排列，再找剩余范围的中间。// 2 向下取整，有两个中间位置时取靠左的那个。',
        'Start in the middle of the sorted range. The // 2 rounds down, so if there are two middle positions, choose the left one.')
  }
  const { index, charge, match } = step
  const battery = index === undefined ? undefined : sample.batteries[index]
  const name = battery?.name
  switch (step.kind) {
    case 'select':
      return method === 'linear'
        ? t(`轮到位置 ${index} 的 ${name} 号电池。`, `Check battery ${name} at index ${index} next.`)
        : t(`选剩余范围中间的 ${name} 号电池，位置是 ${index}。`, `Pick battery ${name} in the middle of the remaining range at index ${index}.`)
    case 'compare':
      if (match) return t(`${name} 号的电量正好等于目标，找到了。`, `Battery ${name} has exactly the target charge.`)
      return method === 'linear'
        ? t(`${name} 号的电量不等于目标，继续查下一块。`, `Battery ${name} does not match. Move to the next battery.`)
        : t(charge !== undefined && charge < sample.target ? '中间这块的电量比目标小。' : '中间这块的电量比目标大。',
          charge !== undefined && charge < sample.target ? 'The middle battery’s charge is below the target.' : 'The middle battery’s charge is above the target.')
    case 'narrow':
      return charge !== undefined && charge < sample.target
        ? t(`左边的电量都不超过 ${charge} 格，排除 ${name} 号和它左边的电池，只查右边。`,
          `Every battery to the left has at most ${charge} units. Rule out ${name} and everything to its left. Search to the right.`)
        : t(`右边的电量都不少于 ${charge} 格，排除 ${name} 号和它右边的电池，只查左边。`,
          `Every battery to the right has at least ${charge} units. Rule out ${name} and everything to its right. Search to the left.`)
    case 'return':
      return battery
        ? t(`返回 ${battery.name} 号的位置 ${index}，一共比较了 ${step.comparisons} 次。`,
          `Return index ${index} for battery ${battery.name} after ${step.comparisons} comparisons.`)
        : t('剩余范围已空。程序返回 -1，表示没有找到。', 'The search range is empty. The program returns -1 for no match.')
  }
}

function SearchReplay({ method, source, sample, locale, onFinished }: {
  method: BatterySearchMethod; source: string; sample: BatterySearchCase; locale: Locale; onFinished: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const title = method === 'linear' ? t('逐块查找（线性查找）', 'One by one (linear search)') : t('折半查找（二分查找）', 'Halve the range (binary search)')
  const trial = useMemo(() => runBatterySearch(method, source, sample.batteries, sample.target), [method, source, sample])
  const [position, setPosition] = useState(-1)
  const step = trial.steps[position]
  const lastStep = trial.steps.length - 1
  const first = step?.first ?? 0
  const last = step?.last ?? sample.batteries.length - 1
  const stopped = step?.kind === 'return'
  const range = stopped ? t('查找已结束', 'Search ended')
    : first <= last ? t(`位置 ${first} 到 ${last}`, `Index ${first} to ${last}`) : t('空', 'Empty')
  const compared = step?.charge
  const showRelation = (step?.kind === 'compare' || step?.kind === 'narrow') && compared !== undefined
  const relation = compared === sample.target ? '=' : compared !== undefined && compared < sample.target ? '<' : '>'

  function goTo(next: number) {
    setPosition(next)
    if (next === lastStep && trial.steps[next]?.kind === 'return' && trial.result && !trial.issue) onFinished()
  }

  return <section className="classroom-demonstration search-method" data-testid={`battery-search-${method}`} aria-labelledby={heading}>
    <CodingDevice device="scanner" locale={locale} controls={<>
      <div className="search-step-controls">
        <button type="button" className="subtle-button" onClick={() => goTo(position - 1)} disabled={position < 0}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" onClick={() => goTo(position + 1)} disabled={position >= lastStep}>
          {t('下一步', 'Next step')}
        </button>
      </div>
    </>}>
      <h3 id={heading}>{title}</h3>
      <AlgorithmBatteryRack scene={'battery-search-' + method} label={title} locale={locale} batteries={sample.batteries}
        range={[first, last]} marked={step?.index === undefined ? [] : [step.index]}
        badges={step?.index === undefined ? undefined : { [step.index]: stopped && step.index >= 0 ? t('找到', 'Found')
          : !stopped && step.kind !== 'narrow' ? t('检查', 'Check') : undefined }}
        readout={showRelation ? compared + ' ' + relation + ' ' + sample.target : undefined}
        step={step} codeId="battery-search-code"
        onCell={position < lastStep ? index => {
          const next = trial.steps[position + 1]
          if (next.index === index) goTo(position + 1)
        } : undefined} onAdvance={position < lastStep ? () => goTo(position + 1) : undefined} />
      <div className="search-method-metrics">
        <span>{t('待查范围', 'Search range')} <strong data-testid="battery-search-range" data-first={first} data-last={last}>{range}</strong></span>
        <span>{t('比较次数', 'Comparisons')} <strong className="search-compare-count" data-testid="battery-search-compare-count">{step?.comparisons ?? 0}</strong></span>
      </div>
      <ol className="search-battery-row" data-testid="battery-search-row" aria-label={t('按电量排序的电池', 'Batteries in charge order')}>
        {sample.batteries.map(({ name, charge }, index) => {
          const active = step !== undefined && step.index === index
          const outside = index < first || index > last
          const state = active
            ? step.match === true || step.kind === 'return' ? 'found'
              : outside || step.match === false ? 'rejected' : 'checking'
            : outside ? 'excluded' : stopped ? 'unvisited' : 'candidate'
          const status = state === 'found' ? t('找到', 'Found') : state === 'checking' ? t('正在检查', 'Inspecting')
            : state === 'excluded' || state === 'rejected' ? t('已排除', 'Ruled out')
              : state === 'unvisited' ? t('无需检查', 'No check needed') : t('待检查', 'In the search range')
          return <li key={name} className="search-battery-tile" data-battery-name={name}
            data-charge={charge} data-state={state}
            aria-label={t(`${name} 号电池，${charge} 格，位置 ${index}，${status}`,
              `Battery ${name}, ${charge} units, index ${index}, ${status}`)}>
            <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
          </li>
        })}
      </ol>
      <div className="search-step" data-testid="battery-search-step" data-kind={step?.kind ?? 'start'}
        data-line={step?.line} data-index={step?.index} data-first={first} data-last={last}>
        <p role="status">
          {showRelation && <span className="search-relation" data-testid="battery-search-relation">{compared} {relation} {sample.target}</span>}
          {explanation(method, sample, step, t)}
        </p>
      </div>
      {trial.issue && <p className="error-message" role="alert">{runIssueText(locale, trial.issue)}</p>}
    </CodingDevice>
  </section>
}

export function BatterySearchLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const [manualComplete, setManualComplete] = useState(false)
  const finished = useRef(new Set<BatterySearchMethod>())
  const settings = execution.batterySearch
  if (!settings) return null

  function finish(method: BatterySearchMethod) {
    if (finished.current.has(method)) return
    finished.current.add(method)
    if (finished.current.size === 2) onReady()
  }

  return <div className="battery-search-lesson" data-testid="battery-search-lesson">
    <ManualSearch demo={settings.demo} locale={locale} onFound={() => setManualComplete(true)} />
    {manualComplete && <section className="panel search-workbench" aria-labelledby={heading}>
      <div className="panel-heading"><h2 id={heading}>{t('比较两种找法', 'Compare two ways to search')}</h2></div>
      <div className="search-panel-body">
        <p>{t(`把同一批电池按电量从小到大排好。两种找法都找 ${settings.demo.target} 格的电池，每检查一块就记一次比较。`,
          `The same batteries are now sorted by charge. Both methods look for ${settings.demo.target} units. Checking one battery counts as one comparison.`)}</p>
        <div className="search-methods">
          <SearchReplay method="linear" source={execution.source} sample={settings.demo} locale={locale} onFinished={() => finish('linear')} />
          <SearchReplay method="binary" source={settings.binarySource} sample={settings.demo} locale={locale} onFinished={() => finish('binary')} />
        </div>
      </div>
    </section>}
  </div>
}
