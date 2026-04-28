import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'

// Native tree-sitter (loaded via require for Electron main process)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('tree-sitter')

// ---------- Supported extensions ----------

const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.java',
  '.go',
  '.py',
  '.kt',
  '.groovy',
  '.md',
  '.c',
  '.cpp',
  '.sql',
  '.h',
  '.hpp',
  '.rs',
  '.rb',
  '.php',
  '.cs',
  '.swift',
  '.sh',
  '.bash',
  '.lua',
  '.scala',
  '.hs',
  '.r',
  '.html',
  '.htm',
  '.css',
  '.json',
  '.jsonc',
  '.xml',
  '.svg',
  '.xsl',
  '.xslt',
  '.plist',
  '.fxml',
  '.xhtml',
  '.yml',
  '.yaml',
  '.toml',
  '.vue',
  '.scss',
  '.properties'
])

// ---------- Grammar mapping (native tree-sitter modules) ----------

interface GrammarConfig {
  module: string
  subpath?: string
}

const EXT_TO_GRAMMAR: Record<string, GrammarConfig> = {
  '.js': { module: 'tree-sitter-javascript' },
  '.jsx': { module: 'tree-sitter-javascript' },
  '.ts': { module: 'tree-sitter-typescript', subpath: 'typescript' },
  '.tsx': { module: 'tree-sitter-typescript', subpath: 'tsx' },
  '.java': { module: 'tree-sitter-java' },
  '.go': { module: 'tree-sitter-go' },
  '.py': { module: 'tree-sitter-python' },
  '.kt': { module: 'tree-sitter-kotlin' },
  '.groovy': { module: 'tree-sitter-groovy' },
  '.c': { module: 'tree-sitter-c' },
  '.h': { module: 'tree-sitter-c' },
  '.cpp': { module: 'tree-sitter-cpp' },
  '.hpp': { module: 'tree-sitter-cpp' },
  '.rs': { module: 'tree-sitter-rust' },
  '.rb': { module: 'tree-sitter-ruby' },
  '.php': { module: 'tree-sitter-php', subpath: 'php' },
  '.cs': { module: 'tree-sitter-c-sharp' },
  '.swift': { module: 'tree-sitter-swift' },
  '.sh': { module: 'tree-sitter-bash' },
  '.bash': { module: 'tree-sitter-bash' },
  '.lua': { module: 'tree-sitter-lua' },
  '.scala': { module: 'tree-sitter-scala' },
  '.hs': { module: 'tree-sitter-haskell' },
  '.r': { module: 'tree-sitter-r' },
  '.html': { module: 'tree-sitter-html' },
  '.htm': { module: 'tree-sitter-html' },
  '.css': { module: 'tree-sitter-css/bindings/node/index.js' },
  '.scss': { module: 'tree-sitter-scss' },
  '.properties': { module: 'tree-sitter-properties' },
  '.json': { module: 'tree-sitter-json' },
  '.jsonc': { module: 'tree-sitter-json' },
  '.xml': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.svg': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.xsl': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.xslt': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.plist': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.fxml': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.xhtml': { module: '@tree-sitter-grammars/tree-sitter-xml', subpath: 'xml' },
  '.yml': { module: '@tree-sitter-grammars/tree-sitter-yaml' },
  '.yaml': { module: '@tree-sitter-grammars/tree-sitter-yaml' },
  '.toml': { module: '@tree-sitter-grammars/tree-sitter-toml' },
  '.sql': { module: '@derekstride/tree-sitter-sql' },
  '.vue': { module: 'tree-sitter-html' }
}

// ---------- AST node type sets ----------

const COMMENT_NODE_TYPES = new Set([
  'comment',
  'line_comment',
  'block_comment',
  'javadoc_comment',
  'documentation_comment',
  'doc_comment',
  'Comment',
  'js_comment',
  'single_line_comment',
  'sassdoc_comment'
])

const STRING_NODE_TYPES = new Set([
  'string',
  'string_literal',
  'literal',
  'template_string',
  'template_literal_type',
  'interpreted_string_literal',
  'raw_string_literal',
  'string_content',
  'encapsed_string',
  'heredoc_body',
  'concatenated_string',
  'CharData',
  'table_option',
  'ERROR',
  'text',
  'attribute_value',
  'attribute',
  'quoted_attribute_value',
  'jsx_text',
  'jsx_attribute',
  'jsx_expression',
  'value',
  'string_value',
  'plain_value'
])

// ---------- Types ----------

export interface ExtractedNode {
  lineStart: number
  colStart: number
  lineEnd: number
  colEnd: number
  nodeType: 'COMMENT' | 'STRING_LITERAL'
  text: string
}

export function isSupportedExtension(ext: string): boolean {
  return SUPPORTED_EXTENSIONS.has(ext)
}

export function getSupportedExtensions(): string[] {
  return [...SUPPORTED_EXTENSIONS]
}

// ---------- Native parser singleton ----------

let parserInstance: InstanceType<typeof Parser> | null = null

export function initParser(): void {
  if (!parserInstance) {
    parserInstance = new Parser()
  }
}

// ---------- Native grammar loading (cached) ----------

const languageCache = new Map<string, any>()

async function loadLanguage(ext: string): Promise<any | null> {
  if (languageCache.has(ext)) return languageCache.get(ext)!

  const config = EXT_TO_GRAMMAR[ext]
  if (!config) {
    console.warn(`No grammar config for ${ext}, falling back to basic text mode`)
    languageCache.set(ext, null)
    return null
  }

  try {
    // Use dynamic import() to support both CJS and ESM grammars (required for Node 22+)
    let rawMod
    try {
      rawMod = await import(config.module)
    } catch (importErr) {
      // Fallback for some environments/bundles where require is still needed or better
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      rawMod = require(config.module)
    }

    // Handle ESM wrapper (.default) if present and not a grammar itself
    let mod = rawMod
    if (mod && mod.default && !mod.name && typeof mod !== 'function') {
      mod = mod.default
    }

    let lang = config.subpath ? mod[config.subpath] : mod

    // Fallback: check rawMod[subpath] in case it wasn't in .default
    if (!lang && config.subpath && rawMod[config.subpath]) {
      lang = rawMod[config.subpath]
    }

    // 1. Handle further nesting patterns (property-named grammars)
    if (lang && typeof lang !== 'function' && !lang.name) {
      // Look for any property that looks like a grammar (has a name or is a function)
      const grammarKey = Object.keys(lang).find(
        (k) => typeof lang[k] === 'function' || (lang[k] && lang[k].name)
      )
      if (grammarKey) lang = lang[grammarKey]
    }

    // 2. If we still don't have a valid-looking grammar, try the root module itself
    if (!lang || (typeof lang !== 'function' && !lang.name)) {
      const target = mod || rawMod
      if (target && typeof target !== 'function' && !target.name) {
        const grammarKey = Object.keys(target).find(
          (k) => typeof target[k] === 'function' || (target[k] && target[k].name)
        )
        if (grammarKey) lang = target[grammarKey]
      }
    }

    if (!lang || (typeof lang !== 'object' && typeof lang !== 'function')) {
      console.warn(`Grammar module loaded but no valid language found for ${ext}`)
      languageCache.set(ext, null)
      return null
    }

    languageCache.set(ext, lang)
    return lang
  } catch (err) {
    console.warn(`Native grammar not available for ${ext}: ${(err as Error).message}`)
    console.warn(`Files with ${ext} extension will use basic text fallback`)
    languageCache.set(ext, null)
    return null
  }
}

// ---------- Native AST walking ----------

interface TreeSitterNode {
  type: string
  text: string
  startPosition: { row: number; column: number }
  endPosition: { row: number; column: number }
  children: TreeSitterNode[]
  childCount: number
}

async function walkNode(
  node: TreeSitterNode,
  nodes: ExtractedNode[],
  lineOffset = 0,
  colOffset = 0
): Promise<void> {
  // Handle nested parsing for Vue SFC blocks
  if (node.type === 'script_element' || node.type === 'style_element') {
    const isScript = node.type === 'script_element'
    const lang = getAttributeValue(node, 'lang') || (isScript ? 'js' : 'css')
    const contentNode = node.children.find((c) => c.type === 'raw_text')

    if (contentNode) {
      const ext = isScript ? (lang === 'ts' ? '.ts' : '.js') : '.css'
      const langGrammar = await loadLanguage(ext)
      if (langGrammar) {
        const nestedParser = new Parser()
        nestedParser.setLanguage(langGrammar)
        const subTree = nestedParser.parse(contentNode.text)
        await walkNode(
          subTree.rootNode as unknown as TreeSitterNode,
          nodes,
          lineOffset + contentNode.startPosition.row,
          contentNode.startPosition.column // Use absolute col since it's start of raw_text
        )
      }
    }
    // Don't walk children further, we already handled the content via nested parsing
    return
  }

  if (COMMENT_NODE_TYPES.has(node.type)) {
    if (node.text.trim().length > 1) {
      let displayText = node.text
      if (displayText.startsWith('--')) {
        displayText = displayText.replace(/^--/, '#')
      }

      nodes.push({
        lineStart: lineOffset + node.startPosition.row + 1,
        colStart:
          node.startPosition.row === 0
            ? colOffset + node.startPosition.column
            : node.startPosition.column,
        lineEnd: lineOffset + node.endPosition.row + 1,
        colEnd:
          node.endPosition.row === 0
            ? colOffset + node.endPosition.column
            : node.endPosition.column,
        nodeType: 'COMMENT',
        text: displayText
      })
    }
    return
  }

  if (STRING_NODE_TYPES.has(node.type)) {
    if (node.text.length > 2) {
      nodes.push({
        lineStart: lineOffset + node.startPosition.row + 1,
        colStart:
          node.startPosition.row === 0
            ? colOffset + node.startPosition.column
            : node.startPosition.column,
        lineEnd: lineOffset + node.endPosition.row + 1,
        colEnd:
          node.endPosition.row === 0
            ? colOffset + node.endPosition.column
            : node.endPosition.column,
        nodeType: 'STRING_LITERAL',
        text: node.text
      })
    }
    return
  }

  for (let i = 0; i < node.childCount; i++) {
    await walkNode(node.children[i], nodes, lineOffset, colOffset)
  }
}

/**
 * Helper to extract attribute values (like lang="ts") from tags in Vue/HTML.
 */
function getAttributeValue(node: TreeSitterNode, attrName: string): string | null {
  const startTag = node.children.find((c) => c.type === 'start_tag')
  if (!startTag) return null

  const attr = startTag.children.find((c) => c.type === 'attribute' && c.text.startsWith(attrName))
  if (!attr) return null

  const valueNode = attr.children.find((c) => c.type === 'attribute_value')
  if (!valueNode) return null

  // Remove quotes
  return valueNode.text.replace(/^["']|["']$/g, '')
}

// ---------- Main extraction (native tree-sitter with basic fallback) ----------

export async function extractNodes(filePath: string): Promise<ExtractedNode[]> {
  const ext = extname(filePath).toLowerCase()
  if (!isSupportedExtension(ext)) return []

  // Markdown uses dedicated extractor (no tree-sitter grammar)
  if (ext === '.md') {
    return extractFromMarkdown(filePath)
  }

  initParser()
  if (!parserInstance) return []

  const language = await loadLanguage(ext)
  if (!language) {
    // Graceful fallback: use basic regex extraction instead of returning empty
    console.warn(`Using basic text fallback for ${filePath}`)
    return extractBasicFallback(filePath)
  }

  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
    if (ext === '.sql') {
      // Swap # for -- so the Tree-sitter SQL grammar doesn't crash.
      // This happens only in this 'source' variable, NOT on your hard drive.
      source = source.replace(/^#/gm, '--')
    }
  } catch {
    return []
  }

  try {
    parserInstance.setLanguage(language)
    const tree = parserInstance.parse(source)
    const nodes: ExtractedNode[] = []
    await walkNode(tree.rootNode as unknown as TreeSitterNode, nodes)
    return nodes
  } catch (error) {
    console.error(`Native tree-sitter parse error for ${filePath}:`, error)
    // Fall back to basic extraction on parse error instead of returning empty
    return extractBasicFallback(filePath)
  }
}

// ---------- Basic regex fallback for unsupported/missing grammars ----------

function extractBasicFallback(filePath: string): ExtractedNode[] {
  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const lines = source.split('\n')
  const nodes: ExtractedNode[] = []

  // Match common comment patterns
  const lineCommentPat = /^\s*(\/\/|#)\s*(.+)/
  const blockCommentStart = /\/\*/
  const blockCommentEnd = /\*\//
  let inBlock = false
  let blockStart = 0
  let blockLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (inBlock) {
      blockLines.push(line)
      if (blockCommentEnd.test(line)) {
        const text = blockLines.join('\n').trim()
        if (text.length > 2) {
          nodes.push({
            lineStart: blockStart + 1,
            colStart: 0,
            lineEnd: i + 1,
            colEnd: line.length,
            nodeType: 'COMMENT',
            text
          })
        }
        inBlock = false
        blockLines = []
      }
      continue
    }

    if (blockCommentStart.test(line) && !blockCommentEnd.test(line)) {
      inBlock = true
      blockStart = i
      blockLines = [line]
      continue
    }

    // Single-line block comment
    if (blockCommentStart.test(line) && blockCommentEnd.test(line)) {
      const text = line.trim()
      if (text.length > 4) {
        nodes.push({
          lineStart: i + 1,
          colStart: 0,
          lineEnd: i + 1,
          colEnd: line.length,
          nodeType: 'COMMENT',
          text
        })
      }
      continue
    }

    const match = lineCommentPat.exec(line)
    if (match && match[2].trim().length > 1) {
      nodes.push({
        lineStart: i + 1,
        colStart: 0,
        lineEnd: i + 1,
        colEnd: line.length,
        nodeType: 'COMMENT',
        text: line.trim()
      })
    }
  }

  return nodes
}

// ---------- Markdown extraction ----------

function extractFromMarkdown(filePath: string): ExtractedNode[] {
  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const lines = source.split('\n')
  const nodes: ExtractedNode[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const trimmed = line.trim()
    if (trimmed.length > 0) {
      nodes.push({
        lineStart: i + 1,
        colStart: 0,
        lineEnd: i + 1,
        colEnd: line.length,
        nodeType: 'COMMENT',
        text: trimmed
      })
    }
  }
  return nodes
}

// ---------- Source language filtering ----------

/**
 * Unicode script patterns for detecting source language characters.
 * Only languages with non-Latin scripts can be reliably detected.
 */
const SCRIPT_PATTERNS: Record<string, RegExp> = {
  Chinese: /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/,
  Japanese: /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u31f0-\u31ff]/,
  Korean: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/,
  Arabic: /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/,
  Russian: /[\u0400-\u04ff]/,
  Thai: /[\u0e00-\u0e7f]/,
  Hindi: /[\u0900-\u097f]/,
  Hebrew: /[\u0590-\u05ff]/
}

/**
 * Filter extracted nodes to only include those containing the source language's script.
 * For languages with detectable non-Latin scripts (Chinese, Japanese, Korean, etc.),
 * this filters out English text, URL paths, code identifiers, etc.
 * For Latin-based source languages (or empty), returns all nodes unfiltered.
 */
export function filterNodesBySourceLanguage(
  nodes: ExtractedNode[],
  sourceLanguage: string
): ExtractedNode[] {
  if (!sourceLanguage) return nodes

  const pattern = SCRIPT_PATTERNS[sourceLanguage]
  // No Unicode detection available for this language — return everything
  if (!pattern) return nodes

  return nodes.filter((node) => {
    const stripped = node.text.replace(/^["'`]+|["'`]+$/g, '').trim()
    return pattern.test(stripped)
  })
}

// ---------- Mixed string literal splitting ----------

const LARGE_STRING_THRESHOLD = 200

/**
 * For large STRING_LITERAL nodes that contain embedded quoted sub-strings
 * with source language text (e.g. SQL COMMENT '中文'), split them into
 * individual sub-segments. This way the AI only receives the translatable
 * text, not the entire code block — preventing token waste and code breakage.
 */
export function splitMixedStringLiterals(
  nodes: ExtractedNode[],
  sourceLanguage: string
): ExtractedNode[] {
  const pattern = SCRIPT_PATTERNS[sourceLanguage]
  if (!pattern) return nodes

  const result: ExtractedNode[] = []

  for (const node of nodes) {
    const isPotentialContainer = !/^["'`]/.test(node.text)
    if (
      node.nodeType !== 'STRING_LITERAL' ||
      (node.text.length <= LARGE_STRING_THRESHOLD && !isPotentialContainer)
    ) {
      result.push(node)
      continue
    }

    const segments = extractInnerQuotedSegments(node, pattern)
    if (segments.length > 0) {
      result.push(...segments)
    } else {
      // No inner quoted segments found — keep original node
      result.push(node)
    }
  }

  return result
}

/**
 * Find inner quoted sub-strings within a large string literal that contain
 * source language characters. Returns sub-segment nodes with precise positions.
 */
function extractInnerQuotedSegments(parent: ExtractedNode, sourcePattern: RegExp): ExtractedNode[] {
  const text = parent.text
  const segments: ExtractedNode[] = []

  // Determine which inner quote to search for based on the outer delimiter
  const firstChar = text[0]
  const regexes: RegExp[] = []

  if (firstChar === '"' || firstChar === '`') {
    // Outer is double-quote or backtick — look for single-quoted inner segments
    regexes.push(/'([^']+)'/g)
  } else if (firstChar === "'") {
    // Outer is single-quote — look for double-quoted inner segments
    regexes.push(/"([^"]+)"/g)
  } else {
    // Unknown delimiter (text blocks, etc.) — check both
    regexes.push(/'([^']+)'/g)
    regexes.push(/"([^"]+)"/g)
  }

  for (const regex of regexes) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const content = match[1]
      if (content.length < 2) continue
      if (!sourcePattern.test(content)) continue

      // +1 to skip the opening quote character
      const contentStart = match.index + 1
      const pos = charOffsetToPosition(parent, contentStart)
      const endPos = charOffsetToPosition(parent, contentStart + content.length)

      segments.push({
        lineStart: pos.line,
        colStart: pos.col,
        lineEnd: endPos.line,
        colEnd: endPos.col,
        nodeType: 'STRING_LITERAL',
        text: content
      })
    }
  }

  return segments
}

/**
 * Convert a character offset within a parent node's text to a file-level
 * (line, col) position. col is a UTF-8 byte offset (tree-sitter convention).
 */
function charOffsetToPosition(
  parent: ExtractedNode,
  charOffset: number
): { line: number; col: number } {
  const textBefore = parent.text.substring(0, charOffset)
  const lines = textBefore.split('\n')
  const lineOffset = lines.length - 1
  const lastLine = lines[lines.length - 1]
  const lastLineBytes = Buffer.byteLength(lastLine, 'utf-8')

  return {
    line: parent.lineStart + lineOffset,
    col: lineOffset === 0 ? parent.colStart + lastLineBytes : lastLineBytes
  }
}

// ---------- Default ignore patterns ----------

/**
 * Parse a newline-separated ignore patterns string into a Set.
 * Skips empty lines and lines starting with #.
 */
export function parseIgnorePatterns(raw: string): Set<string> {
  const patterns = new Set<string>()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      patterns.add(trimmed)
    }
  }
  return patterns
}

/**
 * Load ignore patterns from DB setting, then merge with .translatorignore file in workspace.
 */
function loadIgnorePatterns(workspacePath: string, dbPatterns?: string): Set<string> {
  const patterns = dbPatterns
    ? parseIgnorePatterns(dbPatterns)
    : new Set<string>([
        '.git',
        'node_modules',
        '.next',
        'dist',
        'out',
        'build',
        'target',
        '.gradle',
        '__pycache__',
        '.venv',
        'vendor',
        '.idea',
        '.vscode',
        '.DS_Store'
      ])

  // Also merge .translatorignore from workspace root if present
  const ignorePath = join(workspacePath, '.translatorignore')
  if (existsSync(ignorePath)) {
    const lines = readFileSync(ignorePath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.add(trimmed)
      }
    }
  }
  return patterns
}

/**
 * Recursively collect all supported files from a directory,
 * respecting ignore patterns from DB + .translatorignore.
 */
export function collectFiles(workspacePath: string, dbIgnorePatterns?: string): string[] {
  const ignorePatterns = loadIgnorePatterns(workspacePath, dbIgnorePatterns)
  const files: string[] = []

  function walk(dir: string): void {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (ignorePatterns.has(entry)) continue

      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase()
        if (isSupportedExtension(ext)) {
          files.push(relative(workspacePath, fullPath).replace(/\\/g, '/'))
        }
      }
    }
  }

  walk(workspacePath)
  return files
}

export interface CollectedFile {
  path: string
  supported: boolean
}

/**
 * Recursively collect ALL files from a directory (supported + unsupported),
 * respecting ignore patterns. Each file is tagged with whether its extension is supported.
 */
export function collectAllFiles(workspacePath: string, dbIgnorePatterns?: string): CollectedFile[] {
  const ignorePatterns = loadIgnorePatterns(workspacePath, dbIgnorePatterns)
  const files: CollectedFile[] = []

  function walk(dir: string): void {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (ignorePatterns.has(entry)) continue

      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase()
        files.push({
          path: relative(workspacePath, fullPath).replace(/\\/g, '/'),
          supported: isSupportedExtension(ext)
        })
      }
    }
  }

  walk(workspacePath)
  return files
}
