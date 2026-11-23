import { CommandDesk } from './Classroom'
import { useState } from 'react'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { BatteryDispatchPrediction } from './BatteryDispatchPrediction'
import { BatteryDispatchTrial } from './BatteryDispatchTrial'
import { CourseHelperPicker } from './CourseHelperPicker'
import { tr } from './text'

export default function BatteryDispatchActivity({ level, locale, personal, course, onComplete, onMistake }: {
  level: AlgorithmLevel; locale: Locale; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onComplete: () => void; onMistake?: () => void;
}) {
  const [source, setSource] = useState(level.starterCode)
  const [ready, setReady] = useState<string>()
  const hasSavedHelper = level.helpers?.some(name => Object.hasOwn(personal, name) && typeof personal[name] === 'string')

  function changeSource(next: string) {
    if (next === source) return
    setSource(next)
    setReady(undefined)
  }

  return <div className="lecture-layout">
    {hasSavedHelper && <CommandDesk locale={locale}><details className="panel">
      <summary>{tr(locale, '用自己写的补电函数', 'Use your own charging function')}</summary>
      <CourseHelperPicker names={level.helpers} personal={personal} course={course} code={source} onChange={changeSource} locale={locale} />
    </details></CommandDesk>}
    <BatteryDispatchTrial key={source} level={level} locale={locale} source={source}
      personal={personal} course={course} onReady={setReady} onMistake={onMistake} />
    {ready !== undefined && <CommandDesk locale={locale}>
      <BatteryDispatchPrediction level={level} source={ready} locale={locale}
      personal={personal} course={course} onComplete={onComplete} onMistake={onMistake} />
    </CommandDesk>}
  </div>
}
