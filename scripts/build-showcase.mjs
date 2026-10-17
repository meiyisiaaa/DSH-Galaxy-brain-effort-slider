import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, '../harness-plugin-delivery/DeepSeek-Galaxy-Interactive.html')

const result = await build({
  absWorkingDir: root,
  entryPoints: ['preview/showcase.tsx'],
  outfile: '.showcase/showcase.js',
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  legalComments: 'inline',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
})

const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text
if (!js || !css) throw new Error('Showcase build did not produce both JavaScript and CSS.')

// A single offline file: bundled React, the real slider, its CSS and the PNG atlas.
// Escape closing tags so later source edits cannot terminate the inline payloads.
const html = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>DeepSeek 银河滑块 · 交互演示</title>
  <meta name="description" content="银河推理滑块离线交互演示，使用真实 UI 组件，只在本页切换档位，不连接模型或保存设置。">
  <style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
  <div id="root"></div>
  <noscript>请启用 JavaScript 以体验银河推理滑块。</noscript>
  <script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`
await mkdir(path.dirname(target), { recursive: true })
await writeFile(target, html)
console.log(`Built offline interactive showcase: ${target} (${Buffer.byteLength(html)} bytes)`)
