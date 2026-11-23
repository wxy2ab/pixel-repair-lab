import type { Locale } from '../shared/types'
import { tr } from './text'
import type { FaultKind, MeterNote } from './breadboardRepairTicket'

type Props = {
  locale: Locale; notes: MeterNote[]; diagnosis?: FaultKind; current?: MeterNote
  original: boolean; verified: boolean; onRecord: (note: MeterNote) => void; onChoose: (fault: FaultKind) => void
}

export default function BreadboardRepairCard({ locale, notes, diagnosis, current, original, verified, onRecord, onChoose }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const label = (kind: FaultKind) => kind === 'wrong-jumper' ? t('跳线插错孔', 'Misplaced jumper') : t('LED 接反', 'Reversed LED')
  function value(note: MeterNote) {
    if (note.kind === 'voltage') return (note.volts < 0 ? '−' : '') + Math.abs(note.volts).toFixed(1) + ' V'
    if (note.kind === 'floating') return t('电压不确定', 'Floating voltage')
    return note.connected ? t('相通', 'Continuity') : t('未直通', 'No continuity')
  }
  return <section className="bread-repair-card" data-testid="bread-repair-ticket">
    <h2>{t('呼叫灯维修单', 'Call light repair ticket')}</h2>
    <p>{verified ? t('呼叫灯已修好。可以把表笔放回原孔，比较维修前后的读数。', 'The call light is repaired. Return the probes to their original contacts to compare the readings.')
      : t('按下按钮，呼叫灯却不亮。修好后应当按下就亮，松开就灭。', 'The call light stays dark when pressed. A working light turns on when pressed and off when released.')}</p>
    {original && <h3>{t('修理前的读数', 'Readings before repair')}</h3>}
    {original && <p>{t('断电查一根跳线的两端，或查 LED 两脚是否相通。也可以运行程序，按下按钮，等 D13 为 HIGH 时量 LED 两脚之间的电压。', 'With power off, check the ends of a jumper or the two LED legs for continuity. Or run the sketch, press the button and measure across the LED when D13 is HIGH.')}</p>}
    {original && notes.length > 0 && <ul className="bread-ticket-notes" aria-live="polite" data-testid="bread-repair-notes">
      {notes.map((note, index) => <li key={index}><span>{t('红', 'Red')} {note.red.replace('uno-', '')} · {t('黑', 'Black')} {note.black.replace('uno-', '')}
        <small>{note.kind === 'continuity' ? t('断电', 'Power off') : t('通电', 'Power on')} · {note.pressed ? t('按下', 'Pressed') : t('松开', 'Released')}
          {note.output !== undefined && ' · D13 ' + (note.output ? 'HIGH' : 'LOW')}</small></span><strong>{value(note)}</strong></li>)}
    </ul>}
    {original && <button type="button" className="subtle-button" data-testid="bread-repair-record" disabled={!current}
      onClick={() => current && onRecord(current)}>{t('记下这次读数', 'Record this reading')}</button>}
    <h3>{t('你判断故障在哪里？', 'What do you think caused the fault?')}</h3>
    <div className="breadboard-actions" role="group" aria-label={t('故障判断', 'Fault diagnosis')}>
      {(['wrong-jumper', 'reversed-led'] as const).map(kind => <button type="button" key={kind} className="subtle-button"
        data-testid={'bread-diagnose-' + kind} disabled={!notes.length || verified} aria-pressed={diagnosis === kind}
        onClick={() => onChoose(kind)}>{label(kind)}</button>)}
    </div>
    {!verified && <p role="status">{diagnosis ? t('判断已记下。可以改线或翻转 LED，再运行程序验证。', 'Diagnosis recorded. Adjust the wiring or flip the LED, then run the sketch to verify your repair.')
      : notes.length ? t('根据读数选一个判断，就可以开始修理。', 'Choose a diagnosis from your reading to start the repair.')
      : t('先用表笔测量，把一项读数记在工单上。', 'Use the probes and record a reading on the ticket first.')}</p>}
  </section>
}
