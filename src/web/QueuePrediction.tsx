import { BatterySequencePrediction, type BatterySequenceLessonProps } from './BatterySequencePrediction'

export function QueuePrediction({ execution, locale, onComplete }: BatterySequenceLessonProps) {
  return <BatterySequencePrediction kind="queue" cases={execution.queueLesson?.cases.slice(1)}
    source={execution.source} locale={locale} onComplete={onComplete} />
}
