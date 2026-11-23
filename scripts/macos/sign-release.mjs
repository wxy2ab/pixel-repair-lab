import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, readdir, readlink, realpath, rename, rm, rmdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const codesign = '/usr/bin/codesign'
const xcrun = '/usr/bin/xcrun'
const spctl = '/usr/sbin/spctl'

function requireMac() {
  if (process.platform !== 'darwin') throw new Error('Signing and notarization require a Mac with Xcode.')
}

async function run(program, args) {
  const { stdout } = await exec(program, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return stdout.trim()
}

// Select a particular valid Developer ID Application signing identity with a private key.
async function signingIdentity(requested) {
  requireMac()
  if (!requested?.trim()) throw new Error('Specify the Developer ID Application certificate name or its SHA-1 fingerprint.')
  const available = await run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'])
  const matches = [...available.matchAll(/^\s*\d+\)\s+([a-f\d]{40})\s+"(Developer ID Application: .+?)"\s*$/gim)]
    .filter(([, fingerprint, name]) => requested === name || requested.toUpperCase() === fingerprint.toUpperCase())
  if (matches.length !== 1) throw new Error('Select one valid Developer ID Application identity from security find-identity -v -p codesigning. If names repeat, use its fingerprint.')
  return matches[0][1]
}

export async function checkMacSigning({ identity, profile }) {
  const fingerprint = await signingIdentity(identity)
  if (!profile?.trim()) throw new Error('Specify the notarytool Keychain profile name.')
  await run(xcrun, ['--find', 'stapler'])
  // Validate this profile before spending time signing the runtime. Credentials stay in Keychain.
  await run(xcrun, ['notarytool', 'history', '--keychain-profile', profile, '--output-format', 'json'])
  return { identity: fingerprint, profile }
}

const thinMagic = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe'])
const fatMagic = new Set(['cafebabe', 'cafebabf', 'bebafeca', 'bfbafeca'])
const signableTypes = new Set([2, 6, 8]) // MH_EXECUTE, MH_DYLIB, MH_BUNDLE

async function isMachO(path) {
  const file = await open(path, 'r')
  try {
    const header = Buffer.alloc(32)
    const { bytesRead } = await file.read(header, 0, header.length, 0)
    if (bytesRead < 16) return false
    const magic = header.toString('hex', 0, 4)
    const u32 = magic.startsWith('fe') || magic.startsWith('ca') ? offset => header.readUInt32BE(offset) : offset => header.readUInt32LE(offset)
    if (thinMagic.has(magic)) return signableTypes.has(u32(12))
    // 0xcafebabe also starts a Java class. Only recognize a plausible universal image with a Mach-O slice.
    if (!fatMagic.has(magic) || u32(4) < 1 || u32(4) > 64 || bytesRead < 24) return false
    const fat64 = magic === 'cafebabf' || magic === 'bfbafeca'
    const position = fat64 ? Number(magic === 'cafebabf' ? header.readBigUInt64BE(16) : header.readBigUInt64LE(16)) : u32(16)
    if (!Number.isSafeInteger(position) || position < 28) return false
    const slice = Buffer.alloc(16)
    const next = await file.read(slice, 0, slice.length, position)
    if (next.bytesRead !== slice.length || !thinMagic.has(slice.toString('hex', 0, 4))) return false
    return signableTypes.has(slice[0] === 0xfe ? slice.readUInt32BE(12) : slice.readUInt32LE(12))
  } finally {
    await file.close()
  }
}

const bundleTypes = new Set(['.app', '.framework', '.appex', '.xpc', '.bundle', '.plugin'])

async function mainExecutable(bundle) {
  if (extname(bundle) === '.framework') return realpath(join(bundle, basename(bundle, '.framework')))
  const info = join(bundle, 'Contents', 'Info.plist')
  const name = await run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', info])
  if (!name || basename(name) !== name) throw new Error(`Invalid CFBundleExecutable in ${info}`)
  return realpath(join(bundle, 'Contents', 'MacOS', name))
}

// A bundle's own signature covers its main executable. Sign all other Mach-O files and enclosed bundles first.
export async function macSigningPlan(appPath, readExecutable = mainExecutable) {
  const bundle = await realpath(appPath)
  const node = join(bundle, 'Contents', 'Helpers', 'node')
  const entries = []
  const principals = new Set()
  async function visit(directory, isBundle) {
    if (isBundle) principals.add(await readExecutable(directory))
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name)
      if (file.isSymbolicLink()) {
        const link = await readlink(path)
        const inside = relative(bundle, await realpath(path))
        if (isAbsolute(link) || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) {
          throw new Error(`Non-relocatable application symlink: ${path} -> ${link}`)
        }
      } else if (file.isDirectory()) {
        await visit(path, bundleTypes.has(extname(file.name)))
      } else if (file.isFile() && !principals.has(path) && await isMachO(path)) {
        // Node's V8 uses MAP_JIT on Darwin for JavaScript and WebAssembly (including fetch).
        const entitlements = path === node ? fileURLToPath(new URL('node-entitlements.plist', import.meta.url)) : undefined
        entries.push({ path, isBundle: false, entitlements })
      }
    }
    if (isBundle) entries.push({ path: directory, isBundle: true })
  }
  await visit(bundle, true)
  return entries
}

export async function signMacApp(appPath, { identity }) {
  const signer = await signingIdentity(identity)
  const bundle = await realpath(appPath)
  const bundleID = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(bundle, 'Contents/Info.plist')])
  const plan = await macSigningPlan(bundle)
  console.log(`Signing ${plan.length} native code items with Developer ID Application…`)
  for (const item of plan) {
    const args = ['--force', '--sign', signer, '--options', 'runtime', '--timestamp']
    if (!item.isBundle) {
      const leaf = basename(item.path).replace(/[^a-zA-Z0-9-]+/g, '-')
      const tag = createHash('sha256').update(relative(bundle, item.path)).digest('hex').slice(0, 12)
      args.push('--identifier', `${bundleID}.${leaf}.${tag}`)
    }
    if (item.entitlements) args.push('--entitlements', item.entitlements)
    await run(codesign, [...args, item.path])
  }
  await run(codesign, ['--verify', '--deep', '--strict', '--verbose=2', bundle])
}

async function notarize(file, profile) {
  console.log(`Submitting ${basename(file)} to Apple and waiting for the ticket…`)
  let raw
  try {
    raw = await run(xcrun, ['notarytool', 'submit', file, '--keychain-profile', profile, '--wait', '--output-format', 'json'])
  } catch (error) {
    // Some versions return a nonzero exit with the submission details in stdout.
    if (!error.stdout?.trim().startsWith('{')) throw error
    raw = error.stdout
  }
  const { status, id } = JSON.parse(raw)
  if (status !== 'Accepted') {
    throw new Error(`Apple notarization status: ${status ?? 'unknown'}; submission: ${id ?? 'unknown'}. Inspect it with xcrun notarytool log and your Keychain profile.`)
  }
  console.log(`Apple accepted submission ${id}.`)
}

async function staple(file) {
  await run(xcrun, ['stapler', 'staple', file])
  await run(xcrun, ['stapler', 'validate', file])
}

async function verifyMountedApp(dmg, appName) {
  const mount = await mkdtemp(join(tmpdir(), 'pixel-repair-image-'))
  let attached = false
  try {
    await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, dmg])
    attached = true
    const shippedApp = join(mount, appName)
    await run(codesign, ['--verify', '--deep', '--strict', '--verbose=2', shippedApp])
    await run(xcrun, ['stapler', 'validate', shippedApp])
    await run(spctl, ['--assess', '--type', 'execute', '--verbose=2', shippedApp])
  } finally {
    if (attached) await run('/usr/bin/hdiutil', ['detach', mount])
    await rmdir(mount).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}

export async function notarizeMacDiskImage(appPath, outputDmg, { identity, profile }) {
  const signer = await signingIdentity(identity)
  if (!profile?.trim()) throw new Error('Specify the notarytool Keychain profile name.')
  const app = await realpath(appPath)
  const output = resolve(outputDmg)
  if (extname(output) !== '.dmg') throw new Error('Expected a .dmg output path.')
  await mkdir(dirname(output), { recursive: true })
  const work = await mkdtemp(join(dirname(output), '.notarize-'))
  try {
    await run(codesign, ['--verify', '--deep', '--strict', '--verbose=2', app])
    const zip = join(work, 'PixelRepairLab.zip')
    await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, zip])
    await notarize(zip, profile)
    await staple(app)
    await run(spctl, ['--assess', '--type', 'execute', '--verbose=2', app])

    const contents = join(work, 'image')
    await mkdir(contents)
    await run('/usr/bin/ditto', [app, join(contents, basename(app))])
    await symlink('/Applications', join(contents, 'Applications'))
    const dmg = join(work, 'PixelRepairLab.dmg')
    await run('/usr/bin/hdiutil', ['create', '-format', 'UDZO', '-fs', 'HFS+', '-volname', 'Pixel Repair Lab', '-srcfolder', contents, dmg])
    const bundleID = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(app, 'Contents/Info.plist')])
    await run(codesign, ['--sign', signer, '--timestamp', '--identifier', bundleID + '.dmg', dmg])
    await notarize(dmg, profile)
    await staple(dmg)
    await run(codesign, ['--verify', '--strict', dmg])
    await run(spctl, ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg])
    await verifyMountedApp(dmg, basename(app))
    await rename(dmg, output)
    return output
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
