import { CodingDevice } from './CodingDevice'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { useEffect, useId, useRef, useState } from 'react'
import { runBatteryPipelineTrial, type BatteryPipelineStep } from '../engine/batteryPipeline'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import { readBatteryPipelineCase } from '../shared/batteryPipeline'
import type { Locale } from '../shared/types'
import { runIssueText, tr } from './text'
import './battery-pipeline-trial.css'

type Translate = (zh: string, en: string) => string

const helperNames = { sort: 'sort_ascending', pairCheck: 'sorted_has_pair', prefix: 'prefix_totals' } as const

function describe(step: BatteryPipelineStep, t: Translate, target: number, checked?: number[]) {
  switch (step.kind) {
    case 'sort':
      return t('把初始的一排电池交给排序函数。接下来两项任务都用它返回的这一排。',
        'The sorting function receives the starting charges. Both of the next tasks use the row it returns.')
    case 'pairCheck':
      return step.matched ? t('配对函数返回 True。两个指针停在这两块电池上。',
        'The pair checker returns True. Both pointers stop at these batteries.')
        : t('配对函数返回 False。下一步根据两端的和决定移动哪一端。',
          'The pair checker returns False. The sum tells us which end to move next.')
    case 'move':
      if (checked?.length === 2 && checked[0] + checked[1] === target) {
        return t('这一对的和已达到目标，可检查函数返回了 False，程序继续移动了指针。',
          'This pair reaches the target, but the pair checker returned False, so the program moved a pointer.')
      }
      return step.move === 'left' ? t('和比目标小，左端往右移，试试电量更高的电池。',
        'The sum is below the target. Move the left pointer right to try a higher charge.')
        : t('和比目标大，右端往左移，试试电量更低的电池。',
          'The sum is above the target. Move the right pointer left to try a lower charge.')
    case 'pair':
      return step.pair?.length === 2 ? t('把找到的两个电量交回主程序。',
        'Return the two matching charges to the main program.')
        : t('两端相遇前没有找到配对，交回空列表。', 'No pair matched before the pointers met, so return an empty list.')
    case 'prefix':
      return t('把排序后的一排交给前缀和函数。它返回累计表，开头的 0 表示还没计入电池。',
        'Pass the sorted charges to the prefix-sum function. Its cumulative table starts with 0, before any batteries.')
    case 'total':
      return t('用累计到右端的值减去左端前的值。留下的就是所选区间的总电量。',
        'Subtract the total before the left end from the total through the right end. The difference is the charge in the selected range.')
    case 'return':
      return t('把排序结果、配对和区间总电量一起交回工单。', 'Return the sorted charges, the pair, and the range total in one report.')
  }
}

function ChargeRow({ values, step, range, t }: {
  values: number[]; step?: BatteryPipelineStep; range?: [number, number]; t: Translate;
}) {
  const pointers = step?.kind === 'pairCheck' || step?.kind === 'move'
  return <ol className="pipeline-trial-row" data-testid="battery-pipeline-row"
    data-order={step?.ordered ? 'sorted' : 'original'}
    aria-label={step?.ordered ? t('排序后的电池', 'Sorted batteries') : t('初始的一排电池', 'Starting batteries')}>
    {values.map((charge, index) => {
      const left = pointers && index === step.left
      const right = pointers && index === step.right
      const marker = left && right ? t('相遇', 'Both ends') : left ? t('左端', 'Left') : right ? t('右端', 'Right') : undefined
      const inRange = range && index >= range[0] && index <= range[1]
      const outside = pointers && step.left !== undefined && step.right !== undefined && (index < step.left || index > step.right)
      return <li className="pipeline-trial-cell" key={index} data-index={index} data-charge={charge}
        data-left={left || undefined} data-right={right || undefined} data-in-range={inRange || undefined}
        data-excluded={outside || undefined}>
        <span className="pipeline-trial-charge" role="img"
          aria-label={t(`${charge} 格电量`, `${charge} units of charge`)}>{charge}</span>
        <small aria-label={t(`位置 ${index}`, `Index ${index}`)}>{index}</small>
        {marker && <small className="pipeline-trial-marker">{marker}</small>}
      </li>
    })}
  </ol>
}

export function BatteryPipelineTrial({ level, locale, source, personal, course, onReady }: {
  level: AlgorithmLevel; locale: Locale; source: string; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onReady: (source: string | undefined) => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const [trial, setTrial] = useState<ReturnType<typeof runBatteryPipelineTrial>>()
  const [position, setPosition] = useState(-1)
  const nextButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (trial?.steps.length) nextButton.current?.focus()
  }, [trial])

  const trialCase = level.batteryPipeline?.trialCase
  const sample = readBatteryPipelineCase(level.cases[trialCase ?? -1])
  if (trialCase === undefined || !sample) return null

  const shown = trial?.steps.slice(0, position + 1)
  const step = shown?.at(-1)
  const last = (trial?.steps.length ?? 0) - 1
  const atEnd = trial !== undefined && position === last
  const ordered = shown?.findLast(item => item.ordered !== undefined)?.ordered
  const comparing = step?.kind === 'pairCheck' || step?.kind === 'move'
  const checked = comparing ? shown?.findLast(item => item.kind === 'pairCheck')?.pair : undefined
  const pair = comparing ? checked : shown?.findLast(item => item.kind === 'pair')?.pair
  const prefix = shown?.findLast(item => item.prefix !== undefined)?.prefix
  const total = shown?.findLast(item => item.kind === 'total')?.total
  const helper = step && (step.kind === 'sort' || step.kind === 'pairCheck' || step.kind === 'prefix') ? helperNames[step.kind] : undefined

  function start() {
    if (trialCase === undefined) return
    setTrial(runBatteryPipelineTrial(level, source, trialCase, personal, course))
    setPosition(-1)
    onReady(undefined)
  }

  function goTo(index: number) {
    setPosition(index)
    if (trial?.passed && index === last && trial.steps[index]?.kind === 'return') onReady(source)
  }

  return <section className="panel battery-pipeline-trial" data-testid="battery-pipeline-trial" aria-labelledby={heading}>
    <div className="panel-heading"><h2 id={heading}>{t('小例子试跑', 'Try a small example')}</h2></div>
    <CodingDevice device="scanner" locale={locale} controls={<>
      <div className="pipeline-trial-controls">
        <button type="button" className={trial ? 'subtle-button' : 'primary-button'} onClick={start}>
          {trial ? t('重新试跑', 'Run again') : t('试跑小例子', 'Run the small example')}
        </button>
        {trial && <>
          <button type="button" className="subtle-button" disabled={position < 0} onClick={() => goTo(position - 1)}>
            {t('上一步', 'Previous step')}
          </button>
          <button ref={nextButton} type="button" className="primary-button" disabled={position >= last} onClick={() => goTo(position + 1)}>
            {t('下一步', 'Next step')}
          </button>
          <small>{t(`第 ${position + 1} / ${last + 1} 步`, `Step ${position + 1} / ${last + 1}`)}</small>
        </>}
      </div>
    </>}>
      <div className="pipeline-trial-body">
        <AlgorithmBatteryRack scene="shipment-rack" locale={locale} label={t('电池工单台', 'Battery work order bench')}
          batteries={(ordered ?? sample.values).map(charge => ({ charge }))}
          range={prefix ? [sample.left, sample.right] : comparing && step.left !== undefined && step.right !== undefined ? [step.left, step.right] : undefined}
          marked={comparing && step.left !== undefined && step.right !== undefined ? [step.left, step.right] : undefined}
          prefix={prefix} operands={prefix ? [sample.left, sample.right + 1] : undefined}
          readout={total !== undefined && prefix ? prefix[sample.right + 1] + ' − ' + prefix[sample.left] + ' = ' + total : undefined}
          step={step} codeId="battery-pipeline-code" onAdvance={!trial ? start : position < last ? () => goTo(position + 1) : undefined} />
        <p className="pipeline-trial-workorder">
          {t(`把电池从低到高排好，找出电量相加为 ${sample.target} 的两块，再计算排序后位置 ${sample.left} 到 ${sample.right} 的总电量。位置从 0 开始数，两端都算。`,
            `Sort the batteries by charge, find two that add up to ${sample.target}, then total sorted indices ${sample.left} to ${sample.right}. Indices start at 0. Include both ends.`)}
        </p>
        <div className="pipeline-trial-step" data-testid="battery-pipeline-step" data-kind={step?.kind ?? (trial ? 'start' : 'ready')}
          data-line={step?.line} data-left={step?.left} data-right={step?.right} data-move={step?.move} data-matched={step?.matched}>
          <h3>{ordered ? t('排序后的电池', 'Sorted batteries') : t('初始的一排电池', 'Starting batteries')}</h3>
          <ChargeRow values={ordered ?? sample.values} step={step} range={prefix ? [sample.left, sample.right] : undefined} t={t} />

          <div className="pipeline-trial-status" role="status">
            {step && <p>{describe(step, t, sample.target, checked)}</p>}
            {pair && <p className="pipeline-trial-reading">
              <strong>{step?.kind === 'pairCheck' ? t('这一对的和', 'Current sum')
                : comparing ? t('刚才的和', 'Previous sum') : t('找到的配对', 'Matching pair')}</strong>
              <code data-testid="battery-pipeline-pair">{pair.length === 2
                ? `${pair[0]} + ${pair[1]} = ${pair[0] + pair[1]}`
                : t('无配对', 'No pair')}</code>
            </p>}
            {prefix && <div className="pipeline-trial-reading">
              <strong>{t('累计表', 'Cumulative table')}</strong>
              <ol className="pipeline-trial-prefix" data-testid="battery-pipeline-prefix">
                {prefix.map((value, index) => <li key={index} data-index={index} data-value={value}
                  data-operand={index === sample.left ? 'before' : index === sample.right + 1 ? 'through' : undefined}>
                  <small>prefix[{index}]</small><strong>{value}</strong>
                </li>)}
              </ol>
            </div>}
            {total !== undefined && prefix && <p className="pipeline-trial-reading">
              <strong>{t('区间总电量', 'Range total')}</strong>
              <code data-testid="battery-pipeline-total" data-total={total}>{prefix[sample.right + 1]} − {prefix[sample.left]} = {total}</code>
            </p>}
            {atEnd && trial.issue && <p className="error-message" role="alert">{runIssueText(locale, trial.issue)}</p>}
            {atEnd && !trial.issue && !trial.passed && <p className="error-message" role="alert">
              {t('这个结果和工单对不上。检查所用的函数，或换回课程函数再试。',
                'This result does not match the work order. Check the selected functions or try the course versions.')}
            </p>}
            {atEnd && trial.passed && <p className="win-message">{t('小例子试跑完成。', 'The small example is complete.')}</p>}
          </div>
          {step && <div className="pipeline-trial-source">
            {helper && step.module && <p data-testid="battery-pipeline-module" data-module={step.module}>
              {step.module === 'my_algorithms' ? t('调用我的函数', 'Using my function') : t('调用课程函数', 'Using the course function')}{' '}
              <code>{helper}</code>
            </p>}
          </div>}
        </div>
      </div>
    </CodingDevice>
  </section>
}
