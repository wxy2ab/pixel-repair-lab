import { BatterySequencePrediction, type BatterySequenceLessonProps } from './BatterySequencePrediction'

export function StackPrediction({ execution, locale, onComplete }: BatterySequenceLessonProps) {
  return <BatterySequencePrediction kind="stack" cases={execution.stackLesson?.cases.slice(1)}
    source={execution.source} locale={locale} onComplete={onComplete} />
}
