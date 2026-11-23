import type { Level, Locale, Localized } from '../shared/types'
import { isCourseFinal, isCourseOverview, isOptionalChallenge, levelStage } from './lessonTools'
import { tr } from './text'

export type Course = {
  id: string
  units: string[]
  prerequisites: string[]
  name: Localized
  icon: string
  title: Localized
  path: Localized
  start: Localized
  resume: Localized
  review: Localized
}

export const learningCourses: Course[] = [
  {
    id: 'python', units: ['foundations', 'python-intermediate', 'python-advanced'],
    prerequisites: [], name: { zh: 'Python', en: 'Python' }, icon: '{ }',
    title: { zh: 'Python 连续课程', en: 'Python learning path' },
    path: { zh: '基础 → 进阶 → 高级', en: 'Foundations → Intermediate → Advanced' },
    start: { zh: '开始 Python 课程', en: 'Start the Python course' },
    resume: { zh: '继续 Python 课程', en: 'Continue the Python course' },
    review: { zh: '复习 Python 课程', en: 'Review the Python course' },
  },
  {
    id: 'algorithms', units: ['structures', 'algorithm-intro', 'routing', 'algorithm-advanced'],
    prerequisites: ['foundations', 'python-intermediate'], name: { zh: '数据结构与算法', en: 'Data structures and algorithms' }, icon: '▥',
    title: { zh: '数据结构与算法连续课程', en: 'Data structures and algorithms learning path' },
    path: { zh: '数据结构 → 算法初级 → 算法进阶 → 算法高级', en: 'Data structures → Introductory → Intermediate → Advanced algorithms' },
    start: { zh: '开始数据结构与算法课程', en: 'Start the data structures and algorithms course' },
    resume: { zh: '继续数据结构与算法课程', en: 'Continue the data structures and algorithms course' },
    review: { zh: '复习数据结构与算法课程', en: 'Review the data structures and algorithms course' },
  },
  {
    id: 'computer', units: ['computer', 'architecture'],
    prerequisites: [], name: { zh: '计算机', en: 'Computing' }, icon: '⊞',
    title: { zh: '计算机连续课程', en: 'Computing learning path' },
    path: { zh: '计算机原理 → 计算机结构', en: 'Computer systems → Computer architecture' },
    start: { zh: '开始计算机课程', en: 'Start the computing course' },
    resume: { zh: '继续计算机课程', en: 'Continue the computing course' },
    review: { zh: '复习计算机课程', en: 'Review the computing course' },
  },
  {
    id: 'digital-circuits', units: ['digital-circuits'],
    prerequisites: [], name: { zh: '数字电路', en: 'Digital circuits' }, icon: '⎍',
    title: { zh: '数字电路课程', en: 'Digital circuits learning path' },
    path: { zh: '二进制灯 → 二极管与面包板 → 晶体管开关 → 逻辑门 → Arduino 呼叫灯', en: 'Binary lights → Diodes and breadboards → Transistor switches → Logic gates → Arduino call light' },
    start: { zh: '开始数字电路课程', en: 'Start the digital circuits course' },
    resume: { zh: '继续数字电路课程', en: 'Continue the digital circuits course' },
    review: { zh: '复习数字电路课程', en: 'Review the digital circuits course' },
  },
  {
    id: 'data', units: ['numpy', 'pandas', 'statistics', 'database'],
    prerequisites: ['foundations', 'python-intermediate'], name: { zh: '数据科学', en: 'Data science' }, icon: '▤',
    title: { zh: '数据科学连续课程', en: 'Data science learning path' },
    path: { zh: 'NumPy → Pandas → 统计分析 → 数据库 → 结课项目', en: 'NumPy → Pandas → Statistics → Databases → Final project' },
    start: { zh: '开始数据科学课程', en: 'Start the data science course' },
    resume: { zh: '继续数据科学课程', en: 'Continue the data science course' },
    review: { zh: '复习数据科学课程', en: 'Review the data science course' },
  },
  {
    id: 'vision', units: ['opencv', 'yolox'],
    prerequisites: ['numpy'], name: { zh: '计算机视觉', en: 'Computer vision' }, icon: '▣',
    title: { zh: '计算机视觉连续课程', en: 'Computer vision learning path' },
    path: { zh: 'OpenCV → YOLOX → 结课项目', en: 'OpenCV → YOLOX → Final project' },
    start: { zh: '开始计算机视觉课程', en: 'Start the computer vision course' },
    resume: { zh: '继续计算机视觉课程', en: 'Continue the computer vision course' },
    review: { zh: '复习计算机视觉课程', en: 'Review the computer vision course' },
  },
  {
    id: 'ai', units: ['ai', 'ai-review'],
    prerequisites: [], name: { zh: 'AI 协作', en: 'AI collaboration' }, icon: '✦',
    title: { zh: 'AI 协作连续课程', en: 'AI collaboration learning path' },
    path: { zh: '写清任务与约束 → 核对与修正 → 结课项目', en: 'Describe goals and constraints → Review and revision → Final project' },
    start: { zh: '开始 AI 协作课程', en: 'Start the AI collaboration course' },
    resume: { zh: '继续 AI 协作课程', en: 'Continue the AI collaboration course' },
    review: { zh: '复习 AI 协作课程', en: 'Review the AI collaboration course' },
  },
]

export function courseFor(level: Level): Course | undefined {
  return learningCourses.find(course => course.units.includes(level.unit?.id ?? ''))
}

function requiredLessons(ordered: Level[]) {
  return ordered.filter(level => !isOptionalChallenge(level))
}

export function CourseStart({ course, ordered, completed, locale, onOpen }: {
  course: Course; ordered: Level[]; completed: string[]; locale: Locale; onOpen: (id: string) => void;
}) {
  const required = requiredLessons(ordered)
  const done = required.filter(level => completed.includes(level.id)).length
  const next = required.find(level => !completed.includes(level.id))
  const overview = required.find(isCourseOverview)
  if (!required.length) return null

  return <div className="course-path-start">
    <div>
      <h3>{course.title[locale]}</h3>
      <p>{course.path[locale]} · {done}/{required.length} {tr(locale, '节主线课', 'core lessons')}</p>
    </div>
    <div className="course-start-actions">
      {overview && (next ?? required[0]).id !== overview.id && <button type="button" className="subtle-button" onClick={() => onOpen(overview.id)}>
        {tr(locale, '重看课程全貌', 'Revisit the overview')}
      </button>}
      <button type="button" className="primary-button" onClick={() => onOpen((next ?? required[0]).id)}>
        {(next ? done ? course.resume : course.start : course.review)[locale]}
      </button>
    </div>
  </div>
}

export function CourseNavigation({ course, level, ordered, completed, locale, onOpen, onHome }: {
  course: Course; level: Level; ordered: Level[]; completed: string[]; locale: Locale;
  onOpen: (id: string) => void; onHome: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const index = ordered.indexOf(level)
  const required = requiredLessons(ordered)
  const done = required.filter(candidate => completed.includes(candidate.id)).length
  const previous = ordered.slice(0, index).findLast(candidate => !isOptionalChallenge(candidate))
  const next = ordered.slice(index + 1).find(candidate => !isOptionalChallenge(candidate))
  const endsStage = !isOptionalChallenge(level) && !isCourseFinal(level)
    && (!next || isCourseFinal(next) || next.unit?.id !== level.unit?.id)
  const optional = endsStage && ordered.find(candidate => candidate.unit?.id === level.unit?.id && isOptionalChallenge(candidate))
  const canSkipChallenge = level.kind === 'algorithm'
    && (level.chargingChallenge || level.batteryDispatch || level.batteryPipeline) && !completed.includes(level.id)
  const overview = !isCourseOverview(level) && ordered.find(candidate => candidate.unit?.id === level.unit?.id && isCourseOverview(candidate))
  const stage = course.units.indexOf(level.unit?.id ?? '') + 1

  return <section className={'course-route-nav ' + (course.id === 'algorithms' ? 'algorithm' : course.id) + '-route-nav'} aria-label={course.title[locale]}>
    <div className="course-progress-summary">
      <div className="course-progress-heading">
        <h2>{t('学习进度', 'Learning progress')}</h2>
        {completed.includes(level.id) && <span className="complete-tag">{t('已完成', 'Complete')}</span>}
      </div>
      <strong>{course.title[locale]}</strong>
      <small>{t('阶段', 'Stage')} {stage}/{course.units.length} · {t('主线进度', 'Core progress')} {done}/{required.length}</small>
      <progress className="course-progress-meter" max={required.length || 1} value={done} aria-label={t('课程主线进度', 'Core course progress')} />
    </div>
    <nav aria-label={t('课程顺序', 'Lesson order')}>
      {overview && <button type="button" className="subtle-button" onClick={() => onOpen(overview.id)}>{t('课程全貌', 'Course overview')}</button>}
      {previous && <button type="button" className="subtle-button" onClick={() => onOpen(previous.id)}>{t('上一课', 'Previous lesson')}</button>}
      {optional && <button type="button" className="subtle-button optional-challenge" onClick={() => onOpen(optional.id)}>{t('选做综合挑战', 'Try the optional challenge')}</button>}
      {next ? <button type="button" className="primary-button" onClick={() => onOpen(next.id)}>
        {canSkipChallenge ? t('跳过选做挑战', 'Skip optional challenge') : isCourseFinal(next) ? t('进入结课项目', 'Start the final project')
          : next.unit?.id === level.unit?.id ? t('下一课', 'Next lesson') : t('进入 ', 'Continue to ') + next.unit?.title[locale]}
      </button> : <button type="button" className="subtle-button" onClick={onHome}>
        {canSkipChallenge ? t('跳过选做挑战', 'Skip optional challenge') : t('返回课程首页', 'Back to learning modules')}
      </button>}
    </nav>
  </section>
}

export function OverviewTopics({ ordered, completed, locale, onOpen }: {
  ordered: Level[]; completed: string[]; locale: Locale; onOpen: (id: string) => void;
}) {
  const topics = new Map<string, Level>()
  for (const level of ordered) {
    if (level.topic && levelStage(level) === 'explain' && !topics.has(level.topic.id)) topics.set(level.topic.id, level)
  }
  if (!topics.size) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <section className="panel overview-topics" aria-labelledby="overview-topics-title">
    <h2 id="overview-topics-title">{t('按知识点展开', 'Explore each concept')}</h2>
    <ol>
      {[...topics.values()].map(level => <li key={level.id}>
        <button type="button" className="subtle-button" onClick={() => onOpen(level.id)}>
          {completed.includes(level.id) && <span className="mission-check" aria-label={t('已完成', 'Complete')}>✓</span>}
          {level.topic?.title[locale]}
        </button>
      </li>)}
    </ol>
  </section>
}
