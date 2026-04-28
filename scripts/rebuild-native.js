/**
 * Postinstall: Patch tree-sitter binding.gyp files for C++20 (Node 24 V8 requirement)
 * and rebuild native grammars via node-gyp.
 *
 * Run with: node scripts/rebuild-native.js
 */

const { execSync } = require('child_process')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const NODE_MODULES = join(__dirname, '..', 'node_modules')

const NATIVE_PACKAGES = [
  'tree-sitter',
  'tree-sitter-javascript',
  'tree-sitter-python',
  'tree-sitter-java',
  'tree-sitter-go',
  'tree-sitter-typescript',
  'tree-sitter-c',
  'tree-sitter-cpp',
  'tree-sitter-rust',
  'tree-sitter-ruby',
  'tree-sitter-kotlin',
  'tree-sitter-groovy',
  'tree-sitter-php',
  'tree-sitter-c-sharp',
  'tree-sitter-swift',
  'tree-sitter-bash',
  'tree-sitter-lua',
  'tree-sitter-scala',
  'tree-sitter-haskell',
  'tree-sitter-r',
  'tree-sitter-html',
  'tree-sitter-css',
  'tree-sitter-scss',
  // 'tree-sitter-sass',
  '@tree-sitter-grammars/tree-sitter-xml',
  '@tree-sitter-grammars/tree-sitter-yaml',
  '@tree-sitter-grammars/tree-sitter-toml',
  '@derekstride/tree-sitter-sql',
  'tree-sitter-properties'
]

function patchBindingGyp(pkgDir) {
  const gypPath = join(pkgDir, 'binding.gyp')
  if (!existsSync(gypPath)) return false

  let content = readFileSync(gypPath, 'utf-8')
  const original = content

  // Upgrade any C++ standard below C++20 to C++20 (required by Node 24 V8 headers)
  content = content.replace(/c\+\+17/g, 'c++20')
  content = content.replace(/c\+\+14/g, 'c++20')
  content = content.replace(/c\+\+11/g, 'c++20')

  if (content !== original) {
    writeFileSync(gypPath, content, 'utf-8')
    return true
  }
  return false
}

console.log('=== Sutura: Rebuilding native tree-sitter modules (C++20) ===\n')

for (const pkg of NATIVE_PACKAGES) {
  const pkgDir = join(NODE_MODULES, pkg)
  if (!existsSync(pkgDir)) {
    console.log(`  SKIP ${pkg} (not installed)`)
    continue
  }

  const patched = patchBindingGyp(pkgDir)
  if (patched) {
    console.log(`  PATCHED ${pkg}/binding.gyp → C++20`)
  }

  try {
    console.log(`  BUILD  ${pkg}...`)
    execSync('npx node-gyp rebuild', {
      cwd: pkgDir,
      stdio: 'pipe',
      timeout: 120_000
    })
    console.log(`  OK     ${pkg}`)
  } catch (err) {
    console.error(`  FAIL   ${pkg}: ${err.message?.split('\n')[0]}`)
  }
}

console.log('\n=== Done ===')
