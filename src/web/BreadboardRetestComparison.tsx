import { useEffect, useId, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import BreadboardReplayBoard from './BreadboardReplayBoard'
import { changeText, meterValue, noteConditions, pinName, readingDifference } from './breadboardRepairLabels'
import type { ReplayRetestComparison } from './breadboardReplayComparison'
import { tr } from './text'
import './breadboard-retest-comparison.css'

type Props = { comparison: ReplayRetestComparison; locale: Locale; onBack: () => void }

export default function BreadboardRetestComparison({ comparison, locale, onBack }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { before, after, changes } = comparison
  const [enlarged, setEnlarged] = useState(false)
  const back = useRef<HTMLButtonElement>(null)
  const title = useId()
  useEffect(() => { back.current?.focus() }, [])

  return <div className="repair-retest-comparison" role="region" aria-labelledby={title} data-testid="bread-replay-comparison">
    <div className="repair-retest-toolbar">
      <h4 id={title}>{t('测量与复测', 'Measurement and retest')}</h4>
      <button ref={back} type="button" className="subtle-button" onClick={onBack} data-testid="bread-replay-comparison-back">
        <span aria-hidden="true">← </span>{t('返回第 ', 'Back to step ')}{before.index + 1}{t(' 步', '')}
      </button>
    </div>
    <div className="repair-retest-conditions" data-testid="bread-replay-comparison-conditions">
      <span className="repair-pin" data-probe="red">{t('红表笔', 'Red probe')} <b>{pinName(before.note.red)}</b></span>
      <span className="repair-pin" data-probe="black">{t('黑表笔', 'Black probe')} <b>{pinName(before.note.black)}</b></span>
      <span>{noteConditions(before.note, t)}</span>
    </div>
    <div className="repair-retest-boards" data-enlarged={enlarged}>
      {(['before', 'after'] as const).map(side => {
        const { frame, index, note } = comparison[side]
        return <figure key={side} className="repair-retest-card" data-side={side} data-frame-index={index}
          data-testid={'bread-replay-comparison-' + side}>
          <figcaption>
            <strong>{side === 'before' ? t('修理前', 'Before repair') : t('修好后复测', 'After repair')}</strong>
            <small>{t('第 ', 'Step ')}{index + 1}{t(' 步', '')}</small>
          </figcaption>
          <BreadboardReplayBoard frame={frame} locale={locale} comparison={{ changes, side }} />
          <div className="repair-retest-reading">
            <small>{note.kind === 'continuity' ? t('通断', 'Continuity') : t('直流电压', 'DC voltage')}</small>
            <strong data-testid="bread-replay-reading">{meterValue(note, t)}</strong>
          </div>
          {note.kind !== 'continuity' && note.output !== undefined && <div className="repair-retest-output">D13 {note.output ? 'HIGH' : 'LOW'}</div>}
        </figure>
      })}
    </div>
    <button className="repair-retest-zoom subtle-button" type="button" aria-pressed={enlarged} onClick={() => setEnlarged(!enlarged)}>
      {enlarged ? t('并排查看', 'View side by side') : t('放大面包板', 'Enlarge boards')}
    </button>
    <p className="repair-retest-difference" data-testid="bread-replay-comparison-difference">{readingDifference(before.note, after.note, t)}</p>
    <div className="repair-retest-changes" data-testid="bread-replay-comparison-changes">
      <h5>{t('改了哪里', 'What changed')}</h5>
      {changes.length ? <ul>{changes.map((change, i) => <li key={i}>{changeText(change, t)}</li>)}</ul>
        : <p>{t('两次接线相同。', 'Both boards have the same wiring.')}</p>}
    </div>
  </div>
}
