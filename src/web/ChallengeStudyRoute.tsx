import type { Level, Locale } from '../shared/types'
import type { ChallengePreparation } from './challengeModel'
import { tr } from './text'
import './challenge-study-route.css'

export function ChallengeStudyRoute({ challenge, preparation, lessonComplete, review = false, locale, onNext, onReturn }: {
  challenge: Level; preparation: ChallengePreparation; lessonComplete: boolean; locale: Locale;
  review?: boolean;
  onNext: (id: string) => void; onReturn: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const remaining = preparation.missingLessons.length
  const next = lessonComplete && !review ? preparation.missingLessons[0] : undefined
  const allComplete = preparation.prerequisites.every(course => course.complete)
  const progress = review
    ? lessonComplete
      ? t('可以回到原挑战继续试。', 'You can return to the challenge to try again.')
      : t('练完这一课就可以继续挑战。', 'Finish this lesson to continue the challenge.')
    : remaining > 0
    ? t(`还差 ${remaining} 节课`, `${remaining} ${remaining === 1 ? 'lesson' : 'lessons'} left`)
    : allComplete
      ? t('前序课程已学完。', 'Prerequisites complete.')
      : t('已学完可用的前序课程。', 'Available prerequisites complete.')

  return <section className="challenge-study-route" aria-label={review ? t('复盘补课', 'Review study') : t('补课路线', 'Preparation plan')}>
    <div className="challenge-study-summary">
      <strong>{review ? t(`为「${challenge.title.zh}」复习`, `Reviewing for ${challenge.title.en}`)
        : t(`为「${challenge.title.zh}」补课`, `Preparing for ${challenge.title.en}`)}</strong>
      <p role="status">{progress}</p>
    </div>
    <div className="challenge-study-actions">
      <button type="button" className={(review ? lessonComplete : !remaining) ? 'primary-button' : 'subtle-button'} onClick={onReturn}>
        {t('返回原挑战', 'Return to challenge')}
      </button>
      {next && <button type="button" className="primary-button" title={next.title[locale]} onClick={() => onNext(next.id)}>
        {t('补下一课', 'Next prerequisite')}
      </button>}
    </div>
  </section>
}
