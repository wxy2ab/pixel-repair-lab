import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { checkMacSigning, signMacApp, notarizeMacDiskImage } from './sign-release.mjs'
import { smokeTestApp } from './smoke-app.mjs'

const tools = fileURLToPath(new URL('./', import.meta.url))
const kit = resolve(tools, '..')
const usage = `publish.sh [--check] [--output DIRECTORY]
MAC_SIGN_IDENTITY: Developer ID Application certificate name or SHA-1 fingerprint
MAC_NOTARY_PROFILE: local notarytool keychain profile (default: PixelRepairLab-notary)
--check validates the release environment without submitting software to Apple.
The default action submits the signed build to Apple and publishes the verified DMG.`

function run(command, args) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`${command} exited with ${signal ?? code}`)))
  })
}

async function assembleApp(app, work, target, version, bundleId) {
  const contents = join(app, 'Contents')
  const resources = join(contents, 'Resources')
  const game = join(resources, 'game')
  const payload = join(kit, 'payload')
  const inputs = join(payload, 'game')
  const labInputs = join(inputs, 'labs')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await mkdir(join(contents, 'Helpers'), { recursive: true })
  await cp(inputs, game, { recursive: true, filter: path => path !== labInputs })
  await copyFile(join(payload, 'runtime/bin/node'), join(contents, 'Helpers/node'))
  await chmod(join(contents, 'Helpers/node'), 0o755)
  await copyFile(join(payload, 'runtime/LICENSE'), join(resources, 'Node-LICENSE.txt'))

  const plist = (await readFile(join(tools, 'Info.plist'), 'utf8')).replaceAll('@VERSION@', version).replaceAll('@BUNDLE_ID@', bundleId)
  await writeFile(join(contents, 'Info.plist'), plist)
  await run('/usr/bin/plutil', ['-lint', join(contents, 'Info.plist')])
  for (const [language, title] of [['en', 'Pixel Repair Lab'], ['zh-Hans', '像素维修站']]) {
    const directory = join(resources, language + '.lproj')
    await mkdir(directory)
    await writeFile(join(directory, 'InfoPlist.strings'), `"CFBundleDisplayName" = "${title}";\n"CFBundleName" = "${title}";\n`)
  }
  const iconset = join(work, 'Sprout.iconset')
  await mkdir(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = String(size * scale)
      const icon = join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)
      await run('/usr/bin/sips', ['-s', 'format', 'png', '-z', pixels, pixels, join(tools, 'sprout.webp'), '--out', icon])
    }
  }
  await run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'Sprout.icns')])
  const cpu = target === 'macos-arm64' ? 'arm64' : 'x86_64'
  await run('/usr/bin/xcrun', ['--sdk', 'macosx', 'swiftc', '-swift-version', '5', '-O', '-target',
    `${cpu}-apple-macosx13.0`, '-framework', 'AppKit', join(tools, 'Launcher.swift'), '-o', join(contents, 'MacOS/PixelRepairLab')])
  await run('/usr/bin/python3', [join(tools, 'prepare-labs.py'), labInputs, app, '--arch', cpu])
}

async function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean' }, output: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) return console.log(usage)
  if (process.platform !== 'darwin') throw new Error('请在装有 Xcode 的发布 Mac 上运行。 / Use a release Mac with Xcode.')
  const { target, version } = JSON.parse(await readFile(join(kit, 'release.json'), 'utf8'))
  const bundleId = process.env.MAC_BUNDLE_ID || 'org.pixelrepair.lab'
  if (!['macos-arm64', 'macos-x64'].includes(target) || !/^\d+(\.\d+){1,2}$/.test(version)) throw new Error('Invalid release metadata')
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(bundleId)) throw new Error('Invalid MAC_BUNDLE_ID')
  const identity = process.env.MAC_SIGN_IDENTITY
  if (!identity) throw new Error('请设置 MAC_SIGN_IDENTITY。需要钥匙串中的 Developer ID Application 签名身份。')
  const profile = process.env.MAC_NOTARY_PROFILE || 'PixelRepairLab-notary'
  await run('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path'])
  const signing = await checkMacSigning({ identity, profile })
  if (values.check) return console.log('发布环境检查通过。 / Publisher credentials and tools are ready.')

  const output = resolve(values.output ?? join(kit, 'output'))
  await mkdir(output, { recursive: true })
  const work = await mkdtemp(join(output, '.publish-'))
  try {
    const app = join(work, 'Pixel Repair Lab.app')
    await assembleApp(app, work, target, version, bundleId)
    await signMacApp(app, signing)
    await smokeTestApp(app)
    const name = `PixelRepairLab-${version}-${target}.dmg`
    const image = join(work, name)
    await notarizeMacDiskImage(app, image, signing)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(image)) hash.update(chunk)
    await writeFile(image + '.sha256', `${hash.digest('hex')}  ${name}\n`)
    await rename(image, join(output, name))
    await rename(image + '.sha256', join(output, name + '.sha256'))
    console.log(`发布完成 / Ready for distribution: ${join(output, name)}`)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
