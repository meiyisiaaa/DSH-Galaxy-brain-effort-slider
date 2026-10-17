/** Read-only audit: hash the reviewed upstream files; never import or execute them. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = process.argv[2]
if (!sourceRoot) {
  throw new Error('Usage: npm run check:upstream -- /path/to/deepseek-harness-at-dsh-v0.2.0-rc.2 (source is read only)')
}
const audit = JSON.parse(await readFile(path.join(root, 'docs/UPSTREAM-RC2.json'), 'utf8'))
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
assert.equal(manifest.engines.dsh, audit.version)
assert.equal(manifest.peerDependencies['@deepseek-ai/dsh'], audit.version,
  'rc.2 checks DSH peers, not engines.dsh; the optional peer must retain the exact gate')
for (const file of audit.files) {
  const bytes = await readFile(path.join(sourceRoot, file.path))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256,
    `Audited rc.2 source differs: ${file.path}`)
}
console.log(`Verified ${audit.files.length} source hashes for ${audit.tag} (${audit.commit}); no upstream code executed.`)
