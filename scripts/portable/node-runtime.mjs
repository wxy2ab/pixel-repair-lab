import { execFile } from 'node:child_process'
import { chmod, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fetchVerifiedFile } from './verified-download.mjs'

export const NODE_VERSION = '22.23.5'
export const DEFAULT_NODE_CACHE = join(homedir(), '.cache', 'pixel-repair-lab', 'node')
const execFileAsync = promisify(execFile)
const release = `https://nodejs.org/dist/v${NODE_VERSION}`

// Pinned from https://nodejs.org/dist/v22.23.5/SHASUMS256.txt.
const runtimes = {
  'macos-arm64': ['darwin-arm64', 'e7131995759b61a0170b646010d2ad35a5d37b4cb0d471f3e8317eac6f742f3d'],
  'macos-x64': ['darwin-x64', 'c53383238206b9ae4db23c5d8a63645e2e753bec8ab51a49cc81939aa64e9422'],
  'linux-arm64': ['linux-arm64', '8bd3dc69eee8f3f226315a80d7d1d4faccf217a4c8fae500168ac2e38f3bdba3'],
  'linux-x64': ['linux-x64', 'c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1'],
}

export async function prepareNodeRuntime(target, destination, cacheDir = DEFAULT_NODE_CACHE) {
  if (!Object.hasOwn(runtimes, target)) throw new Error(`Unknown Node runtime target: ${target}`)
  const [distribution, checksum] = runtimes[target]
  const folder = `node-v${NODE_VERSION}-${distribution}`
  const filename = `${folder}.tar.gz`
  const archive = await fetchVerifiedFile(`${release}/${filename}`, join(cacheDir, filename), checksum)
  const runtime = resolve(destination, 'runtime')
  await mkdir(runtime, { recursive: true })
  await execFileAsync('tar', ['-xzf', archive, '-C', runtime, '--strip-components=1',
    `${folder}/bin/node`, `${folder}/LICENSE`], { windowsHide: true })
  await chmod(join(runtime, 'bin', 'node'), 0o755)
}
