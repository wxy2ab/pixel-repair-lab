import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ArenaLevel } from '../shared/advanced'
import type { Catalog, Level, Locale } from '../shared/types'
import type { RealtimeArenaCheckpoint } from '../engine/realtimeProtocol'
import { AlgorithmLibrary, persistAlgorithms, readAlgorithms } from './AlgorithmLibrary'
import { challengeZoneId } from '../shared/coursePrerequisites'
import { ChallengePrerequisites } from './ChallengeCatalog'
import { ChallengeBrief } from './ChallengeBrief'
import { ChallengeCompletion } from './ChallengeCompletion'
import { readArenaMatch, readArenaReload, saveArenaMatch, saveArenaReload, type ArenaReload } from './arenaMatchProgress'
import type { ArenaReplayProgress } from './arenaReplayProgress'
import { challengeDraftKey, parseChallengeDraft, supportsChallengeDraft, type ChallengeDraft } from './challengeDraft'
import { ChallengeReplayFocusResult } from './ChallengeReplayFocusResult'
import { ChallengeStudyRoute } from './ChallengeStudyRoute'
import { buildChallengeCatalog, buildChallengePreparation, challengeDifficulties, challengeDifficultyLabels, challengeType, challengeTypeLabels, challengeTypes, nextChallenge, type ChallengeFilters, type ChallengeType } from './challengeModel'
import { buildChallengeRoutes, challengeRouteSkipsKey, lastChallengeKey, loadChallengeRouteSkips, loadLastChallenge } from './challengeRoutes'
import { challengeScoresKey, challengeScoreSignature, readChallengeScores, updateChallengeScores, type ChallengeRunHandlers, type ChallengeScore, type ChallengeScoreComparison, type ChallengeScoreHistory } from './challengeScore'
import { adjustChallengeGoal, archiveChallengeGoal, challengeGoalsKey, completedChallengeGoals, evaluateChallengeGoal, goalForScore, matchesCurrentChallenge, pendingChallengeGoals, readChallengeGoalStore, recordChallengeGoalFailure, removeChallengeGoal, saveChallengeGoal, serializeChallengeGoalStore, type ChallengeGoal, type ChallengeGoalEvaluation, type ChallengeGoalStore, type CompletedChallengeGoal, type PendingChallengeGoal } from './challengeGoals'
import { recommendChallengeGoals, type ChallengeGoalRecommendation } from './challengeGoalRecommendations'
import type { GoalReplayEvidence } from './challengeGoalReview'
import { evaluateReplayFocus, type ReplayFocusEvaluation, type ReplayFocusPlan } from './challengeReplayFocus'
import { readReplayFocusHistory, recordReplayFocus, replayFocusHistoryEntries, replayFocusHistoryKey, retryReplayFocus, type ReplayFocusHistory, type ReplayFocusHistoryEntry, type ReplayFocusReference } from './challengeReplayFocusHistory'
import type { ChallengeGoalTab } from './ChallengeGoalList'
import { LessonView } from './LessonView'
import { ModuleCatalog } from './ModuleCatalog'
import { buildLearningRecord, learningRecordKey, readLearningLog, recordLesson, reviewMaterialsFor, type RecordTab } from './learningRecordModel'
import { groupLevels, isCourseFinal, isCourseOverview, isOptionalChallenge, levelStage, stageLabel } from './lessonTools'
import { LessonNext, TopicSteps } from './LessonGuide'
import { Icon } from './icons'
import { courseFor, CourseNavigation, OverviewTopics } from './LearningCourse'
import { modulesForCourse } from './roadmapModel'
import { Robot } from './Board'
import { WorkshopForLesson } from './station3d/LessonWorkbench'
import { IssueList, LevelPreview } from './LevelPreview'
import { tr } from './text'
import './styles.css'
import './advanced.css'
import './modules.css'
import './python-course.css'

const LearningRecord = lazy(() => import('./LearningRecord').then(module => ({ default: module.LearningRecord })))
const LessonReviewNav = lazy(() => import('./LearningRecord').then(module => ({ default: module.LessonReviewNav })))
const ReviewSuggestions = lazy(() => import('./LearningRecord').then(module => ({ default: module.ReviewSuggestions })))
const ChallengeRecords = lazy(() => import('./ChallengeScoreHistory').then(module => ({ default: module.ChallengeScoreHistory })))
const ChallengeGoalList = lazy(() => import('./ChallengeGoalList').then(module => ({ default: module.ChallengeGoalList })))
const UnfinishedArenaMatches = lazy(() => import('./UnfinishedArenaMatchList').then(module => ({ default: module.UnfinishedArenaMatches })))

const localeKey = 'pixel-repair-lab:locale'
const progressKey = 'pixel-repair-lab:completed'
const lastLessonKey = 'pixel-repair-lab:last-lesson'
const railKey = 'pixel-repair-lab:mission-rail'
const challengeGoalsHash = '#challenge-goals'
const unfinishedMatchesHash = '#unfinished-matches'
type Section = 'modules' | 'campaign' | 'preview' | 'algorithms' | 'record' | 'challenge-records' | 'challenge-goals' | 'unfinished-matches'
type StudyRoute = { challengeId: string; lessonId: string; mode?: 'review' }
type RecordedChallenge = { levelId: string; comparison: ChallengeScoreComparison; goalResult?: ChallengeGoalEvaluation; replay: () => void }
type ActiveReplayFocus = { levelId: string; plan: ReplayFocusPlan; reference: ReplayFocusReference }
type RecordedReplayFocus = { levelId: string; result: ReplayFocusEvaluation; reference: ReplayFocusReference }
type ArenaMode = 'relaxed' | 'timed'
type ChallengeReplay = { kind: 'arena'; mode: ArenaMode; fresh?: boolean } | { kind: 'ai'; mode: Extract<ChallengeScore, { kind: 'ai' }>['mode'] }
type ChallengeRecordsRoute = { levelId?: string; arenaMode?: ArenaMode }
type ScoreCache = { stored: string | null; history: ChallengeScoreHistory }
type GoalCache = { stored: string | null; store: ChallengeGoalStore }
type ReplayFocusHistoryCache = { stored: string | null; history: ReplayFocusHistory }

function readChallengeGoalTab(): ChallengeGoalTab | undefined {
  if (window.location.hash === challengeGoalsHash) return 'pending'
  if (window.location.hash === challengeGoalsHash + '/achieved') return 'achieved'
  if (window.location.hash === challengeGoalsHash + '/recommended') return 'recommended'
  if (window.location.hash === challengeGoalsHash + '/focus-history') return 'focus-history'
}

function readChallengeRecordsRoute(): ChallengeRecordsRoute | undefined {
  const match = /^#challenge-records(?:\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})(?:\/(relaxed|timed))?)?$/.exec(window.location.hash)
  if (match) return { levelId: match[1], arenaMode: match[2] === 'timed' ? 'timed' : match[2] === 'relaxed' ? 'relaxed' : undefined }
}

function writeChallengeRecordsRoute(route: ChallengeRecordsRoute, replace = false) {
  const selection = route.levelId ? '/' + route.levelId + (route.arenaMode ? '/' + route.arenaMode : '') : ''
  const hash = '#challenge-records' + selection
  if (hash === window.location.hash) return
  if (replace) window.history.replaceState(window.history.state, '', hash)
  else window.history.pushState(window.history.state, '', hash)
}

function leaveChallengePanel() {
  if (readChallengeRecordsRoute() || readChallengeGoalTab() || window.location.hash === unfinishedMatchesHash) {
    window.history.pushState(window.history.state, '', '#' + challengeZoneId)
  }
}

function readStudyRoute(): StudyRoute | undefined {
  const match = /^#(prepare|review-challenge)\/([a-z0-9][a-z0-9_-]{0,63})\/([a-z0-9][a-z0-9_-]{0,63})$/i.exec(window.location.hash)
  if (match) return { challengeId: match[2], lessonId: match[3], mode: match[1].toLowerCase() === 'review-challenge' ? 'review' : undefined }
}

function writeStudyRoute(route?: StudyRoute) {
  const hash = route ? `#${route.mode === 'review' ? 'review-challenge' : 'prepare'}/${route.challengeId}/${route.lessonId}` : '#' + challengeZoneId
  window.history.replaceState(window.history.state, '', hash)
}

function RetainedChallenge({ visible, children }: { visible: boolean; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [playArea] = useState(() => document.createElement('div'))

  useLayoutEffect(() => {
    if (visible) viewport.current?.appendChild(playArea)
    return () => playArea.remove()
  }, [visible, playArea])

  return <div ref={viewport} className="challenge-stage" hidden={!visible}>{createPortal(children, playArea)}</div>
}

function readStorage(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function currentChallengeScores(cache: ScoreCache | undefined, stored: string | null) {
  return cache?.stored === stored ? cache.history : readChallengeScores(stored)
}

function currentChallengeGoalStore(cache: GoalCache | undefined, stored: string | null, scores: ChallengeScoreHistory) {
  return cache?.stored === stored ? cache.store : readChallengeGoalStore(stored, scores)
}

function currentReplayFocusHistory(cache: ReplayFocusHistoryCache | undefined, stored: string | null) {
  return cache?.stored === stored ? cache.history : readReplayFocusHistory(stored)
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function readChallengeDraft(level: Level) {
  return parseChallengeDraft(level, readStorage(challengeDraftKey(level.id)))
}

function writeChallengeDraft(id: string, draft: ChallengeDraft) {
  writeStorage(challengeDraftKey(id), JSON.stringify(draft))
}

function arenaDraftMode(level: ArenaLevel): ArenaMode {
  const draft = readChallengeDraft(level)
  return draft?.kind === 'arena' ? draft.mode : 'relaxed'
}

function resetChallengeDraft(level: Level, arenaMode?: ArenaMode) {
  const draft = readChallengeDraft(level)
  if (level.kind === 'arena') {
    const stored = draft?.kind === 'arena' ? draft : undefined
    const mode = arenaMode ?? stored?.mode ?? 'relaxed'
    saveArenaMatch(level, mode)
    writeChallengeDraft(level.id, mode === 'timed'
      ? { kind: 'arena', mode, source: stored?.source }
      : { kind: 'arena', mode, policy: stored?.policy })
  } else {
    try { localStorage.removeItem(challengeDraftKey(level.id)) } catch { /* Storage may be unavailable. */ }
  }
}

function readCompleted(): string[] {
  try {
    const values: unknown = JSON.parse(readStorage(progressKey) ?? '[]')
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => readStorage(localeKey) === 'en' ? 'en' : 'zh')
  const [completed, setCompleted] = useState(readCompleted)
  const [learningLog, setLearningLog] = useState(() => readLearningLog(readStorage(learningRecordKey)))
  const [lastLesson, setLastLesson] = useState(() => readStorage(lastLessonKey) ?? undefined)
  const [catalog, setCatalog] = useState<Catalog>()
  const [catalogFailed, setCatalogFailed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [studyRoute, setStudyRoute] = useState(readStudyRoute)
  const [arenaReload, setArenaReload] = useState(readArenaReload)
  const [challengeRecordsRoute, setChallengeRecordsRoute] = useState(readChallengeRecordsRoute)
  const [challengeGoalTab, setChallengeGoalTab] = useState<ChallengeGoalTab>(() => readChallengeGoalTab() ?? 'pending')
  const [activeId, setActiveId] = useState(studyRoute?.lessonId ?? arenaReload?.levelId)
  const [challengeReplay, setChallengeReplay] = useState<ChallengeReplay | undefined>(() =>
    arenaReload && { kind: 'arena', mode: arenaReload.mode })
  const [challengeRestart, setChallengeRestart] = useState(0)
  const restartGeneration = useRef(0)
  const arenaView = useRef(arenaReload)
  const [challengeFilters, setChallengeFilters] = useState<ChallengeFilters>({})
  const [lastChallenge, setLastChallenge] = useState(() => loadLastChallenge(readStorage(lastChallengeKey)))
  const [selectedChallengeRoute, setSelectedChallengeRoute] = useState<ChallengeType>()
  const [skippedRouteIds, setSkippedRouteIds] = useState(() => loadChallengeRouteSkips(readStorage(challengeRouteSkipsKey)))
  const [routeChallengeId, setRouteChallengeId] = useState(arenaReload?.fromRoute ? arenaReload.levelId : undefined)
  const [challengeSummary, setChallengeSummary] = useState<RecordedChallenge>()
  const activeReplayFocus = useRef<ActiveReplayFocus | undefined>(undefined)
  const [replayFocusResult, setReplayFocusResult] = useState<RecordedReplayFocus>()
  const replayFocusHistoryCache = useRef<ReplayFocusHistoryCache | undefined>(undefined)
  const [goalCache, setGoalCache] = useState<GoalCache>()
  const scoreCache = useRef<ScoreCache | undefined>(undefined)
  const [section, setSection] = useState<Section>(() => studyRoute || arenaReload ? 'campaign'
    : challengeRecordsRoute ? 'challenge-records' : readChallengeGoalTab() ? 'challenge-goals'
      : window.location.hash === unfinishedMatchesHash ? 'unfinished-matches'
      : ['#learning-record', '#mistake-notebook'].includes(window.location.hash) ? 'record' : 'modules')
  const [recordTab, setRecordTab] = useState<RecordTab>(() => window.location.hash === '#mistake-notebook' ? 'mistakes' : 'history')
  const [review, setReview] = useState<{ sourceId: string; visit: number }>()
  const [personal, setPersonal] = useState(readAlgorithms)
  const [storageFailed, setStorageFailed] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [railHidden, setRailHidden] = useState(() => readStorage(railKey) === 'hidden')
  const rail = useRef<HTMLElement>(null)
  const t = (zh: string, en: string) => tr(locale, zh, en)

  useEffect(() => {
    const abort = new AbortController()
    setCatalogFailed(false)
    fetch('/api/levels', { signal: abort.signal, cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('catalog')
        return response.json() as Promise<Catalog>
      })
      .then(data => setCatalog(data))
      .catch(() => { if (!abort.signal.aborted) setCatalogFailed(true) })
    return () => abort.abort()
  }, [refresh])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = locale === 'zh' ? '像素维修站 · Pixel Repair Lab' : 'Pixel Repair Lab'
    writeStorage(localeKey, locale)
  }, [locale])

  useEffect(() => {
    const { hash } = window.location
    if (catalog && (hash.startsWith('#track-') || ['#free-choices', '#learning-roadmap', '#' + challengeZoneId, '#challenge-routes', '#challenge-browse'].includes(hash))) {
      document.getElementById(hash.slice(1))?.scrollIntoView()
    }
  }, [catalog])

  useEffect(() => {
    function followChallengePanelHash() {
      const route = readChallengeRecordsRoute()
      const goalTab = readChallengeGoalTab()
      const unfinished = window.location.hash === unfinishedMatchesHash
      if (route || goalTab || unfinished) {
        if (route) setChallengeRecordsRoute(route)
        if (goalTab) setChallengeGoalTab(goalTab)
        arenaView.current = undefined
        saveArenaReload()
        setStudyRoute(undefined)
        setChallengeSummary(undefined)
        setRouteChallengeId(undefined)
        activeReplayFocus.current = undefined
        setReplayFocusResult(undefined)
        setReview(undefined)
        setRouteOpen(false)
        setSection(unfinished ? 'unfinished-matches' : goalTab ? 'challenge-goals' : 'challenge-records')
        window.scrollTo({ top: 0, behavior: 'instant' })
      } else {
        setSection(current => current === 'challenge-records' || current === 'challenge-goals' || current === 'unfinished-matches'
          ? 'modules' : current)
      }
    }
    window.addEventListener('hashchange', followChallengePanelHash)
    return () => window.removeEventListener('hashchange', followChallengePanelHash)
  }, [])

  useEffect(() => { writeStorage(progressKey, JSON.stringify(completed)) }, [completed])
  useEffect(() => { writeStorage(learningRecordKey, JSON.stringify(learningLog)) }, [learningLog])
  useEffect(() => {
    if (!arenaView.current) saveArenaReload()
  }, [])

  const levels = catalog?.levels ?? []
  const level = levels.find(candidate => candidate.id === activeId) ?? levels[0]
  const groups = groupLevels(levels)
  const challenges = groups.find(group => group.unit.id === challengeZoneId)
  const hasChallenges = Boolean(challenges)
  const activeGroup = groups.find(group => group.levels.includes(level))
  const isChallenge = section === 'campaign' && activeGroup?.unit.id === challengeZoneId && !review
  const isRouteAttempt = isChallenge && routeChallengeId === level.id
  const canRestartChallenge = isChallenge && supportsChallengeDraft(level)
  const inChallengeZone = activeGroup?.unit.id === challengeZoneId
  // The arena lists its challenges by kind, easiest first, so a long list stays easy to scan.
  const ordered = useMemo(() => {
    const members = activeGroup?.levels ?? []
    if (activeGroup?.unit.id !== challengeZoneId) return members
    const tier = (candidate: Level) => challengeDifficulties.indexOf(candidate.difficulty ?? 'intermediate')
    return [...members].sort((left, right) => challengeTypes.indexOf(challengeType(left)) - challengeTypes.indexOf(challengeType(right))
      || tier(left) - tier(right) || left.order - right.order)
  }, [activeGroup])
  const course = level && courseFor(level)
  const courseOrder = course ? modulesForCourse(course, groups).flatMap(group => group.levels) : []
  const outline = section === 'campaign' && Boolean(activeGroup)
  const levelIndex = ordered.indexOf(level)
  const algorithmExercise = levels.find(candidate => candidate.id === 'shortest-step') ?? levels.find(candidate => candidate.kind === 'algorithm')
  const isWon = completed.includes(level?.id)
  const completedCount = levels.filter(candidate => completed.includes(candidate.id)).length
  const record = buildLearningRecord(levels, completed, learningLog)
  const lastRecordedChallenge = lastChallenge ? undefined
    : record.activities.find(activity => activity.level.unit?.id === challengeZoneId)?.level
  const challengeToContinue = lastChallenge ?? (lastRecordedChallenge
    ? { levelId: lastRecordedChallenge.id, routeType: challengeType(lastRecordedChallenge) } : undefined)
  const reviewSource = review && levels.find(candidate => candidate.id === review.sourceId)
  const studyChallenge = studyRoute && levels.find(candidate => candidate.id === studyRoute.challengeId && candidate.unit?.id === challengeZoneId)
  const studyPlan = studyChallenge && buildChallengePreparation(studyChallenge, groups, new Set(completed))
  const invalidStudyRoute = Boolean(catalog && studyRoute && !studyPlan?.requiredLessons.some(lesson => lesson.id === studyRoute.lessonId))
  const retainedChallenge = studyRoute?.mode === 'review' ? studyChallenge : isChallenge ? level : undefined
  const initialDraft = retainedChallenge && readChallengeDraft(retainedChallenge)
  const arena = retainedChallenge?.kind === 'arena' ? retainedChallenge : undefined
  const freshMode = challengeReplay?.kind === 'arena' && challengeReplay.fresh ? challengeReplay.mode : undefined
  const reloadingArena = arenaReload && levels.find(candidate => candidate.id === arenaReload.levelId
    && candidate.kind === 'arena' && candidate.unit?.id === challengeZoneId)
  const invalidArenaReload = Boolean(catalog && arenaReload && (reloadingArena?.kind !== 'arena'
    || !readArenaMatch(reloadingArena, arenaReload.mode)))
  const currentSummary = isChallenge && challengeSummary?.levelId === level.id ? challengeSummary : undefined
  const currentReplayFocus = isChallenge && replayFocusResult?.levelId === level.id ? replayFocusResult : undefined
  const challengeEntries = currentSummary && challenges && buildChallengeCatalog(challenges.levels, groups, completed).entries
  const recommended = currentSummary && challengeEntries && (isRouteAttempt
    ? buildChallengeRoutes(challengeEntries, skippedRouteIds).find(route => route.type === challengeType(level))?.next
    : nextChallenge(challengeEntries, currentSummary.levelId))
  const scorePanel = section === 'challenge-records' || section === 'challenge-goals'
  const challengePanel = scorePanel || section === 'unfinished-matches'
  const scoreHistory = scorePanel ? currentChallengeScores(scoreCache.current, readStorage(challengeScoresKey)) : undefined
  const challengeGoalStore = scoreHistory ? currentChallengeGoalStore(goalCache, readStorage(challengeGoalsKey), scoreHistory) : undefined
  const challengeGoals = challengeGoalStore?.goals

  useEffect(() => {
    if (!invalidStudyRoute) return
    setStudyRoute(undefined)
    setActiveId(undefined)
    setSection('modules')
    writeStudyRoute()
  }, [invalidStudyRoute])

  useEffect(() => {
    if (!catalog || !arenaReload) return
    setArenaReload(undefined)
    if (invalidArenaReload) {
      arenaView.current = undefined
      saveArenaReload()
      setRouteChallengeId(undefined)
      setChallengeReplay(undefined)
      setSection('modules')
    }
  }, [catalog, arenaReload, invalidArenaReload])

  function trackArenaMatch(match: ArenaLevel, mode: ArenaMode, progress?: RealtimeArenaCheckpoint | ArenaReplayProgress) {
    if (challengeRestart !== restartGeneration.current) return
    const saved = saveArenaMatch(match, mode, progress)
    const view = arenaView.current
    if (view?.levelId === match.id && view.mode === mode) {
      saveArenaReload(saved && progress ? view : undefined)
    }
  }

  function updateChallengeDraft(target: Level, draft: ChallengeDraft) {
    writeChallengeDraft(target.id, draft)
    const view = arenaView.current
    if (target.kind === 'arena' && draft.kind === 'arena' && view?.levelId === target.id && draft.mode !== view.mode) {
      const updated = { ...view, mode: draft.mode }
      arenaView.current = updated
      saveArenaReload(readArenaMatch(target, draft.mode) ? updated : undefined)
    }
  }

  const recordAttempt = useCallback((id: string, status: 'passed' | 'mistake') => {
    const at = Date.now()
    if (status === 'passed') setCompleted(previous => previous.includes(id) ? previous : [...previous, id])
    setLearningLog(previous => recordLesson(previous, id, status, at))
  }, [])
  const markWin = useCallback(() => { if (level) recordAttempt(level.id, 'passed') }, [level, recordAttempt])
  const markMistake = useCallback(() => { if (level) recordAttempt(level.id, 'mistake') }, [level, recordAttempt])
  const markChallengeWin = useCallback(() => {
    if (retainedChallenge) recordAttempt(retainedChallenge.id, 'passed')
  }, [retainedChallenge, recordAttempt])
  const markChallengeMistake = useCallback(() => {
    if (retainedChallenge) recordAttempt(retainedChallenge.id, 'mistake')
  }, [retainedChallenge, recordAttempt])
  const clearChallengeSummary = useCallback(() => {
    setChallengeSummary(undefined)
    setReplayFocusResult(undefined)
  }, [])
  const finishReplayFocus = useCallback((challenge: Level, score: ChallengeScore, evidence: GoalReplayEvidence | undefined, won: boolean) => {
    const focus = activeReplayFocus.current
    if (!focus || focus.levelId !== challenge.id) return
    activeReplayFocus.current = undefined
    if (focus.plan.seriesId !== challengeScoreSignature(score)) return
    const result = evaluateReplayFocus(focus.plan, score, evidence, won)
    const record = { levelId: challenge.id, reference: focus.reference, result }
    const stored = readStorage(replayFocusHistoryKey)
    const history = currentReplayFocusHistory(replayFocusHistoryCache.current, stored)
    const updated = recordReplayFocus(history, { ...record, title: challenge.title, score })
    if (updated !== history) {
      const serialized = JSON.stringify(updated)
      const saved = writeStorage(replayFocusHistoryKey, serialized)
      replayFocusHistoryCache.current = { stored: saved ? serialized : stored, history: updated }
    }
    setReplayFocusResult(record)
  }, [])
  const persistGoalStore = useCallback((stored: string | null, store: ChallengeGoalStore) => {
    writeStorage(challengeGoalsKey, serializeChallengeGoalStore(store))
    setGoalCache({ stored, store })
  }, [])
  const recordChallengeFailure = useCallback<ChallengeRunHandlers['onFailure']>((score, evidence) => {
    if (!retainedChallenge || retainedChallenge.id !== level?.id) return
    finishReplayFocus(retainedChallenge, score, evidence, false)
    const stored = readStorage(challengeGoalsKey)
    const scores = currentChallengeScores(scoreCache.current, readStorage(challengeScoresKey))
    const store = currentChallengeGoalStore(goalCache, stored, scores)
    const goals = recordChallengeGoalFailure(store.goals, retainedChallenge.id, challengeScoreSignature(score), { score, evidence })
    if (goals !== store.goals) persistGoalStore(stored, { ...store, goals })
  }, [finishReplayFocus, goalCache, level, persistGoalStore, retainedChallenge])
  const recordChallengeScore = useCallback<ChallengeRunHandlers['onWin']>((score, replay, evidence) => {
    if (!retainedChallenge || retainedChallenge.id !== level?.id) return
    finishReplayFocus(retainedChallenge, score, evidence, true)
    const stored = readStorage(challengeScoresKey)
    const scores = currentChallengeScores(scoreCache.current, stored)
    const { history, comparison } = updateChallengeScores(scores, retainedChallenge.id, score)
    writeStorage(challengeScoresKey, JSON.stringify(history))
    scoreCache.current = { stored, history }
    const storedGoals = readStorage(challengeGoalsKey)
    const store = currentChallengeGoalStore(goalCache, storedGoals, scores)
    const evaluation = evaluateChallengeGoal(store.goals, retainedChallenge.id, score, evidence ?? {})
    if (evaluation.goals !== store.goals) {
      const achieved = evaluation.achievement ? archiveChallengeGoal(store.history, evaluation.achievement) : store.history
      persistGoalStore(storedGoals, { goals: evaluation.goals, history: achieved })
    }
    setChallengeSummary({ levelId: retainedChallenge.id, comparison, goalResult: evaluation.result, replay })
  }, [finishReplayFocus, goalCache, level, persistGoalStore, retainedChallenge])

  function updateGoal(levelId: string, score: ChallengeScore, goal?: ChallengeGoal, source?: 'recommendation') {
    const stored = readStorage(challengeGoalsKey)
    const scores = currentChallengeScores(scoreCache.current, readStorage(challengeScoresKey))
    const store = currentChallengeGoalStore(goalCache, stored, scores)
    const possibleLevels = source === 'recommendation' ? challenges?.levels.filter(level => level.id === levelId) : undefined
    const latest = source === 'recommendation' ? recommendChallengeGoals(possibleLevels ?? [], scores, store.goals)
      .find(entry => entry.seriesId === challengeScoreSignature(score))?.score : score
    if (!latest) {
      setGoalCache({ stored, store })
      return false
    }
    const goals = goal ? saveChallengeGoal(store.goals, levelId, latest, goal) : removeChallengeGoal(store.goals, levelId, score)
    if (goals === store.goals) {
      if (source === 'recommendation') setGoalCache({ stored, store })
      return false
    }
    persistGoalStore(stored, { ...store, goals })
    return true
  }

  function updateAlgorithms(next: typeof personal) {
    setStorageFailed(!persistAlgorithms(next))
    setPersonal(next)
  }

  function saveAlgorithm(name: string, source: string) {
    updateAlgorithms({ ...personal, [name]: source })
  }

  function removeAlgorithm(name: string) {
    const next = { ...personal }
    delete next[name]
    updateAlgorithms(next)
  }

  function showLesson(id: string, replay?: ChallengeReplay, routeId?: string, arenaMode?: ArenaMode) {
    leaveChallengePanel()
    if (arenaView.current?.levelId !== id || arenaView.current?.mode !== arenaMode) saveArenaReload()
    arenaView.current = arenaMode ? { levelId: id, fromRoute: routeId === id, mode: arenaMode } : undefined
    activeReplayFocus.current = undefined
    clearChallengeSummary()
    setRouteOpen(false)
    setRouteChallengeId(routeId)
    setChallengeReplay(replay)
    setSection('campaign')
    setActiveId(id)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function rememberChallenge(target: Level) {
    const next = { levelId: target.id, routeType: challengeType(target) }
    if (lastChallenge?.levelId === next.levelId && lastChallenge.routeType === next.routeType) return
    setLastChallenge(next)
    writeStorage(lastChallengeKey, JSON.stringify(next))
  }

  function visitLesson(id: string, replay?: ChallengeReplay, routeId?: string) {
    const target = levels.find(candidate => candidate.id === id)
    let arenaMode: ArenaMode | undefined
    if (target?.unit?.id === challengeZoneId) {
      rememberChallenge(target)
      if (target.kind === 'arena') {
        arenaMode = replay?.kind === 'arena' ? replay.mode : arenaDraftMode(target)
        if (replay?.kind === 'arena') {
          const draft = readChallengeDraft(target)
          writeChallengeDraft(id, draft?.kind === 'arena' ? { ...draft, mode: replay.mode } : { kind: 'arena', mode: replay.mode })
        }
      }
    } else if (target && courseFor(target) && !isOptionalChallenge(target)) {
      setLastLesson(id)
      writeStorage(lastLessonKey, id)
    }
    setReview(undefined)
    showLesson(id, replay, routeId, arenaMode)
  }

  function updateStudyRoute(route?: StudyRoute) {
    setStudyRoute(route)
    writeStudyRoute(route)
  }

  function openLevel(id: string) {
    const isStudyLesson = studyPlan?.requiredLessons.some(lesson => lesson.id === id)
    const routeId = studyRoute?.challengeId === routeChallengeId && (isStudyLesson || id === routeChallengeId)
      ? routeChallengeId : undefined
    if (studyRoute) {
      updateStudyRoute(isStudyLesson ? { ...studyRoute, lessonId: id } : undefined)
    }
    visitLesson(id, undefined, routeId)
  }

  function openRouteLevel(id: string, restart = false) {
    const target = challenges?.levels.find(candidate => candidate.id === id)
    if (!target) return
    if (restart) resetChallengeDraft(target)
    setSelectedChallengeRoute(challengeType(target))
    visitLesson(id, undefined, id)
  }

  function restartOpenChallenge() {
    if (!canRestartChallenge) return
    const generation = ++restartGeneration.current
    resetChallengeDraft(level, arenaView.current?.mode)
    saveArenaReload()
    if (level.kind === 'arena' && arenaView.current) setChallengeReplay({ kind: 'arena', mode: arenaView.current.mode })
    clearChallengeSummary()
    setChallengeRestart(generation)
  }

  function setRouteSkipped(id: string, skipped: boolean) {
    const target = challenges?.levels.find(candidate => candidate.id === id)
    if (!target || (skipped && completed.includes(id)) || skipped === skippedRouteIds.includes(id)) return
    const next = skipped ? [...skippedRouteIds, id] : skippedRouteIds.filter(entry => entry !== id)
    setSkippedRouteIds(next)
    writeStorage(challengeRouteSkipsKey, JSON.stringify(next))
    if (skipped) rememberChallenge(target)
  }

  function startPreparation(challengeId: string, lessonId: string, mode?: 'review') {
    const challenge = levels.find(candidate => candidate.id === challengeId && candidate.unit?.id === challengeZoneId)
    if (!challenge) return
    const preparation = buildChallengePreparation(challenge, groups, new Set(completed))
    const lessons = mode === 'review' ? preparation.requiredLessons : preparation.missingLessons
    if (!lessons.some(lesson => lesson.id === lessonId)) return
    updateStudyRoute({ challengeId, lessonId, mode })
    visitLesson(lessonId, undefined, routeChallengeId === challengeId ? routeChallengeId : undefined)
  }

  function openReview(id: string, sourceId: string) {
    if (studyRoute) updateStudyRoute()
    if (section === 'modules') setRecordTab('mistakes')
    setReview(previous => ({ sourceId, visit: (previous?.visit ?? 0) + 1 }))
    showLesson(id)
  }

  function openModule(id: string) {
    const module = groups.find(group => group.unit.id === id)
    const required = module?.levels.filter(candidate => courseFor(candidate) && !isOptionalChallenge(candidate))
    const first = required?.find(candidate => !completed.includes(candidate.id)) ?? module?.levels[0]
    if (first) openLevel(first.id)
  }

  function goTo(section: Exclude<Section, 'campaign'>) {
    if (section !== 'challenge-records' && section !== 'challenge-goals' && section !== 'unfinished-matches') leaveChallengePanel()
    arenaView.current = undefined
    saveArenaReload()
    activeReplayFocus.current = undefined
    clearChallengeSummary()
    if (studyRoute) updateStudyRoute()
    setRouteOpen(false)
    setRouteChallengeId(undefined)
    setReview(undefined)
    setSection(section)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function openRecord(tab: RecordTab) {
    setRecordTab(tab)
    goTo('record')
  }

  function openChallenges(targetId: typeof challengeZoneId | 'challenge-browse' | 'challenge-routes' = challengeZoneId) {
    goTo('modules')
    if (window.location.hash !== '#' + targetId) window.location.hash = targetId
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView()
    })
  }

  function chooseChallengeRoute(type?: ChallengeType) {
    if (type) setSelectedChallengeRoute(type)
    openChallenges('challenge-routes')
  }

  function openChallengeRecords(levelId?: string, arenaMode?: ArenaMode) {
    const route = levelId ? { levelId, arenaMode } : challengeRecordsRoute ?? {}
    goTo('challenge-records')
    setChallengeRecordsRoute(route)
    writeChallengeRecordsRoute(route)
  }

  function openChallengeGoals() {
    goTo('challenge-goals')
    selectChallengeGoalTab('pending')
  }

  function openUnfinishedMatches() {
    goTo('unfinished-matches')
    if (window.location.hash !== unfinishedMatchesHash) window.history.pushState(window.history.state, '', unfinishedMatchesHash)
  }

  function openUnfinishedMatch(id: string, mode: ArenaMode, restart = false) {
    const target = challenges?.levels.find(level => level.id === id)
    if (target?.kind !== 'arena' || !readArenaMatch(target, mode)) return false
    if (restart) resetChallengeDraft(target, mode)
    setSelectedChallengeRoute('arena')
    visitLesson(id, { kind: 'arena', mode }, id)
    return true
  }

  function abandonUnfinishedMatch(id: string, mode: ArenaMode) {
    const target = challenges?.levels.find(level => level.id === id)
    return target?.kind === 'arena' && saveArenaMatch(target, mode)
  }

  function selectChallengeGoalTab(tab: ChallengeGoalTab) {
    const hash = tab === 'pending' ? challengeGoalsHash : `${challengeGoalsHash}/${tab}`
    if (window.location.hash !== hash) window.history.pushState(window.history.state, '', hash)
    setChallengeGoalTab(tab)
  }

  function showPendingGoals() {
    selectChallengeGoalTab('pending')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function setNextChallengeGoal(entry: CompletedChallengeGoal, goal: ChallengeGoal) {
    if (!entry.canSetNext || (entry.metricOnly && entry.goal.metricId !== goal.metricId)) return
    if (updateGoal(entry.level.id, entry.score, goal)) showPendingGoals()
  }

  function useChallengeGoalRecommendation(entry: ChallengeGoalRecommendation, goal: ChallengeGoal) {
    const saved = updateGoal(entry.level.id, entry.score, goal, 'recommendation')
    if (saved) showPendingGoals()
    return saved
  }

  function adjustPendingChallengeGoal(entry: PendingChallengeGoal, nextGoal: ChallengeGoal) {
    const { level, score, goal } = entry
    const stored = readStorage(challengeGoalsKey)
    const scores = currentChallengeScores(scoreCache.current, readStorage(challengeScoresKey))
    const store = currentChallengeGoalStore(goalCache, stored, scores)
    const current = goalForScore(store.goals, level.id, score)
    if (!current || current.achieved !== undefined || current.metricId !== goal.metricId
      || current.baseline !== goal.baseline || current.target !== goal.target) {
      setGoalCache({ stored, store })
      return false
    }
    const goals = adjustChallengeGoal(store.goals, level.id, score, nextGoal)
    if (goals === store.goals) return nextGoal.target === current.target && nextGoal.metricId === current.metricId
      && nextGoal.baseline === current.baseline && nextGoal.preference === current.preference
    persistGoalStore(stored, { ...store, goals })
    return true
  }

  function selectChallengeRecord(levelId: string, arenaMode?: ArenaMode) {
    const route = { levelId, arenaMode }
    setChallengeRecordsRoute(route)
    writeChallengeRecordsRoute(route, true)
  }

  function replayChallengeRecord(levelId: string, arenaMode?: ArenaMode) {
    const target = challenges?.levels.find(candidate => candidate.id === levelId)
    if (!target) return
    visitLesson(levelId, target.kind === 'arena' && arenaMode ? { kind: 'arena', mode: arenaMode, fresh: true } : undefined)
  }

  function replayChallengeWithFocus(levelId: string, score: ChallengeScore, focus?: { plan: ReplayFocusPlan; reference: ReplayFocusReference }) {
    const replay = score.kind === 'arena' ? { kind: score.kind, mode: score.mode, fresh: true } as const
      : score.kind === 'ai' ? { kind: score.kind, mode: score.mode } as const : undefined
    visitLesson(levelId, replay)
    if (focus && focus.plan.seriesId === challengeScoreSignature(score)) {
      activeReplayFocus.current = { levelId, ...focus }
    }
  }

  function replayChallengeGoal({ level, score, goal }: PendingChallengeGoal, plan?: ReplayFocusPlan) {
    replayChallengeWithFocus(level.id, score, plan && { plan, reference: goal.attempts === undefined ? 'entry' : 'replay' })
  }

  function retryFocusHistory(entry: ReplayFocusHistoryEntry) {
    const level = challenges?.levels.find(level => level.id === entry.levelId)
    if (!level || !entry.canReplay || !matchesCurrentChallenge(level, entry.score)) return
    replayChallengeWithFocus(level.id, entry.score, retryReplayFocus(entry))
  }

  const activeLevelId = section === 'campaign' ? level?.id : undefined
  useEffect(() => {
    // Keep the open lesson visible in a long mission list without moving the page itself.
    const list = rail.current
    const current = list?.querySelector<HTMLElement>('.mission-list [aria-current="step"]')
    if (!list || !current || list.scrollHeight <= list.clientHeight) return
    const frame = list.getBoundingClientRect()
    const item = current.getBoundingClientRect()
    if (item.top < frame.top + 8 || item.bottom > frame.bottom - 8) {
      list.scrollTop += item.top - frame.top - (frame.height - item.height) / 2
    }
  }, [activeLevelId, railHidden])

  function toggleRail() {
    const next = !railHidden
    setRailHidden(next)
    writeStorage(railKey, next ? 'hidden' : 'shown')
  }

  const progress = <div className="overview-progress">
    <div className="section-label"><h2>{t('总进度', 'Overall progress')}</h2><strong>{completedCount}<span> / {levels.length}</span></strong></div>
    <div className="progress-track" role="progressbar" aria-label={t('已完成任务', 'Completed missions')}
      aria-valuemin={0} aria-valuemax={levels.length || 1} aria-valuenow={completedCount}>
      <span style={{ width: (levels.length ? completedCount / levels.length * 100 : 0) + '%' }} />
    </div>
  </div>

  const showCourseRail = outline && level && course && !invalidStudyRoute && !invalidArenaReload
    && !reviewSource && !(studyChallenge && studyPlan) && !railHidden
  const guidedLesson = outline && level && course && !invalidStudyRoute && !invalidArenaReload
    && !reviewSource && !(studyChallenge && studyPlan)

  return <div className="app-shell">
    <header className="topbar">
      <button type="button" className="brand" onClick={() => goTo('modules')}>
        <span className="brand-mark"><Robot /></span>
        <span>{t('像素维修站', 'Pixel Repair Lab')}<small>{t('PIXEL REPAIR LAB', 'CODE & COMPUTER SCIENCE')}</small></span>
      </button>
      <nav className="top-nav" aria-label={t('主导航', 'Main navigation')}>
        <button type="button" className={(section === 'campaign' && !review && !isChallenge || section === 'modules') ? 'active' : ''} aria-current={section === 'modules' ? 'page' : undefined} onClick={() => goTo('modules')}>
          <span aria-hidden="true"><Icon name="modules" /></span>{t('学习模块', 'Learning modules')}
        </button>
        {hasChallenges && <button type="button" className={'challenge-jump' + (isChallenge || challengePanel ? ' active' : '')}
          aria-current={isChallenge || challengePanel ? 'page' : undefined} onClick={() => openChallenges()}>
          <span aria-hidden="true"><Icon name="challenge" /></span>{t('挑战场', 'Challenge Arena')}
        </button>}
        <button type="button" className={section === 'record' || review ? 'active' : ''} aria-current={section === 'record' ? 'page' : undefined} onClick={() => openRecord('history')}>
          <span aria-hidden="true"><Icon name="record" /></span>{t('学习记录', 'Study history')}
        </button>
        <button type="button" className={section === 'algorithms' ? 'active' : ''} aria-current={section === 'algorithms' ? 'page' : undefined} onClick={() => goTo('algorithms')}>
          <span aria-hidden="true"><Icon name="algorithms" /></span>{t('我的算法', 'My algorithms')}
        </button>
        <button type="button" className={section === 'preview' ? 'active' : ''} aria-current={section === 'preview' ? 'page' : undefined} onClick={() => goTo('preview')}>
          <span aria-hidden="true"><Icon name="preview" /></span>{t('关卡预览', 'Level preview')}
        </button>
      </nav>
      <div className="language-switch segmented" role="group" aria-label={t('语言', 'Language')}>
        <button type="button" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button>
        <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
      </div>
    </header>

    <div className={outline ? 'app-main' + (railHidden ? ' app-main--rail-hidden' : '') : 'app-main app-main--solo'}>
      {outline && activeGroup && <aside ref={rail} className={'sidebar' + (routeOpen ? ' sidebar-open' : '') + (showCourseRail ? ' classroom-rail' : '')}
        aria-label={t('学习进度与任务列表', 'Progress and mission list')}>
        <button type="button" className="icon-button rail-toggle rail-toggle--show" onClick={toggleRail}
          aria-label={t('展开任务列表栏', 'Show the mission list panel')} title={t('展开任务列表栏', 'Show the mission list panel')}>
          <Icon name="expand" size={19} />
        </button>
        {showCourseRail && <CourseNavigation course={course} level={level} ordered={courseOrder} locale={locale} completed={completed}
          onOpen={openLevel} onHome={() => goTo('modules')} />}
        <div className="sidebar-heading">
          {progress}
          <div className="route-title">
            <h3>{t('任务列表', 'Mission list')}</h3>
            <span className="route-tools">
              <button type="button" className="icon-button" aria-label={t('刷新关卡列表', 'Refresh mission list')} title={t('刷新关卡列表', 'Refresh mission list')}
                onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" /></button>
              <button type="button" className="icon-button rail-toggle" onClick={toggleRail}
                aria-label={t('收起任务列表栏', 'Hide the mission list panel')} title={t('收起任务列表栏，给工作区更多空间', 'Hide the mission list panel for a wider workspace')}>
                <Icon name="collapse" size={19} />
              </button>
            </span>
          </div>
        </div>
        <div className="mission-groups">
          <section className="mission-group" aria-label={activeGroup.unit.title[locale]}>
            <h3>{activeGroup.unit.title[locale]}</h3>
            <ol className="mission-list">
              {ordered.map((candidate, index) => {
                const done = completed.includes(candidate.id)
                const type = inChallengeZone ? challengeType(candidate) : undefined
                const sameType = type ? ordered.filter(entry => challengeType(entry) === type) : []
                const difficulty = candidate.difficulty ?? 'intermediate'
                return <Fragment key={candidate.id}>
                {type && (index === 0 || challengeType(ordered[index - 1]) !== type) &&
                  <li className="course-topic-heading course-topic-heading--count">{challengeTypeLabels[type][locale]}
                    <span>{sameType.filter(entry => completed.includes(entry.id)).length}/{sameType.length}</span></li>}
                {isCourseOverview(candidate) && (index === 0 || !isCourseOverview(ordered[index - 1])) &&
                  <li className="course-topic-heading">{t('课程全貌', 'Course overview')}</li>}
                {candidate.topic && ordered[index - 1]?.topic?.id !== candidate.topic.id &&
                  <li className="course-topic-heading">{candidate.topic.title[locale]}</li>}
                {course && isOptionalChallenge(candidate) &&
                  <li className="course-topic-heading">{t('阶段综合挑战 · 选做', 'Optional stage challenge')}</li>}
                {isCourseFinal(candidate) && <li className="course-topic-heading">{t('结课项目', 'Final project')}</li>}
                <li>
                <button type="button" className={section === 'campaign' && candidate.id === level?.id ? 'active' : ''}
                  aria-current={section === 'campaign' && candidate.id === level?.id ? 'step' : undefined}
                  data-done={done || undefined} onClick={() => openLevel(candidate.id)}>
                  {type
                    ? <span className="mission-stage" data-difficulty={difficulty}>{challengeDifficultyLabels[difficulty][locale]}</span>
                    : <span className="mission-stage" data-stage={isCourseFinal(candidate) ? 'final' : levelStage(candidate)}>{course && isOptionalChallenge(candidate) ? t('选做', 'Optional') : stageLabel(candidate, locale)}</span>}
                  <span className="mission-name">{candidate.title[locale]}</span>
                  {done && <span className="mission-check" aria-label={t('已完成', 'Complete')}>✓</span>}
                </button>
                </li>
              </Fragment>})}
            </ol>
          </section>
        </div>
      </aside>}

      <main className="content">
        {!outline && <div className="content-progress">{progress}</div>}
        {outline && <button type="button" className="mobile-missions subtle-button" aria-expanded={routeOpen} onClick={() => setRouteOpen(!routeOpen)}>{t('任务列表', 'Mission list')}</button>}
        {section === 'preview' ? <LevelPreview locale={locale} catalog={levels} /> : section === 'algorithms' ?
          <AlgorithmLibrary locale={locale} algorithms={personal} remove={removeAlgorithm} storageFailed={storageFailed}
            goToPractice={algorithmExercise ? () => openLevel(algorithmExercise.id) : undefined} /> : <>
          {catalogFailed && <div className="panel catalog-notice" role="alert"><p>{t('关卡列表暂时无法加载。', 'Could not load the mission list.')}</p><button type="button" className="subtle-button" onClick={() => setRefresh(value => value + 1)}>{t('重试', 'Retry')}</button></div>}
          {!catalog && !catalogFailed && <p className="loading" role="status">{t('正在加载关卡…', 'Loading missions…')}</p>}
          {Boolean(catalog?.issues.length) && <details className="panel catalog-notice"><summary>{t('有配置需要修改', 'Some configurations need changes')}</summary><IssueList issues={catalog?.issues ?? []} locale={locale} /></details>}
          {catalog && !level && <p className="loading">{t('暂无可用关卡。', 'No missions are available.')}</p>}
          {section === 'modules' && Boolean(groups.length) && <ModuleCatalog groups={groups} levels={levels} completed={completed} lastLesson={lastLesson} locale={locale}
            challengeFilters={challengeFilters} onChallengeFiltersChange={setChallengeFilters} onStartPreparation={startPreparation}
            lastChallenge={challengeToContinue} selectedRoute={selectedChallengeRoute} skippedRouteIds={skippedRouteIds} onSelectRoute={setSelectedChallengeRoute}
            onSetRouteSkipped={setRouteSkipped} onOpenRouteLevel={openRouteLevel}
            readDraft={readChallengeDraft} onRestartChallenge={id => openRouteLevel(id, true)}
            onChooseChallengeRoute={chooseChallengeRoute} onBrowseChallenges={() => openChallenges('challenge-browse')}
            onEnterArena={() => openChallenges()}
            onOpen={openModule} onOpenLevel={openLevel} onChallengeRecords={() => openChallengeRecords()} onChallengeGoals={openChallengeGoals}
            onUnfinishedMatches={openUnfinishedMatches} onOpenUnfinishedMatch={openUnfinishedMatch} review={<Suspense fallback={null}>
              <ReviewSuggestions record={record} locale={locale} onNotebook={() => openRecord('mistakes')} onReview={openReview} />
            </Suspense>} />}
          {section === 'challenge-records' && catalog && scoreHistory && challengeGoals && <Suspense fallback={
            <p className="loading" role="status">{t('正在加载成绩记录…', 'Loading challenge records…')}</p>
          }>
            <ChallengeRecords levels={challenges?.levels ?? []} history={scoreHistory} goals={challengeGoals} locale={locale}
              levelId={challengeRecordsRoute?.levelId} arenaMode={challengeRecordsRoute?.arenaMode}
              onSelection={selectChallengeRecord} onReplay={replayChallengeRecord} onBack={() => openChallenges()}
              onSaveGoal={updateGoal} onRemoveGoal={updateGoal} />
          </Suspense>}
          {section === 'unfinished-matches' && catalog && <Suspense fallback={
            <p className="loading" role="status">{t('正在读取对局存档…', 'Loading saved matches…')}</p>
          }>
            <UnfinishedArenaMatches levels={catalog.levels} locale={locale} onContinue={openUnfinishedMatch}
              onRestart={(id, mode) => openUnfinishedMatch(id, mode, true)}
              onAbandon={abandonUnfinishedMatch}
              onBack={() => openChallenges()} onBrowse={() => openChallenges('challenge-browse')} />
          </Suspense>}
          {section === 'challenge-goals' && catalog && scoreHistory && challengeGoalStore && <Suspense fallback={
            <p className="loading" role="status">{t('正在加载小目标…', 'Loading challenge goals…')}</p>
          }>
            <ChallengeGoalList entries={pendingChallengeGoals(challenges?.levels ?? [], scoreHistory, challengeGoalStore.goals)}
              completed={completedChallengeGoals(challenges?.levels ?? [], challengeGoalStore.history)} locale={locale}
              recommendations={recommendChallengeGoals(challenges?.levels ?? [], scoreHistory, challengeGoalStore.goals)}
              tab={challengeGoalTab} onTab={selectChallengeGoalTab} onSaveGoal={setNextChallengeGoal}
              onUseRecommendation={useChallengeGoalRecommendation}
              onAdjustGoal={adjustPendingChallengeGoal}
              focusHistory={challengeGoalTab === 'focus-history' ? replayFocusHistoryEntries(
                currentReplayFocusHistory(replayFocusHistoryCache.current, readStorage(replayFocusHistoryKey)), challenges?.levels ?? [],
              ) : []} onRetryFocus={retryFocusHistory}
              onReplay={replayChallengeGoal} onBrowse={() => openChallenges('challenge-browse')} onRecords={() => openChallengeRecords()} />
          </Suspense>}
          {section === 'record' && catalog && <Suspense fallback={<p className="loading" role="status">{t('正在加载学习记录…', 'Loading study history…')}</p>}>
            <LearningRecord record={record} locale={locale} tab={recordTab} onTab={setRecordTab} onReview={openReview} />
          </Suspense>}
          {section === 'campaign' && level && !invalidStudyRoute && !invalidArenaReload && <>
            <div className="mission-heading">
              <div>
                <div className="mission-meta">{activeGroup && <span>{activeGroup.unit.title[locale]} · {stageLabel(level, locale)}</span>}<span className="concept-tag">{level.topic?.title[locale] ?? level.concept[locale]}</span></div>
                <h1>{level.title[locale]}</h1>
                {level.kind !== 'ai' && !isChallenge && <p>{level.brief[locale]}</p>}
              </div>
              {((isWon && !showCourseRail) || isRouteAttempt || canRestartChallenge) && <div className="mission-finish">
                {isWon && !showCourseRail && <span className="complete-tag">{t('已完成', 'Complete')}</span>}
                {isWon && !isRouteAttempt && !course && !reviewSource && !currentSummary && ordered[levelIndex + 1] && <button type="button" className="subtle-button" onClick={() => openLevel(ordered[levelIndex + 1].id)}>{t('下一关', 'Next mission')}</button>}
                {isRouteAttempt && !currentSummary && <>
                  <button type="button" className="subtle-button" onClick={() => openChallenges('challenge-routes')}>{t('返回闯关路线', 'Back to challenge routes')}</button>
                  {!isWon && !skippedRouteIds.includes(level.id) && <button type="button" className="subtle-button"
                    onClick={() => { setRouteSkipped(level.id, true); openChallenges('challenge-routes') }}>{t('跳过这关', 'Skip this challenge')}</button>}
                </>}
                {canRestartChallenge && <button type="button" className="subtle-button" onClick={restartOpenChallenge}>
                  {t('重新开始', 'Start over')}
                </button>}
              </div>}
              {level.unit?.id === challengeZoneId && <WorkshopForLesson level={level} locale={locale} completed={isWon} />}
            </div>
            {isChallenge && level.kind !== 'ai' && <ChallengeBrief key={level.id} level={level} locale={locale} />}
            {guidedLesson && <TopicSteps level={level} ordered={ordered} completed={completed} locale={locale} onOpen={openLevel} />}
            {currentSummary && <ChallengeCompletion comparison={currentSummary.comparison} goalResult={currentSummary.goalResult} locale={locale} next={recommended}
              replayFocusResult={currentReplayFocus && <ChallengeReplayFocusResult result={currentReplayFocus.result}
                reference={currentReplayFocus.reference} locale={locale} inSummary />}
              onReplay={() => { clearChallengeSummary(); currentSummary.replay() }}
              onBrowse={() => openChallenges('challenge-browse')} onNext={isRouteAttempt ? openRouteLevel : openLevel}
              onRoutes={isRouteAttempt ? () => openChallenges('challenge-routes') : undefined}
              onRecords={() => openChallengeRecords(currentSummary.levelId,
                currentSummary.comparison.current.kind === 'arena' ? currentSummary.comparison.current.mode : undefined)} />}
            {!currentSummary && currentReplayFocus && <ChallengeReplayFocusResult result={currentReplayFocus.result}
              reference={currentReplayFocus.reference} locale={locale} />}
            {level.prerequisites && <ChallengePrerequisites level={level} groups={groups} locale={locale}
              completed={completed} onOpenLevel={openLevel} onStartPreparation={startPreparation} />}
            {reviewSource ? <Suspense fallback={null}>
              <LessonReviewNav source={reviewSource} current={level} materials={reviewMaterialsFor(reviewSource, levels)} locale={locale}
                onBack={() => goTo('record')} onReview={openReview} />
            </Suspense>
              : studyChallenge && studyPlan
                ? <ChallengeStudyRoute challenge={studyChallenge} preparation={studyPlan} locale={locale} lessonComplete={isWon}
                  review={studyRoute?.mode === 'review'} onNext={openLevel} onReturn={() => openLevel(studyChallenge.id)} />
                : course && !showCourseRail && <CourseNavigation course={course} level={level} ordered={courseOrder} locale={locale} completed={completed}
                onOpen={openLevel} onHome={() => goTo('modules')} />}
            {retainedChallenge && <RetainedChallenge visible={retainedChallenge.id === level.id}>
              <LessonView catalog={levels} key={JSON.stringify(retainedChallenge) + ':' + challengeRestart} level={retainedChallenge} locale={locale} completed={completed}
                onComplete={markChallengeWin} onMistake={markChallengeMistake} personal={personal} onOpenLevel={openLevel}
                challenge={{ onWin: recordChallengeScore, onFailure: recordChallengeFailure, onStart: clearChallengeSummary }}
                initialArenaMode={challengeReplay?.kind === 'arena' ? challengeReplay.mode : undefined}
                replayAiMode={challengeReplay?.kind === 'ai' ? challengeReplay.mode : undefined}
                initialDraft={initialDraft} onDraftChange={draft => updateChallengeDraft(retainedChallenge, draft)}
                initialTimedCheckpoint={arena && freshMode !== 'timed' ? readArenaMatch(arena, 'timed') : undefined}
                onTimedCheckpointChange={arena && (checkpoint => trackArenaMatch(arena, 'timed', checkpoint))}
                initialReplayProgress={arena && freshMode !== 'relaxed' ? readArenaMatch(arena, 'relaxed') : undefined}
                onReplayProgressChange={arena && (progress => trackArenaMatch(arena, 'relaxed', progress))}
                onReviewLesson={(challengeId, lessonId) => startPreparation(challengeId, lessonId, 'review')} />
            </RetainedChallenge>}
            {retainedChallenge?.id !== level.id &&
              <LessonView catalog={levels} key={`${review?.visit ?? 0}:${JSON.stringify(level)}`} level={level} locale={locale} completed={completed}
                onComplete={markWin} onMistake={markMistake} personal={personal} onSave={saveAlgorithm} onOpenLevel={openLevel} />}
            {guidedLesson && isWon && <LessonNext level={level} ordered={courseOrder} locale={locale} onOpen={openLevel} onHome={() => goTo('modules')} />}
            {!reviewSource && level.kind === 'lecture' && level.overview && !level.execution?.intro &&
              <OverviewTopics ordered={ordered} completed={completed} locale={locale} onOpen={openLevel} />}
          </>}
        </>}
      </main>
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
