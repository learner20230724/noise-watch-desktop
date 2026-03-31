const path = require('node:path')
const { spawn } = require('node:child_process')
const { waitFor } = require('./waitForHttp.cjs')

function run(cmd, args, opts) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    ...opts,
  })
  child.on('exit', (code) => {
    if (code !== 0) {
      process.exit(code ?? 1)
    }
  })
  return child
}

function resolveBinFromPackage(pkgName, relativeBinPath) {
  const pkgJsonPath = require.resolve(`${pkgName}/package.json`)
  return path.join(path.dirname(pkgJsonPath), relativeBinPath)
}

async function main() {
  const port = process.env.VITE_PORT || '5173'
  const url = `http://localhost:${port}`
  const viteCli = resolveBinFromPackage('vite', 'bin/vite.js')
  const electronCli = resolveBinFromPackage('electron', 'cli.js')

  run(process.execPath, [viteCli, '--strictPort', '--port', port], {
    env: { ...process.env, VITE_PORT: port },
  })
  await waitFor(url, 30000)

  run(process.execPath, [electronCli, '.'], {
    env: { ...process.env, ELECTRON_RENDERER_URL: url },
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
