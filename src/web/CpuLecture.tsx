import { useMemo } from 'react'
import { runCpuLecture } from '../engine/cpuLecture'
import type { CpuLectureConfig } from '../shared/hardware'
import type { Locale } from '../shared/types'
import { CpuDatapath } from './CpuDatapath'
import { InlineExecutionSource } from './InlineExecutionSource'
import { runIssueText, tr } from './text'
import './cpu-lecture.css'

export function CpuLecture({ hardware, step, locale, advance, onInspect }: {
  hardware: CpuLectureConfig; step: number; locale: Locale; advance?: () => void; onInspect?: () => void
}) {
  const trace = useMemo(() => runCpuLecture(hardware), [hardware])
  const { pc, phase } = hardware.checkpoints[step]
  const frame = trace.frames[pc]
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (!frame) return <p role="alert" className="error-message">{trace.issue ? runIssueText(locale, trace.issue)
    : t('程序没有运行到这条指令。', 'The program did not reach this instruction.')}</p>
  const before = trace.frames[pc - 1]?.state ?? trace.initial
  const state = phase === 'execute' ? frame.state : before
  const upcoming = phase === 'execute' && !state.halted ? trace.frames[state.pc] : undefined
  return <section className="cpu-lecture" data-phase={phase} data-instruction-index={pc} aria-label={t('CPU 指令观察台', 'CPU instruction bench')}>
    <CpuDatapath state={state} previous={before} instruction={frame.instruction} line={frame.line} phase={phase} locale={locale}
      onStep={step + 1 < hardware.checkpoints.length ? advance : undefined} onAddress={onInspect} />
    <div className="cpu-lecture-program">
      <ol aria-label={t('指令周期', 'Instruction cycle')}>
        {(['fetch', 'decode', 'execute'] as const).map((stage, i) => <li key={stage} aria-current={stage === phase ? 'step' : undefined}>
          {i > 0 && <span aria-hidden="true">→ </span>}
          {stage === 'fetch' ? t('取指', 'Fetch') : stage === 'decode' ? t('辨认（译码）', 'Decode') : t('执行', 'Execute')}
        </li>)}
      </ol>
      <pre className="sample-code station-source" aria-label={t('CPU 程序', 'CPU program')}>
        <InlineExecutionSource code={hardware.source} currentLine={frame.line} nextLine={upcoming?.line} locale={locale} />
      </pre>
    </div>
  </section>
}
