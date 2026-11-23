import { runModuleLesson } from '../engine/programModuleLesson'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { ChargePrediction } from './ChargePrediction'
import { tr } from './text'

export function ModulePrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const lesson = execution.moduleLesson
  if (!lesson) return null

  const filename = `${lesson.moduleName}.py`
  return <ChargePrediction execution={execution} locale={locale} onComplete={onComplete}
    description={tr(locale, `主程序会从 ${filename} 导入 ${lesson.functionName}，再把你选的起始电量传给它。`,
      `The main program imports ${lesson.functionName} from ${filename}, then passes it the charge you choose.`)}
    runExample={input => runModuleLesson(execution, input)?.output} />
}
