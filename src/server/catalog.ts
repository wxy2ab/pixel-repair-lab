import { open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { projectDirectory } from '../projectDirectory'
import type { Issue, Level } from '../shared/types'
import { prerequisiteIssues } from '../shared/coursePrerequisites'
import { breadboardProgramIssues } from '../shared/breadboard'
import { shortChallengeLinkIssues } from '../shared/shortChallenges'
import { MAX_LEVEL_BYTES, parseLevel } from '../shared/validate'

export const levelsDirectory = join(projectDirectory, 'levels')

type LevelFile = { source: string; level: Level }
type Scan = { entries: LevelFile[]; issues: Issue[] }

export async function readLevelFile(filename: string, source = filename): Promise<Scan> {
  try {
    const file = await open(filename, 'r')
    try {
      const info = await file.stat()
      if (!info.isFile()) return { entries: [], issues: [{ path: source, code: 'read', message: 'Expected a level file.' }] }
      const buffer = Buffer.alloc(MAX_LEVEL_BYTES + 1)
      let size = 0
      while (size < buffer.length) {
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, size)
        if (!bytesRead) break
        size += bytesRead
      }
      if (size > MAX_LEVEL_BYTES) {
        return { entries: [], issues: [{ path: source, code: 'size', message: 'Level files must be at most 256 KiB.' }] }
      }
      const { level, issues } = parseLevel(buffer.toString('utf8', 0, size))
      return {
        entries: level ? [{ source, level }] : [],
        issues: issues.map(issue => ({ ...issue, path: source + (issue.path === '/' ? '' : issue.path) })),
      }
    } finally {
      await file.close()
    }
  } catch {
    return { entries: [], issues: [{ path: source, code: 'read', message: 'Could not read this level file.' }] }
  }
}

export async function scanLevels(directory = levelsDirectory): Promise<Scan> {
  try {
    const directoryEntries = await readdir(directory, { withFileTypes: true })
    const files = directoryEntries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .map(entry => entry.name)
      .sort()
    const scans = await Promise.all(files.map(name => readLevelFile(join(directory, name), `levels/${name}`)))
    const entries = scans.flatMap(scan => scan.entries)
    const issues = scans.flatMap(scan => scan.issues)
    const ids = new Map<string, number>()
    for (const { level } of entries) ids.set(level.id, (ids.get(level.id) ?? 0) + 1)
    const unique = entries.filter(({ level, source }) => {
      if (ids.get(level.id) === 1) return true
      issues.push({ path: `${source}/id`, code: 'duplicate-id', message: `More than one level uses ID "${level.id}".` })
      return false
    })
    unique.sort((a, b) => a.level.order - b.level.order || a.level.id.localeCompare(b.level.id, 'en'))
    const catalog = unique.map(({ level }) => level)
    for (const { level, source } of unique) {
      issues.push(...prerequisiteIssues(level, catalog).map(issue => ({ ...issue, path: source + issue.path })))
      issues.push(...breadboardProgramIssues(level, catalog).map(issue => ({ ...issue, path: source + issue.path })))
      issues.push(...shortChallengeLinkIssues(level, catalog).map(issue => ({ ...issue, path: source + issue.path })))
    }
    return { entries: unique, issues }
  } catch {
    return { entries: [], issues: [{ path: 'levels/', code: 'read', message: 'Could not read the levels folder.' }] }
  }
}
