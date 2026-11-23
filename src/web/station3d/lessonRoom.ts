import type { Level } from '../../shared/types'
import { courseFor } from '../LearningCourse'

export type LessonRoomFamily = 'coding' | 'algorithms' | 'systems' | 'electronics' | 'data' | 'vision' | 'ai'

export const roomNames = {
  coding: { zh: '编程工作台', en: 'Programming bench' },
  algorithms: { zh: '电池分拣台', en: 'Battery sorting bench' },
  systems: { zh: '计算机检修台', en: 'Computer repair bench' },
  electronics: { zh: '电路实验台', en: 'Electronics bench' },
  data: { zh: '数据分析台', en: 'Data analysis bench' },
  vision: { zh: '视觉检测台', en: 'Vision inspection bench' },
  ai: { zh: 'AI 协作台', en: 'AI collaboration bench' },
} satisfies Record<LessonRoomFamily, { zh: string; en: string }>

export function lessonRoomFor(level: Level): LessonRoomFamily {
  switch (courseFor(level)?.id) {
    case 'python': return 'coding'
    case 'computer': return 'systems'
    case 'digital-circuits': return 'electronics'
    case 'algorithms': return 'algorithms'
    case 'data': return 'data'
    case 'vision': return 'vision'
    case 'ai': return 'ai'
  }
  // Imported lessons can use their own units or omit the course entirely.
  switch (level.kind) {
    case 'algorithm': return 'algorithms'
    case 'machine': return 'systems'
    case 'arduino':
    case 'breadboard':
    case 'circuit': return 'electronics'
    case 'ai':
    case 'data':
    case 'vision': return level.kind
    case 'lab': return level.recipe === 'opencv' || level.recipe === 'yolox' ? 'vision' : 'data'
    case 'replay': return level.mode === 'ai' ? 'ai' : 'coding'
    default: return 'coding'
  }
}
