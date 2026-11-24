import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import type { Level } from '../src/shared/types'
import { briefParts, briefSentences, declaredNames } from '../src/web/briefText'
import { functionParameters, pythonLayout } from '../src/web/pythonValue'

test('a brief splits at sentence ends but keeps brackets, quotes and decimals whole', () => {
  assert.deepEqual(briefSentences('在 21 回合内抵达出口。对手每隔 1.8 秒行动（同格会被抓。迎面也算）。平局不算赢！'),
    ['在 21 回合内抵达出口。', '对手每隔 1.8 秒行动（同格会被抓。迎面也算）。', '平局不算赢！'])
  assert.deepEqual(briefSentences('Rivals act every 1.8 seconds. Return [start, end]. Ties, e.g. 2 to 2, do not win.'),
    ['Rivals act every 1.8 seconds.', 'Return [start, end].', 'Ties, e.g. 2 to 2, do not win.'])
  assert.deepEqual(briefSentences('只有一句'), ['只有一句'])
})

test('every challenge brief survives splitting without losing a character', () => {
  const directory = new URL('../levels/', import.meta.url)
  const levels = readdirSync(directory).filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as Level)
  const challenges = levels.filter(level => level.unit?.id === 'challenge-zone')
  assert.ok(challenges.length > 100)
  for (const level of challenges) {
    for (const locale of ['zh', 'en'] as const) {
      const brief = level.brief[locale]
      const sentences = briefSentences(brief)
      assert.equal(sentences.join('').replace(/\s/g, ''), brief.replace(/\s/g, ''), level.id + ' ' + locale)
      assert.equal(briefParts(brief).map(part => part.text).join(''), brief, level.id + ' ' + locale)
    }
  }
})

test('calls, snake_case names, list shapes and declared parameters read as code', () => {
  const code = (text: string, names?: string[]) => briefParts(text, names).filter(part => part.code).map(part => part.text)
  assert.deepEqual(code('read_map() 给出 tiles；返回 [起点索引, 终点索引, 总耗电]，否则返回 []。可装入 plan_route。'),
    ['read_map()', '[起点索引, 终点索引, 总耗电]', '[]', 'plan_route'])
  assert.deepEqual(code('给定耗电列表 draws 和上限 limit。', ['quiet_stretch', 'draws', 'limit']), ['draws', 'limit'])
  assert.deepEqual(code('没有代码的一句话 [旁注]'), [])
  assert.deepEqual(declaredNames('from algorithms import prefix_totals\n\ndef quiet_stretch(draws, limit=3):\n    pass\n'),
    ['quiet_stretch', 'draws', 'limit'])
})

test('case values stay on one line when short and break by row or by width when long', () => {
  assert.equal(pythonLayout([5, 1, 2, null, true]), '[5, 1, 2, None, True]')
  assert.equal(pythonLayout(['#####', '#S..#', '#..G#'], 20), '[\n  "#####",\n  "#S..#",\n  "#..G#"\n]')
  assert.equal(pythonLayout([12, 7, 30, 4, 18, 9], 14), '[\n  12, 7, 30,\n  4, 18, 9\n]')
  assert.equal(pythonLayout([[1, 2, 3], [4, 5, 6]], 14), '[\n  [1, 2, 3],\n  [4, 5, 6]\n]')
  assert.equal(pythonLayout({ west: [1, 2], east: [3] }, 12), '{\n  "west": [1, 2],\n  "east": [3]\n}')
  assert.deepEqual(functionParameters('def quiet_stretch(draws, limit: int = 3):\n    pass', 'quiet_stretch'), ['draws', 'limit'])
  assert.deepEqual(functionParameters('def other(a):\n    pass', 'quiet_stretch'), [])
})
