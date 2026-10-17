import { context } from 'esbuild'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
await mkdir(path.join(root, '.preview'), { recursive: true })
await copyFile(path.join(root, 'preview/index.html'), path.join(root, '.preview/index.html'))
const styleRuntime = path.join(root, 'src/styles-runtime.ts')
const ctx = await context({
  absWorkingDir: root, entryPoints: ['preview/main.tsx'], outfile: '.preview/preview.js',
  bundle: true, format: 'iife', platform: 'browser', target: ['es2022'], jsx: 'automatic',
  sourcemap: true, loader: { '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
  plugins: [{ name: 'preview-plugin-css', setup(build) {
    build.onLoad({ filter: /src\/ui\/.*\.css$/ }, async ({ path: filename }) => ({ contents: `import { registerStyle } from ${JSON.stringify(styleRuntime)}; registerStyle(${JSON.stringify(path.relative(root, filename))}, ${JSON.stringify(await readFile(filename, 'utf8'))});`, loader: 'js' }))
  } }],
})
await ctx.watch()
const server = await ctx.serve({ servedir: path.join(root, '.preview'), host: '0.0.0.0', port: Number(process.env.PORT ?? 4397) })
console.log(`Mock Host preview: http://localhost:${server.port} (local UI only, no model calls)`)
