import { useEffect, useMemo, useRef, useState } from 'react'
import type { MeterReading } from '../engine/breadboardMeter'
import type { Locale } from '../shared/types'
import { meterDisplay } from './BreadboardMeter'
import BreadboardReplayBoard from './BreadboardReplayBoard'
import type { RepairReport } from './breadboardRepairHistory'
import { changeText, diagnosisText, pinName } from './breadboardRepairLabels'
import { repairReplayFrames, type RepairReplayFrame } from './breadboardRepairReplay'
import { replayStepCategory, replayStepIndices, replayStepPosition, type ReplayStepFilter } from './breadboardReplaySteps'
import BreadboardReplayStepList from './BreadboardReplayStepList'
import { findReplayRetest } from './breadboardReplayComparison'
import BreadboardRetestComparison from './BreadboardRetestComparison'
import { tr } from './text'
import './breadboard-repair-replay.css'

const stepDuration = 1800
type Translate = (zh: string, en: string) => string

function actionText({ action, changes, bench }: RepairReplayFrame, t: Translate) {
  switch (action.kind) {
    case 'start': return t('开始检查呼叫灯', 'Inspect the call light')
    case 'resume': return t('从保存的面包板继续排查', 'Continue with the saved board')
    case 'measure': return action.note.kind === 'continuity' ? t('用通断档查连接', 'Check continuity') : t('用电压档测两点', 'Measure the voltage')
    case 'retest': return t('把表笔放回原孔复测', 'Retest at the original contacts')
    case 'diagnosis': return t('我的判断是', 'My diagnosis was ') + diagnosisText(action.diagnosis, t)
    case 'button': return bench.pressed ? t('按下按钮', 'Press the button') : t('松开按钮', 'Release the button')
    case 'power': return bench.powered ? t('给面包板通电', 'Turn on the board') : t('断开电源', 'Switch off the supply')
    case 'edit': return changes.map(change => changeText(change, t)).join(t('。', '. ')) || t('检查面包板接线', 'Inspect the wiring')
    case 'test': return action.observation.ledOn ? t('运行程序，看到灯亮', 'The sketch turned the light on') : t('运行程序，看到灯灭', 'The external light was off when the sketch ran')
    case 'check': return action.passed ? t('呼叫灯验收通过', 'Call light check passed') : t('这次验收还没通过', 'This check did not pass')
  }
}

function FrameDisplay({ frame, index, locale }: { frame: RepairReplayFrame; index: number; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { bench } = frame
  const unknown = t('未记录', 'Not recorded')
  const missingPin = frame.snapshot ? unknown : t('未放置', 'Off board')
  const mode = bench.mode === 'continuity' ? t('通断档', 'Continuity') : bench.mode === 'voltage' ? t('电压档', 'DC volts') : t('万用表', 'Multimeter')
  const reading = bench.reading && meterDisplay(bench.reading, locale)
  const status: Partial<Record<MeterReading['kind'], string>> = {
    'protected': t('电源保护已切断输出。', 'Protection cut off the supply.'),
    'power-off-first': t('通电时不能测通断。', 'Continuity cannot be measured with the power on.'),
    'unpowered': t('面包板已断电，电压档没有读数。', 'The board was off, so the voltage reading was unavailable.'),
    'place-probes': t('两支表笔还没就位。', 'The two probes were not both in place.'),
  }
  const unavailable = bench.reading && status[bench.reading.kind]
  const signal = (bit?: number | null) => bit == null ? '—' : bit ? 'HIGH' : 'LOW'
  return <div className="repair-replay-frame" data-testid="bread-replay-frame" data-frame-index={index} data-kind={frame.action.kind} data-snapshot={frame.snapshot}>
    <BreadboardReplayBoard frame={frame} locale={locale} />
    <div className="replay-instrument">
      <div className="replay-meter-lcd"><span>{mode}</span>
        <strong data-testid="bread-replay-reading">{reading?.value ?? '—'}</strong>
      </div>
      <div className="replay-tips">{(['red','black'] as const).map(color => <span key={color} className="repair-pin" data-probe={color}>
        {color === 'red' ? t('红表笔', 'Red') : t('黑表笔', 'Black')} <b>{bench[color] ? pinName(bench[color]) : missingPin}</b>
      </span>)}</div>
    </div>
    {unavailable && <p className="replay-meter-note">{unavailable}</p>}
    <p className="replay-caption" data-testid="bread-replay-caption">{actionText(frame, t)}</p>
    <p className="replay-bench-state" data-testid="bread-replay-conditions">
      <span>{bench.pressed === undefined ? t('按钮状态未记录', 'Button state not recorded') : bench.pressed ? t('按钮按下', 'Button pressed') : t('按钮松开', 'Button released')}</span>
      <span>{bench.powered === undefined ? t('供电状态未记录', 'Power state not recorded') : bench.powered ? t('已通电', 'Power on') : t('已断电', 'Power off')}</span>
      <span>{bench.ledOn === undefined ? t('灯的状态未记录', 'LED state not recorded') : bench.ledOn ? t('灯亮', 'LED on') : t('灯灭', 'LED off')}</span>
      {bench.d2 !== undefined && <span>D2 {signal(bench.d2)}</span>}
      {bench.d13 !== undefined && <span>D13 {signal(bench.d13)}</span>}
    </p>
  </div>
}

export default function BreadboardReplayPlayer({ report, locale, active }: { report: RepairReport; locale: Locale; active: boolean }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const frames = useMemo(() => repairReplayFrames(report), [report])
  const [category, setCategory] = useState<ReplayStepFilter>('all')
  const visibleIndices = useMemo(() => replayStepIndices(frames, category), [frames, category])
  // Store a position in the full record so the same physical snapshot survives a filter change.
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [comparing, setComparing] = useState(false)
  const compareButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const position = replayStepPosition(visibleIndices, step)
  const current = visibleIndices[position] ?? -1
  const frame = frames[current]
  const isMeasurement = frame && replayStepCategory(frame) === 'measure'
  const comparison = useMemo(() => isMeasurement ? findReplayRetest(frames, current, report) : undefined,
    [frames, current, report, isMeasurement])
  const comparisonOpen = comparing && !!comparison
  const previous = visibleIndices[position - 1]
  const next = visibleIndices[position + 1]
  const total = visibleIndices.length
  useEffect(() => {
    if (!playing) return
    if (!active || next === undefined) {
      setPlaying(false)
      return
    }
    if (comparisonOpen) return
    const timer = window.setTimeout(() => setStep(next), stepDuration)
    return () => window.clearTimeout(timer)
  }, [active, category, next, playing, comparisonOpen])
  useEffect(() => {
    if (!comparisonOpen && restoreFocus.current) {
      restoreFocus.current = false
      compareButton.current?.focus()
    }
  }, [comparisonOpen])
  if (!frames.length) return null

  function changeCategory(value: ReplayStepFilter) {
    if (value === category) return
    const matches = replayStepIndices(frames, value)
    const at = replayStepPosition(matches, current >= 0 ? current : step)
    if (at !== -1) setStep(matches[at])
    if (matches[at + 1] === undefined) setPlaying(false)
    setCategory(value)
  }
  function seek(target: number) {
    setPlaying(false)
    setStep(target)
  }
  function togglePlay() {
    if (total < 2) return
    if (!playing && next === undefined) setStep(visibleIndices[0])
    setPlaying(!playing)
  }
  return <div className="repair-replay" role="region" aria-label={t('排查过程回放', 'Troubleshooting replay')} data-testid="bread-replay">
    <h3>{t('排查过程回放', 'Troubleshooting replay')}</h3>
    {frame?.snapshot && <p className="replay-source-note">{t('这张旧工单按保存的读数和验收快照展示。完整操作顺序未记录。', 'This older ticket shows saved readings and test snapshots. The full sequence of actions was not recorded.')}</p>}
    {comparisonOpen && comparison ? <BreadboardRetestComparison comparison={comparison} locale={locale}
      onBack={() => { restoreFocus.current = true; setComparing(false) }} /> : <div className="repair-replay-layout">
      <BreadboardReplayStepList locale={locale} frames={frames} visibleIndices={visibleIndices} currentIndex={current}
        category={category} onCategoryChange={changeCategory} onStepSelect={seek} describeStep={item => actionText(item, t)}>
        {isMeasurement && <div className="repair-step-pair">
          {comparison ? <button type="button" ref={compareButton} className="subtle-button" data-testid="bread-replay-compare"
            onClick={() => setComparing(true)}>{t('对比修好后的复测', 'Compare with the retest')}</button>
            : <p data-testid="bread-replay-compare-missing">{t('这次测量还没有能配对的修后复测记录。', 'No matching retest was recorded for this measurement after repair.')}</p>}
        </div>}
      </BreadboardReplayStepList>
      <div className="repair-replay-scene">
        <div className="repair-playback">
          <span role="status" data-testid="bread-replay-position">{total
            ? t('第 ' + (position + 1) + ' / ' + total + ' 步', 'Step ' + (position + 1) + ' / ' + total)
            : t('0 步', '0 steps')}</span>
          <div className="replay-progress" aria-hidden="true"><span style={{ width: (total ? (position + 1) / total * 100 : 0) + '%' }} /></div>
          {category !== 'all' && frame && <small>{t('完整过程第 ' + (current + 1) + ' 步', 'Full process step ' + (current + 1))}</small>}
        </div>
        {frame && <FrameDisplay frame={frame} index={current} locale={locale} />}
        <div role="group" className="repair-replay-controls" aria-label={t('控制回放', 'Playback controls')}>
          <button type="button" className="subtle-button" data-testid="bread-replay-previous" disabled={previous === undefined} onClick={() => seek(previous)}>{t('上一步', 'Previous')}</button>
          <button type="button" className="primary-button" data-testid="bread-replay-play" aria-pressed={playing}
            disabled={total < 2} onClick={togglePlay}>{playing ? t('暂停', 'Pause') : t('自动播放', 'Auto play')}</button>
          <button type="button" className="subtle-button" data-testid="bread-replay-next" disabled={next === undefined} onClick={() => seek(next)}>{t('下一步', 'Next')}</button>
        </div>
      </div>
    </div>}
  </div>
}
