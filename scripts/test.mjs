import { build } from 'esbuild'
import { mkdir, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
await mkdir('.test-build', { recursive: true })
const files = (await readdir('tests')).filter(file => file.endsWith('.test.ts')).map(file => `tests/${file}`)
await build({ entryPoints: files, outdir: '.test-build', bundle: true, format: 'esm', platform: 'node', packages: 'external', loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' }, target: 'node20' })
const result = spawnSync(process.execPath, ['--test', ...files.map(file => `.test-build/${file.split('/').at(-1).replace(/\.ts$/, '.js')}`)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
