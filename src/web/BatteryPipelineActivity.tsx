import { CommandDesk } from './Classroom'
import { useId, useState } from 'react'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { BatteryPipelinePrediction } from './BatteryPipelinePrediction'
import { BatteryPipelineTrial } from './BatteryPipelineTrial'
import { CourseHelperPicker, setHelperImport } from './CourseHelperPicker'
import { tr } from './text'

export default function BatteryPipelineActivity({ level, locale, personal, course, exercises, onOpenLevel, onComplete, onMistake }: {
  level: AlgorithmLevel; locale: Locale; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  exercises: AlgorithmLevel[]; onOpenLevel?: (id: string) => void; onComplete: () => void; onMistake?: () => void;
}) {
  const heading = useId()
  const names = level.helpers ?? []
  const hasSaved = (name: string) => Object.hasOwn(personal, name) && typeof personal[name] === 'string'
  const [source, setSource] = useState(() => names.reduce((code, name) =>
    hasSaved(name) ? setHelperImport(code, name, 'my_algorithms') : code, level.starterCode))
  const [ready, setReady] = useState<string>()
  const missing = exercises.filter(exercise => !hasSaved(exercise.functionName))
  const t = (zh: string, en: string) => tr(locale, zh, en)

  function changeSource(next: string) {
    if (next === source) return
    setSource(next)
    setReady(undefined)
  }

  return <div className="lecture-layout">
    <CommandDesk locale={locale}><section className="panel" aria-labelledby={heading}>
      <div className="panel-heading"><h2 id={heading}>{t('给工单选函数', 'Choose the work order functions')}</h2></div>
      <div className="teaching-panel">
        <p>{t('已保存的函数会自动导入。还没保存时，可以先用课程函数试跑，也可以回练习写一个再保存。',
          'Saved functions are imported automatically. You can try the course functions or go back to write and save your own.')}</p>
        <CourseHelperPicker names={names} personal={personal} course={course} code={source} onChange={changeSource} locale={locale} />
        {onOpenLevel && missing.length > 0 && <div className="choices-column">
          {missing.map(exercise => <button key={exercise.id} type="button" className="subtle-button"
            onClick={() => onOpenLevel(exercise.id)}>{t('去写函数', 'Write this function')} · {exercise.title[locale]}</button>)}
        </div>}
      </div>
    </section></CommandDesk>
    <BatteryPipelineTrial key={source} level={level} locale={locale} source={source}
      personal={personal} course={course} onReady={setReady} />
    {ready !== undefined && <CommandDesk locale={locale}>
      <BatteryPipelinePrediction level={level} source={ready} locale={locale}
      personal={personal} course={course} onComplete={onComplete} onMistake={onMistake} />
    </CommandDesk>}
  </div>
}
