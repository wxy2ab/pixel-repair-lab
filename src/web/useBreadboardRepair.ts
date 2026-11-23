import { useEffect, useMemo, useRef, useState } from 'react'
import type { BreadboardBuild, BreadboardLevel } from '../shared/breadboard'
import { compareRepairBoards, readRepairHistory, saveRepairReport, type RepairComparison, type RepairObservation, type RepairReport } from './breadboardRepairHistory'
import { newRepairAttemptId, recordRepairNote, saveRepairTicket, type FaultKind, type MeterNote, type RepairTicket } from './breadboardRepairTicket'
import { discardRepairReplay, newReplayEvent, readRepairReplay, saveRepairReplay,
  type RepairReplayAction, type RepairReplayBench, type RepairReplayEvent } from './breadboardRepairReplay'

type WorkOrder = {
  id: string; readings: RepairComparison[]; diagnosis?: FaultKind; firstDiagnosis?: FaultKind
}

// Opening the workbench always starts off, released, with both probes in the tray.
const benchAtOpen: RepairReplayBench = {
  powered: false, pressed: false, ledOn: false, d2: null, d13: null, mode: 'continuity', reading: { kind: 'place-probes' },
}

type Journal = { id: string; events: RepairReplayEvent[]; opening?: { action: RepairReplayAction; bench: RepairReplayBench } }

export function useBreadboardRepair(level: BreadboardLevel, ticket: RepairTicket | undefined, preview: boolean,
  originalBoard: BreadboardBuild | undefined, build: BreadboardBuild) {
  const [history, setHistory] = useState(() => ticket ? readRepairHistory(level, preview) : [])
  const [order, setOrder] = useState<WorkOrder>(() => {
    const saved = history.find(entry => entry.id === ticket?.id && !compareRepairBoards(entry.repaired, build).length)
    return {
      id: ticket?.id ?? '', firstDiagnosis: saved?.firstDiagnosis ?? ticket?.firstDiagnosis,
      diagnosis: saved?.diagnosis ?? ticket?.diagnosis,
      readings: saved?.readings ?? ticket?.notes.map((before, i) => ({ before, after: ticket.after?.[i] ?? undefined })) ?? [],
    }
  })
  const { firstDiagnosis, diagnosis, readings, id } = order
  const notes = useMemo(() => readings.map(entry => entry.before), [readings])
  const report = useMemo(() => history.find(entry => entry.id === id && !compareRepairBoards(entry.repaired, build).length), [history, id, build])
  const original = useMemo(() => !!originalBoard && !compareRepairBoards(originalBoard, build).length, [originalBoard, build])
  const [initialJournal] = useState<Journal>(() => {
    const events = report ? report.events ?? [] : ticket ? readRepairReplay(level, id, preview) : []
    const resume = ticket?.resumed || report || events.length
    const prior = !report && !events.length && notes.length ? { notes, firstDiagnosis, diagnosis } : undefined
    const action: RepairReplayAction = resume ? { kind: 'resume', build, archived: !!report && !events.length, prior } : { kind: 'start' }
    return { id, events, opening: { action, bench: benchAtOpen } }
  })
  const journal = useRef(initialJournal)
  useEffect(() => {
    if (ticket && !preview) saveRepairTicket(level, { index: ticket.index, id, build, notes, diagnosis, firstDiagnosis,
      after: readings.map(entry => entry.after ?? null) })
  }, [ticket, preview, level, id, build, notes, diagnosis, firstDiagnosis, readings])

  function append(action: RepairReplayAction, bench: RepairReplayBench) {
    const log = journal.current
    const additions: RepairReplayEvent[] = []
    if (log.opening) {
      additions.push(newReplayEvent(log.opening.action, log.opening.bench, log.events.at(-1)))
      log.opening = undefined
    }
    const previous = additions.at(-1) ?? log.events.at(-1)
    // The child can inspect a reading, then immediately pin it to the ticket.
    // These show the very same measurement. An explicit retest is always a new step.
    if (action.kind === 'measure' && previous?.action.kind === 'measure'
      && JSON.stringify(previous.action.note) === JSON.stringify(action.note)
      && JSON.stringify(previous.bench) === JSON.stringify(bench)) return
    additions.push(newReplayEvent(action, bench, previous))
    log.events = [...log.events, ...additions]
    if (!report || report.id !== log.id) saveRepairReplay(level, log.id, additions, preview)
  }

  function choose(choice: FaultKind, bench: RepairReplayBench) {
    if (report || diagnosis === choice) return
    append({ kind: 'diagnosis', diagnosis: choice }, bench)
    setOrder({ ...order, diagnosis: choice, firstDiagnosis: firstDiagnosis ?? choice })
  }

  function measured(note: MeterNote, bench: RepairReplayBench) {
    if (ticket && !report) append({ kind: 'measure', note }, bench)
  }

  function record(note: MeterNote, bench: RepairReplayBench) {
    if (!original) return
    measured(note, bench)
    setOrder({ ...order, readings: recordRepairNote(notes, note).map(before => ({ before })) })
  }

  function edited(next: BreadboardBuild, before: RepairReplayBench, after: RepairReplayBench, reset: boolean) {
    if (!ticket) return
    if (reset) {
      if (!report) discardRepairReplay(level, id, preview)
      const freshId = newRepairAttemptId()
      journal.current = { id: freshId, events: [], opening: { action: { kind: 'start' }, bench: benchAtOpen } }
      setOrder({ id: freshId, readings: [] })
      return
    }
    if (report) {
      journal.current = { id: newRepairAttemptId(), events: [],
        opening: { action: { kind: 'resume', build, prior: { notes, firstDiagnosis, diagnosis } }, bench: before } }
    }
    append({ kind: 'edit', build: next }, after)
    setOrder({ ...order, id: journal.current.id, readings: notes.map(before => ({ before })) })
  }

  function archive(snapshot: RepairReport) {
    const saved = saveRepairReport(level, snapshot, preview)
    if (!report && saved.events?.length) discardRepairReplay(level, saved.id, preview, saved.events)
    setHistory(previous => [saved, ...previous.filter(entry => entry.id !== saved.id)]
      .sort((a, b) => b.completedAt - a.completedAt))
  }

  function tested(observation: RepairObservation, bench: RepairReplayBench) {
    if (ticket && !report) append({ kind: 'test', observation }, bench)
  }

  function switched(kind: 'button' | 'power', bench: RepairReplayBench) {
    if (ticket && !report) append({ kind }, bench)
  }

  function check(passed: boolean, bench: RepairReplayBench, validation?: RepairReport['validation']) {
    if (!ticket || report) return
    append({ kind: 'check', passed }, bench)
    if (passed && validation && originalBoard && firstDiagnosis && diagnosis) {
      archive({ id, completedAt: Date.now(), firstDiagnosis, diagnosis, original: originalBoard, repaired: build, readings, validation,
        events: journal.current.events })
    }
  }

  function retested(index: number, after: MeterNote | undefined, bench: RepairReplayBench) {
    append({ kind: 'retest', note: after, source: readings[index].before }, bench)
    const updated = after ? readings.map((entry, i) => i === index ? { ...entry, after } : entry) : readings
    if (after) setOrder({ ...order, readings: updated })
    if (report) archive({ ...report, readings: updated, events: journal.current.events })
  }

  return { original, notes, readings, diagnosis, history, report, choose, record, measured, edited, check, tested, switched, retested }
}
