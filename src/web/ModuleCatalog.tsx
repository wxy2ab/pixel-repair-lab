import type { ReactNode } from 'react'
import type { Level, Locale } from '../shared/types'
import { challengeZoneId } from '../shared/coursePrerequisites'
import { readArenaMatch, type ArenaMatchMode } from './arenaMatchProgress'
import { ChallengeCatalog } from './ChallengeCatalog'
import { supportsChallengeDraft, type ChallengeDraft } from './challengeDraft'
import { ContinueChallenge } from './ContinueChallenge'
import { buildChallengeCatalog, type ChallengeFilters, type ChallengeType } from './challengeModel'
import { buildChallengeRoutes, resumeChallengeRoute, type LastChallenge } from './challengeRoutes'
import { isCourseFinal, isOptionalChallenge, levelStage, stageLabel } from './lessonTools'
import { tr } from './text'
import { CourseStart, learningCourses } from './LearningCourse'
import { LearningRoadmap } from './LearningRoadmap'
import { RecentArenaMatch } from './RecentArenaMatch'
import { WorkshopHub } from './station3d/WorkshopHub'
import { buildRoadmap, modulesForCourse, type LearningGroup } from './roadmapModel'

const known = new Set(learningCourses.flatMap(course => course.units))

export function ModuleCatalog({ groups, levels, completed, lastLesson, locale, challengeFilters, onChallengeFiltersChange,
  lastChallenge, selectedRoute, skippedRouteIds, onSelectRoute, onSetRouteSkipped, onOpenRouteLevel, onChooseChallengeRoute, onBrowseChallenges,
  readDraft, onRestartChallenge, onEnterArena,
  onStartPreparation, onOpen, onOpenLevel, onChallengeRecords, onChallengeGoals, onUnfinishedMatches, onOpenUnfinishedMatch, review }: {
  groups: LearningGroup[]; levels: readonly Level[]; completed: string[]; lastLesson?: string; locale: Locale;
  challengeFilters: ChallengeFilters; onChallengeFiltersChange: (filters: ChallengeFilters) => void;
  lastChallenge?: LastChallenge; selectedRoute?: ChallengeType; skippedRouteIds: string[]; onSelectRoute: (type: ChallengeType) => void;
  onSetRouteSkipped: (id: string, skipped: boolean) => void; onOpenRouteLevel: (id: string) => void;
  onChooseChallengeRoute: (type?: ChallengeType) => void; onBrowseChallenges: () => void;
  readDraft: (level: Level) => ChallengeDraft | undefined; onRestartChallenge: (id: string) => void;
  onEnterArena: () => void;
  onStartPreparation: (challengeId: string, lessonId: string) => void;
  onOpen: (unitId: string) => void; onOpenLevel: (id: string) => void; onChallengeRecords: () => void; onChallengeGoals: () => void; review?: ReactNode;
  onUnfinishedMatches: () => void;
  onOpenUnfinishedMatch: (id: string, mode: ArenaMatchMode) => boolean;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const challenges = groups.find(group => group.unit.id === challengeZoneId)
  const moduleGroups = groups.filter(group => group.unit.id !== challengeZoneId)
  const roadmap = buildRoadmap(moduleGroups, completed, lastLesson)
  const challengeCatalog = challenges && buildChallengeCatalog(challenges.levels, moduleGroups, completed)
  const routes = challengeCatalog ? buildChallengeRoutes(challengeCatalog.entries, skippedRouteIds) : []
  const continuation = resumeChallengeRoute(routes, lastChallenge, skippedRouteIds)
  const nextLesson = roadmap.resume ?? roadmap.recommended
  const arenaRoute = routes.find(route => route.type === 'arena')
  const nextMatch = (continuation?.route.type === 'arena' ? continuation.target : undefined)
    ?? arenaRoute?.next ?? arenaRoute?.entries[0]
  function visitWorkbench() {
    if (nextLesson) onOpenLevel(nextLesson.level.id)
    else if (moduleGroups.length) onOpen(moduleGroups[0].unit.id)
    else onEnterArena()
  }
  const resumeLevel = continuation?.status === 'resume' ? continuation.target?.level : undefined
  const savedDraft = resumeLevel?.kind === 'arena' ? readDraft(resumeLevel) : undefined
  const arenaMode = resumeLevel?.kind === 'arena' ? savedDraft?.kind === 'arena' ? savedDraft.mode : 'relaxed' : undefined
  const hasArenaMatch = resumeLevel?.kind === 'arena' && arenaMode !== undefined && Boolean(readArenaMatch(resumeLevel, arenaMode))
  const sections = [
    ...learningCourses.map(course => ({ id: course.id, title: course.name, icon: course.icon, course, modules: modulesForCourse(course, moduleGroups) })),
    { id: 'other', title: { zh: '其他模块', en: 'Other modules' }, icon: '◇', course: undefined, modules: moduleGroups.filter(group => !known.has(group.unit.id)) },
  ].filter(section => section.modules.length > 0)
  return <>
    <WorkshopHub locale={locale} variant="learning" onLearn={visitWorkbench} onChallenge={challenges ? onEnterArena : undefined}>
      <h1>{t('学习模块', 'Learning modules')}</h1>
      <p className="workshop-intro-stat">{t(`维修站开放了 ${moduleGroups.length} 个学习模块。`, `Explore ${moduleGroups.length} learning modules at the repair station.`)}</p>
      {nextLesson && <p className="workshop-intro-next">{t('下一课', 'Next lesson')} · <strong>{nextLesson.level.title[locale]}</strong></p>}
    </WorkshopHub>
    {challengeCatalog && <div className="home-challenge-entries">
      <ContinueChallenge continuation={continuation} locale={locale} onPlay={onOpenRouteLevel} arenaMode={arenaMode}
        hasArenaMatch={hasArenaMatch}
        onRestart={resumeLevel && supportsChallengeDraft(resumeLevel) ? () => onRestartChallenge(resumeLevel.id) : undefined}
        onRoutes={() => onChooseChallengeRoute(continuation?.route.type)} onBrowse={onBrowseChallenges} />
      <RecentArenaMatch levels={levels} locale={locale} onOpen={onOpenUnfinishedMatch} onAll={onUnfinishedMatches} />
    </div>}
    {roadmap.tracks.length > 0
      ? <LearningRoadmap roadmap={roadmap} locale={locale} onOpenLevel={onOpenLevel} onOpenUnit={onOpen} review={review} />
      : review}
    <h2 id="free-choices" className="free-choices-heading">{t('自由选课', 'Browse courses')}</h2>
    <nav className="track-jumps" aria-label={t('学科分类', 'Subject areas')}>
      {sections.map(section => <a key={section.id} href={'#track-' + section.id}>{section.title[locale]}</a>)}
    </nav>
    {sections.map(section => {
      const { course } = section
      return <section className="module-track" key={section.id} aria-labelledby={'track-' + section.id}>
        <h2 id={'track-' + section.id}><span aria-hidden="true">{section.icon}</span>{section.title[locale]}</h2>
        {course && <CourseStart course={course} ordered={section.modules.flatMap(module => module.levels)}
          completed={completed} locale={locale} onOpen={onOpenLevel} />}
        <div className="module-cards">
          {section.modules.map(group => {
            const intro = group.levels[0]
            const stages = group.levels.filter((candidate, index) => group.levels.findIndex(level =>
              levelStage(level) === levelStage(candidate) && isCourseFinal(level) === isCourseFinal(candidate)) === index)
            const counted = course ? group.levels.filter(level => !isOptionalChallenge(level)) : group.levels
            const done = counted.filter(level => completed.includes(level.id)).length
            return <button type="button" className="module-card" data-unit={group.unit.id} key={group.unit.id} onClick={() => onOpen(group.unit.id)}>
              <span className="module-card-head">
                <strong>{group.unit.title[locale]}</strong><span>{done} / {counted.length}</span>
              </span>
              <span className="module-description">{intro.brief[locale]}</span>
              <span className="module-stages">{stages.map(level => <span key={level.id} className={'stage-chip stage-' + levelStage(level)}>{course && isOptionalChallenge(level) ? t('选做', 'Optional') : stageLabel(level, locale)}</span>)}</span>
              <span className="module-meter" aria-hidden="true"><i style={{ width: (done / Math.max(1, counted.length) * 100) + '%' }} /></span>
            </button>
          })}
        </div>
      </section>
    })}
    {challenges && challengeCatalog && <ChallengeCatalog title={challenges.unit.title} catalog={challengeCatalog} routes={routes} locale={locale}
      onLearn={visitWorkbench} nextMatch={nextMatch?.level}
      filters={challengeFilters} onFiltersChange={onChallengeFiltersChange} onStartPreparation={onStartPreparation}
      selectedRoute={selectedRoute} skippedRouteIds={skippedRouteIds} onSelectRoute={onSelectRoute}
      onSetRouteSkipped={onSetRouteSkipped} onOpenRouteLevel={onOpenRouteLevel}
      onOpenLevel={onOpenLevel} onRecords={onChallengeRecords} onGoals={onChallengeGoals} onUnfinished={onUnfinishedMatches} />}
  </>
}
