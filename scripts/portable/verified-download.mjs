import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

async function cachedFileMatches(filename, expected) {
  const hash = createHash('sha256')
  try {
    for await (const chunk of createReadStream(filename)) hash.update(chunk)
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  return hash.digest('hex') === expected
}

export async function fetchVerifiedFile(url, destinationFile, sha256) {
  const destination = resolve(destinationFile)
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Invalid SHA-256 for ${destination}`)
  if (await cachedFileMatches(destination, sha256)) return destination
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.part`
  try {
    console.log(`Downloading ${url}`)
    const response = await fetch(url, { signal: AbortSignal.timeout(8 * 60_000) })
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} fetching ${url}`)
    const hash = createHash('sha256')
    await pipeline(Readable.fromWeb(response.body), async function* (chunks) {
      for await (const chunk of chunks) {
        hash.update(chunk)
        yield chunk
      }
    }, createWriteStream(temporary, { flags: 'wx' }))
    if (hash.digest('hex') !== sha256) throw new Error(`SHA-256 mismatch for ${url}`)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return destination
}
