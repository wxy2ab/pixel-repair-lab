import { CommandDesk } from './Classroom'
import { useState } from 'react'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { ChargingChallenge } from './ChargingChallenge'
import { ChargingChallengePrediction } from './ChargingChallengePrediction'

export default function ChargingChallengeActivity({ level, locale, personal, course, onOpenHelper, onComplete, onMistake }: {
  level: AlgorithmLevel; locale: Locale; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onOpenHelper?: () => void; onComplete: () => void; onMistake?: () => void;
}) {
  const [source, setSource] = useState<string>()

  return <div className="lecture-layout">
    <ChargingChallenge level={level} locale={locale} personal={personal} course={course} onOpenHelper={onOpenHelper} onReady={setSource} />
    {source !== undefined && <CommandDesk locale={locale}>
      <ChargingChallengePrediction key={source} level={level} source={source} locale={locale}
      personal={personal} course={course} onComplete={onComplete} onMistake={onMistake} />
    </CommandDesk>}
  </div>
}
