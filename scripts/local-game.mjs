import { spawnSync } from 'node:child_process'
import { constants, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const windows = process.platform === 'win32'
const setupName = windows ? 'Setup.cmd' : process.platform === 'darwin' ? 'Setup.command' : 'sh setup.sh'
const startName = windows ? 'Start.cmd' : process.platform === 'darwin' ? 'Start.command' : 'sh start.sh'
const help = [
  `${setupName} [--labs]   安装依赖并构建游戏 / Install dependencies and build the game.`,
  '  --labs             同时安装本地 Python 实验 / Also install the Python labs.',
  `${startName} [--no-open] 启动游戏 / Start the game.`,
  '  --no-open          只启动服务 / Start without opening a browser.',
].join('\n')

function run(command, args) {
  const child = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (child.error?.code === 'ENOENT' && command === 'npm') {
    throw new Error('找不到 npm，请安装含 npm 的 Node.js 后重新初始化。 / Install Node.js with npm, then run setup again.')
  }
  if (child.error) throw child.error
  if (child.status !== 0) {
    process.exitCode = child.status ?? 1
    throw new Error(`执行失败 / Command failed: ${command} (${child.signal ?? child.status})`)
  }
}

function npm(args) {
  if (!windows) return run('npm', args)
  const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (existsSync(cli)) return run(process.execPath, [cli, ...args])
  // Some Windows version managers provide npm.cmd separately from node.exe.
  // Only the fixed npm subcommands below are passed to the command shell.
  run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', ...args])
}

function setupLabs() {
  const environment = join(root, 'labs', '.venv', windows ? 'Scripts/python.exe' : 'bin/python')
  const script = join(root, 'labs', 'setup.py')
  const versions = ['3.13', '3.12', '3.11']
  const candidates = windows
    ? [...versions.map(v => ['py', '-' + v]), ['python'], ['python3']]
    : [['python3'], ...versions.map(v => ['python' + v]), ['python']]
  if (existsSync(environment)) candidates.unshift([environment])
  const check = 'import struct, sys; sys.exit(not ((3, 11) <= sys.version_info[:2] <= (3, 13) and struct.calcsize("P") == 8))'
  for (const [command, ...args] of candidates) {
    // An initialized environment needs pip. Creating or repairing one needs ensurepip.
    const modules = command === environment ? 'import pip' : 'import venv, ensurepip'
    if (spawnSync(command, [...args, '-I', '-c', `${modules}; ${check}`], { stdio: 'ignore', timeout: 5000 }).status === 0) {
      run(command, [...args, script])
      return
    }
  }
  throw new Error('请安装带 venv 和 ensurepip 的 64 位 Python 3.11、3.12 或 3.13。Debian/Ubuntu 请安装与 Python 版本对应的 python3-venv 包。\nInstall 64-bit Python 3.11, 3.12 or 3.13 with venv and ensurepip. On Debian/Ubuntu install the matching python3-venv package.')
}

function setup(withLabs) {
  npm(['ci', '--include=dev'])
  npm(['run', 'build'])
  try {
    copyFileSync(join(root, '.env.example'), join(root, '.env'), constants.COPYFILE_EXCL)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  if (withLabs) setupLabs()
  console.log(`初始化完成。运行 ${startName} 即可开始。 / Ready. Run ${startName} to play.`)
}

async function start(openBrowser) {
  if (!existsSync(join(root, 'dist', 'index.html')) || !existsSync(join(root, 'node_modules', 'tsx', 'package.json'))) {
    throw new Error(`请先运行 ${setupName} 初始化项目。 / Run ${setupName} first.`)
  }
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  // Keep the server in this process so Ctrl+C and service-manager signals stop the listener.
  process.argv = [process.execPath, join(root, 'src', 'server', 'index.ts'), '--production']
  if (openBrowser) process.argv.push('--open')
  console.log('在此窗口按 Ctrl+C 可停止游戏。 / Press Ctrl+C here to stop the game.')
  await import('tsx')
  await import('../src/server/index.ts')
}

async function main() {
  const [mode, ...args] = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return console.log(help)
  const option = mode === 'setup' ? '--labs' : '--no-open'
  if (!['setup', 'start'].includes(mode) || args.length > 1 || (args.length && args[0] !== option)) {
    process.exitCode = 2
    throw new Error(help)
  }
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error('请安装 Node.js 22.12 或更新版本（含 npm）。 / Install Node.js 22.12 or later with npm.')
  }
  process.chdir(root)
  if (mode === 'setup') setup(args.includes('--labs'))
  else await start(!args.includes('--no-open'))
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = process.exitCode || 1
})
