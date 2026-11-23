import { useEffect, useId, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import { compareRepairBoards, type RepairComparison, type RepairReport } from './breadboardRepairHistory'
import type { MeterNote } from './breadboardRepairTicket'
import { changeText, diagnosisText, meterValue, noteConditions, pinName, readingDifference } from './breadboardRepairLabels'
import BreadboardReplayPlayer from './BreadboardReplayPlayer'
import { tr } from './text'
import './breadboard-repair-report.css'

type Translate = (zh: string, en: string) => string

function outputLabel(note: MeterNote, t: Translate) {
  if (note.kind === 'continuity') return
  if (note.output === undefined) return t('D13 待设置', 'D13 not configured')
  return 'D13 ' + (note.output ? 'HIGH' : 'LOW')
}

function ComparisonList({ locale, readings, onRetest, unavailableIndex }: ComparisonProps) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  return <ol className="repair-comparisons">{readings.map(({ before, after }, index) =>
    <li key={index} className="repair-comparison" data-testid={onRetest ? 'bread-comparison-' + index : 'bread-report-comparison-' + index}>
      <div className="repair-probe-pair">
        <span className="repair-pin" data-probe="red">{t('红表笔', 'Red')} <b>{pinName(before.red)}</b></span>
        <span className="repair-pin" data-probe="black">{t('黑表笔', 'Black')} <b>{pinName(before.black)}</b></span>
      </div>
      <p className="repair-conditions">{noteConditions(before, t)}</p>
      <dl className="repair-reading-pair">
        <div><dt>{t('修理前', 'Before repair')}</dt><dd>{meterValue(before, t)}</dd>{outputLabel(before, t) && <dd className="repair-output">{outputLabel(before, t)}</dd>}</div>
        <div data-measured={!!after}><dt>{t('复测', 'Retest')}</dt>
          <dd>{after ? meterValue(after, t) : t('未复测', 'Not retested')}</dd>{after && outputLabel(after, t) && <dd className="repair-output">{outputLabel(after, t)}</dd>}
        </div>
      </dl>
      <div aria-live="polite">
        {after && <p className="repair-difference">{readingDifference(before, after, t)}</p>}
        {unavailableIndex === index && <p className="repair-reading-error" role="status">{t('这次没有取得可对照的读数。检查供电和程序输出，再测一次。', 'No comparable reading this time. Check the power and sketch output, then try again.')}</p>}
      </div>
      {onRetest && <button type="button" className="subtle-button" data-testid={'bread-retest-' + index}
        aria-label={t('原位复测，红表笔 ', 'Retest in place, red ') + pinName(before.red) + t('，黑表笔 ', ', black ') + pinName(before.black) + ' · ' + noteConditions(before, t)}
        onClick={() => onRetest(index)}>{t('放回表笔并复测', 'Return probes and retest')}</button>}
    </li>)}</ol>
}

type ComparisonProps = { locale: Locale; readings: RepairComparison[]; onRetest?: (index: number) => void; unavailableIndex?: number }

export function RepairReadingComparison(props: ComparisonProps & { onRetest: (index: number) => void }) {
  const t: Translate = (zh, en) => tr(props.locale, zh, en)
  if (!props.readings.length) return null
  return <section className="repair-report-ui" data-testid="bread-repair-comparison">
    <h2>{t('原位复测', 'Retest the same contacts')}</h2>
    <p>{t('选一项读数，表笔、档位和按钮会回到当时的位置。', 'Choose a reading to restore its probe positions, meter setting and button state.')}</p>
    <ComparisonList {...props} />
  </section>
}


function ReportDetails({ report, locale, active }: { report: RepairReport; locale: Locale; active?: boolean }) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const changes = compareRepairBoards(report.original, report.repaired)
  const revised = report.firstDiagnosis !== report.diagnosis
  return <article className="repair-report-detail" data-testid="bread-saved-report">
    {active !== undefined && <BreadboardReplayPlayer key={report.id} report={report} locale={locale} active={active} />}
    <h3>{t('当时的判断', 'My diagnosis')}</h3>
    <div className="repair-diagnosis" data-testid="bread-report-diagnosis">{revised
      ? <dl><div><dt>{t('最初判断', 'First guess')}</dt><dd>{diagnosisText(report.firstDiagnosis, t)}</dd></div>
        <div><dt>{t('最后判断', 'Final diagnosis')}</dt><dd>{diagnosisText(report.diagnosis, t)}</dd></div></dl>
      : <p>{diagnosisText(report.diagnosis, t)}</p>}</div>
    <h3>{t('改了哪里', 'What I changed')}</h3>
    <ul className="repair-changes" data-testid="bread-report-changes">{changes.map((change, index) => <li key={index}>{changeText(change, t)}</li>)}</ul>
    <h3>{t('读数对照', 'Meter readings')}</h3>
    <ComparisonList locale={locale} readings={report.readings} />
    <h3>{t('运行呼叫灯程序的结果', 'Call light test results')}</h3>
    <dl className="breadboard-observations" data-testid="bread-report-validation">{(['closed', 'open'] as const).map(state => {
      const result = report.validation[state]
      return <div key={state}><dt>{state === 'closed' ? t('按下按钮', 'Button pressed') : t('松开按钮', 'Button released')}</dt>
        <dd>{result.ledOn ? t('灯亮', 'LED on') : t('灯灭', 'LED off')}
          <small>D2 {result.d2 ? 'HIGH' : 'LOW'} · D13 {result.d13 ? 'HIGH' : 'LOW'}</small>
        </dd></div>
    })}</dl>
  </article>
}

export function RepairReportHistory({ locale, reports, openRequest }: {
  locale: Locale; reports: RepairReport[]; openRequest?: { id: string; sequence: number }
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const [selectedId, setSelectedId] = useState<string>()
  const [open, setOpen] = useState<boolean>()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const handled = useRef<typeof openRequest>(undefined)
  const selectId = useId()
  const selected = reports.find(report => report.id === selectedId) ?? reports[0]
  useEffect(() => {
    if (!openRequest || !detailsRef.current || !summaryRef.current || !reports.some(report => report.id === openRequest.id)) return
    if (handled.current?.id === openRequest.id && handled.current.sequence === openRequest.sequence) return
    handled.current = openRequest
    setSelectedId(openRequest.id)
    detailsRef.current.open = true
    summaryRef.current.focus({ preventScroll: true })
    summaryRef.current.scrollIntoView({ block: 'start' })
  }, [openRequest, reports])
  if (!selected) return null
  function date(report: RepairReport) {
    return new Date(report.completedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
  }
  return <section className="repair-report-ui">
    <details ref={detailsRef} className="repair-archive" data-testid="bread-repair-history" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary ref={summaryRef}>{t('维修记录', 'Repair records')} · {reports.length}</summary>
      {reports.length > 1 ? <div className="repair-report-picker">
        <label htmlFor={selectId}>{t('查看哪张记录', 'Choose a repair record')}</label>
        <select id={selectId} data-testid="bread-report-select" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
          {reports.map((report, index) => <option key={report.id} value={report.id}>
            {'#' + (reports.length - index) + ' · ' + date(report)}
          </option>)}
        </select>
      </div> : <p className="repair-report-date"><time dateTime={new Date(selected.completedAt).toISOString()}>{date(selected)}</time></p>}
      <ReportDetails report={selected} locale={locale} active={open} />
    </details>
  </section>
}
