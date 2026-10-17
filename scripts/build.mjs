import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
await mkdir(path.join(root, 'lib'), { recursive: true })
const styleRuntime = path.join(root, 'src/styles-runtime.ts')
const styles = {
  name: 'cordis-lifecycle-css',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path: filename }) => ({
      contents: `import { registerStyle } from ${JSON.stringify('./' + path.relative(path.dirname(filename), styleRuntime).split(path.sep).join('/'))}; registerStyle(${JSON.stringify(path.relative(root, filename))}, ${JSON.stringify(await readFile(filename, 'utf8'))});`,
      loader: 'js', resolveDir: path.dirname(filename),
    }))
  },
}
await build({
  absWorkingDir: root, entryPoints: ['src/client.ts'], outfile: 'lib/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: ['es2022'],
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  sourcemap: true, sourcesContent: true, legalComments: 'eof',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' }, plugins: [styles],
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
})
await build({ absWorkingDir: root, entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, format: 'esm', platform: 'node', target: ['node20'], sourcemap: true })
console.log(`Built ${manifest.name}: native lazy-CJS client factory + host marker.`)
