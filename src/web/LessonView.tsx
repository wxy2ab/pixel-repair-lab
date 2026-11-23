import { lazy, Suspense } from 'react'
import type { PersonalAlgorithms } from '../shared/advanced'
import type { Level, Locale } from '../shared/types'
import type { RealtimeArenaCheckpoint } from '../engine/realtimeProtocol'
import { resolveCourseHelpers } from '../shared/courseHelpers'
import { breadboardProgram, type BreadboardLevel } from '../shared/breadboard'
import { boardForArduino, saveBreadboardDraft } from './breadboardDraft'
import { challengeZoneId } from '../shared/coursePrerequisites'
import { AlgorithmPractice, ArenaPlay } from './AdvancedPlay'
import { ChallengeReviewProvider } from './ChallengeFailureReview'
import type { ChallengeDraft } from './challengeDraft'
import type { ArenaReplayProgress } from './arenaReplayProgress'
import type { ChallengeRunHandlers, ChallengeScore } from './challengeScore'
import { GridLesson } from './GridLesson'
import { Classroom } from './Classroom'
import { lessonRoomFor } from './station3d/lessonRoom'
import { isGradedPractice } from './learningRecordModel'

import { tr } from './text'

const CircuitLesson = lazy(() => import('./CircuitLesson'))
const ArduinoLesson = lazy(() => import('./ArduinoLesson'))
const BreadboardLesson = lazy(() => import('./BreadboardLesson'))
const MachineLesson = lazy(() => import('./MachineLesson'))
const DataLesson = lazy(() => import('./DataLesson'))
const VisionLesson = lazy(() => import('./VisionLesson'))
const LabDemo = lazy(() => import('../labs/LabDemo'))
const AiLesson = lazy(() => import('../ai/AiLesson'))
const ChargingChallengeActivity = lazy(() => import('./ChargingChallengeActivity'))
const BatteryDispatchActivity = lazy(() => import('./BatteryDispatchActivity'))
const BatteryPipelineActivity = lazy(() => import('./BatteryPipelineActivity'))
const Lecture = lazy(() => import('./TeachingStages').then(module => ({ default: module.Lecture })))
const TeachingReplay = lazy(() => import('./TeachingStages').then(module => ({ default: module.TeachingReplay })))

type LessonProps = {
  level: Level; locale: Locale; onComplete: () => void; onMistake?: () => void; preview?: boolean;
  personal?: PersonalAlgorithms; catalog?: Level[]; onSave?: (name: string, source: string) => void; onOpenLevel?: (id: string) => void;
  completed?: string[]; onReviewLesson?: (challengeId: string, lessonId: string) => void;
  challenge?: ChallengeRunHandlers
  initialArenaMode?: 'relaxed' | 'timed'
  replayAiMode?: Extract<ChallengeScore, { kind: 'ai' }>['mode']
  initialDraft?: ChallengeDraft
  onDraftChange?: (draft: ChallengeDraft) => void
  initialTimedCheckpoint?: RealtimeArenaCheckpoint
  onTimedCheckpointChange?: (checkpoint?: RealtimeArenaCheckpoint) => void
  initialReplayProgress?: ArenaReplayProgress
  onReplayProgressChange?: (progress?: ArenaReplayProgress) => void
}

export function LessonView(props: LessonProps) {
  const { level, locale, preview, catalog = [], completed = [], onReviewLesson } = props
  if (!preview && level.unit?.id === challengeZoneId && onReviewLesson) {
    return <ChallengeReviewProvider level={level} locale={locale} catalog={catalog} completed={completed} onStudy={onReviewLesson}>
      <LessonContent {...props} />
    </ChallengeReviewProvider>
  }
  if (level.unit?.id === challengeZoneId) return <LessonContent {...props} />
  return <Classroom family={lessonRoomFor(level)} unitId={level.unit?.id} locale={locale} completed={completed.includes(level.id)}>
    <LessonContent {...props} />
  </Classroom>
}

function LessonContent({ level, locale, onComplete, onMistake, preview = false, personal = {}, onSave, onOpenLevel, catalog = [], challenge,
  initialArenaMode, replayAiMode, initialDraft, onDraftChange,
  initialTimedCheckpoint, onTimedCheckpointChange, initialReplayProgress, onReplayProgressChange }: LessonProps) {
  const reportMistake = !preview && isGradedPractice(level) ? onMistake : undefined
  const challengeRun = !preview && level.unit?.id === challengeZoneId ? challenge : undefined
  switch (level.kind) {
    case 'grid': return <GridLesson level={level} locale={locale} onWin={onComplete} onMistake={reportMistake} personal={personal} course={resolveCourseHelpers(level, catalog)} challenge={challengeRun}
      initialDraft={initialDraft?.kind === 'grid' ? initialDraft : undefined} onDraftChange={onDraftChange} />
    case 'ai': return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载协作练习…', 'Loading the collaboration exercise…')}</p>}>
      <AiLesson level={level} locale={locale} preview={preview} onWin={onComplete} onMistake={reportMistake} challenge={challengeRun}
        replayMode={replayAiMode} />
    </Suspense>
    case 'lecture':
    case 'replay':
      return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载讲解…', 'Loading the lesson…')}</p>}>
        {level.kind === 'lecture' ? <Lecture level={level} locale={locale} onComplete={onComplete} preview={preview} />
          : <TeachingReplay level={level} locale={locale} onComplete={onComplete} />}
      </Suspense>
    case 'breadboard': {
      const source = catalog.find((item): item is BreadboardLevel => item.kind === 'breadboard' && item.id === level.board.carryFrom)
      const destination = catalog.find((item): item is BreadboardLevel => item.kind === 'breadboard' && item.board.carryFrom === level.id)
      const repair = level.courseFinal && catalog.find(item => item.kind === 'breadboard' && item.board.faults?.length
        && item.unit?.id === level.unit?.id && item.board.programId === level.board.programId)
      return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载面包板…', 'Loading the breadboard…')}</p>}>
        <BreadboardLesson level={level} locale={locale} sketch={breadboardProgram(level, catalog)} sourceLevel={source} preview={preview}
          onOpenRepair={!preview && repair && onOpenLevel ? () => onOpenLevel(repair.id) : undefined}
          onComplete={onComplete} onMistake={reportMistake} onHandoff={!preview && destination && onOpenLevel ? build => {
            saveBreadboardDraft(destination, boardForArduino(build))
            onOpenLevel(destination.id)
          } : undefined} />
      </Suspense>
    }
    case 'arduino':
      return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载 Arduino 实验台…', 'Loading the Arduino workbench…')}</p>}>
        <ArduinoLesson level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} />
      </Suspense>
    case 'circuit':
    case 'machine':
    case 'data':
      return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载实验台…', 'Loading the workbench…')}</p>}>
        {level.kind === 'circuit'
          ? <CircuitLesson level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} />
          : level.kind === 'machine' ? <MachineLesson level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} challenge={challengeRun}
            initialDraft={initialDraft?.kind === 'machine' ? initialDraft : undefined} onDraftChange={onDraftChange} />
            : <DataLesson level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} challenge={challengeRun} />}
      </Suspense>
    case 'lab':
    case 'vision':
      return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载实验台…', 'Loading the workbench…')}</p>}>
        {level.kind === 'vision' ? <VisionLesson level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} challenge={challengeRun} />
          : <LabDemo level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} />}
      </Suspense>
    case 'algorithm': {
      const course = resolveCourseHelpers(level, catalog)
      if (level.batteryPipeline) {
        const exercises = catalog.filter((candidate): candidate is Extract<Level, { kind: 'algorithm' }> =>
          candidate.kind === 'algorithm' && candidate.stage !== 'challenge' && !candidate.helpers?.length
          && Object.hasOwn(course, candidate.functionName) && typeof course[candidate.functionName] === 'string')
        return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载电池工单…', 'Loading the battery work order…')}</p>}>
          <BatteryPipelineActivity level={level} locale={locale} personal={personal} course={course}
            exercises={exercises} onOpenLevel={onOpenLevel} onComplete={onComplete} onMistake={reportMistake} />
        </Suspense>
      }
      if (level.batteryDispatch) {
        return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载电池交接台…', 'Loading the battery handover…')}</p>}>
          <BatteryDispatchActivity level={level} locale={locale} personal={personal} course={course} onComplete={onComplete} onMistake={reportMistake} />
        </Suspense>
      }
      if (level.chargingChallenge) {
        const name = level.helpers?.[0]
        const helper = name && Object.hasOwn(course, name) ? catalog.find(candidate => candidate.kind === 'algorithm'
          && candidate.functionName === name && candidate.stage !== 'challenge' && !candidate.helpers?.length) : undefined
        return <Suspense fallback={<p className="loading" role="status">{tr(locale, '正在加载补电挑战…', 'Loading the charging challenge…')}</p>}>
          <ChargingChallengeActivity level={level} locale={locale} personal={personal} course={course}
            onOpenHelper={onOpenLevel && helper ? () => onOpenLevel(helper.id) : undefined} onComplete={onComplete} onMistake={reportMistake} />
        </Suspense>
      }
      return <AlgorithmPractice level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} personal={personal} challenge={challengeRun}
        initialDraft={initialDraft?.kind === 'algorithm' ? initialDraft : undefined} onDraftChange={onDraftChange}
        course={course} onSave={preview || level.helpers?.length || level.stage === 'challenge' ? undefined : onSave} />
    }
    case 'arena': return <ArenaPlay level={level} locale={locale} onComplete={onComplete} onMistake={reportMistake} personal={personal}
      course={resolveCourseHelpers(level, catalog)} challenge={challengeRun} initialArenaMode={initialArenaMode}
      initialDraft={initialDraft?.kind === 'arena' ? initialDraft : undefined} onDraftChange={onDraftChange}
      initialTimedCheckpoint={initialTimedCheckpoint} onTimedCheckpointChange={onTimedCheckpointChange}
      initialReplayProgress={initialReplayProgress} onReplayProgressChange={onReplayProgressChange} />
  }
}
