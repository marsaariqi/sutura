const { execSync } = require('child_process')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const pkgDir = join(__dirname, '..', 'node_modules', 'tree-sitter-vue')

if (!existsSync(pkgDir)) {
  console.error('tree-sitter-vue not found in node_modules')
  process.exit(1)
}

// 1. Patch binding.gyp for C++20 if needed
const gypPath = join(pkgDir, 'binding.gyp')
let content = readFileSync(gypPath, 'utf8')
if (!content.includes('c++20')) {
  // Add cflags_cc for linux/mac and also ensure it works for windows via other means if needed
  // but the most reliable way for tree-sitter-vue's simple gyp is to just add it
  content = content.replace('"sources": [', '"cflags_cc": ["-std=c++20"], "sources": [')
  writeFileSync(gypPath, content)
  console.log('Patched tree-sitter-vue/binding.gyp')
}

// 2. Rebuild for Electron
console.log('Rebuilding tree-sitter-vue for Electron 39.2.6...')
try {
  execSync(
    'npx node-gyp rebuild --target=39.2.6 --arch=x64 --dist-url=https://electronjs.org/headers',
    {
      cwd: pkgDir,
      stdio: 'inherit'
    }
  )
  console.log('Successfully rebuilt tree-sitter-vue')
} catch (e) {
  console.error('Failed to rebuild tree-sitter-vue:', e.message)
  process.exit(1)
}
