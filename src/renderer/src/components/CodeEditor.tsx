import { useRef, useEffect, useCallback, useState } from 'react'
import Editor, { DiffEditor, type OnMount, loader } from '@monaco-editor/react'
import type { DiffOnMount } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import { useAppStore } from '@/stores/app-store'

// Use local monaco-editor instead of CDN (CSP blocks CDN in Electron)
loader.config({ monaco: monacoEditor })

// Decoration style IDs
const COMMENT_UNTRANSLATED = 'sutura-comment-untranslated'
const STRING_UNTRANSLATED = 'sutura-string-untranslated'
const TRANSLATED = 'sutura-translated'

/**
 * Convert a byte offset (tree-sitter column) to a 1-based character column for Monaco.
 * Tree-sitter columns are UTF-8 byte offsets from the start of the line.
 * Monaco uses 1-based character indices.
 */
function byteColToCharCol(lineContent: string, byteCol: number): number {
  const encoder = new TextEncoder()
  let bytes = 0
  for (let i = 0; i < lineContent.length; i++) {
    if (bytes >= byteCol) return i + 1 // 1-based
    const charBytes = encoder.encode(lineContent[i]).length
    bytes += charBytes
  }
  return lineContent.length + 1
}

// Inject decoration CSS once
let stylesInjected = false
function injectDecorationStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .${COMMENT_UNTRANSLATED} { background-color: rgba(251, 146, 60, 0.12); }
    .${STRING_UNTRANSLATED} { background-color: rgba(192, 132, 252, 0.12); }
    .${TRANSLATED} { background-color: rgba(74, 222, 128, 0.08); }
    .sutura-gutter-orange { border-left: 2px solid #fb923c !important; }
    .sutura-gutter-purple { border-left: 2px solid #c084fc !important; }
    .sutura-gutter-green { border-left: 2px solid #4ade80 !important; }
  `
  document.head.appendChild(style)
}

// Monaco themes — register once
let themesRegistered = false
function registerThemes(mon: typeof monacoEditor): void {
  if (themesRegistered) return
  themesRegistered = true
  mon.editor.defineTheme('sutura-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#0a0a0a' }
  })
  mon.editor.defineTheme('sutura-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#ffffff' }
  })
}

type IStandaloneCodeEditor = monacoEditor.editor.IStandaloneCodeEditor

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    java: 'java',
    go: 'go',
    py: 'python',
    kt: 'kotlin',
    groovy: 'groovy',
    md: 'markdown',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    swift: 'swift',
    sh: 'shell',
    json: 'json',
    xml: 'xml',
    svg: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    vue: 'html',
    scss: 'scss',
    properties: 'ini'
  }
  return map[ext] || 'plaintext'
}

// ---------- Standard (Source) View ----------

function SourceView({
  isDark,
  fileId,
  filePath
}: {
  isDark: boolean
  fileId: number
  filePath: string
}) {
  const editorRef = useRef<IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)
  const decorationsRef = useRef<string[]>([])
  const [isReady, setIsReady] = useState(false)

  const translations = useAppStore((s) => s.activeFileTranslations)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const setActiveFileTranslations = useAppStore((s) => s.setActiveFileTranslations)
  const editorRefreshKey = useAppStore((s) => s.editorRefreshKey)

  // Clear stale translations when component mounts (file switch)
  useEffect(() => {
    setActiveFileTranslations([])
  }, [fileId, setActiveFileTranslations])

  const applyDecorations = useCallback(() => {
    const editor = editorRef.current
    const mon = monacoRef.current
    if (!editor || !mon) return

    if (!translations.length) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
      return
    }

    const model = editor.getModel()
    if (!model) return

    const lineCount = model.getLineCount()

    const newDecorations: monacoEditor.editor.IModelDeltaDecoration[] = translations.flatMap(
      (t) => {
        // Bounds check — skip decorations that reference lines beyond the model
        if (
          t.line_start < 1 ||
          t.line_start > lineCount ||
          t.line_end < 1 ||
          t.line_end > lineCount
        ) {
          return []
        }
        let className: string
        let glyphMarginClassName: string
        if (t.status === 'done') {
          className = TRANSLATED
          glyphMarginClassName = 'sutura-gutter-green'
        } else if (t.node_type === 'COMMENT') {
          className = COMMENT_UNTRANSLATED
          glyphMarginClassName = 'sutura-gutter-orange'
        } else {
          className = STRING_UNTRANSLATED
          glyphMarginClassName = 'sutura-gutter-purple'
        }

        // Compute decoration range from the text that's actually in the editor.
        // For 'done' (injected) translations, the file contains translated_text.
        // For pending/untranslated, it contains original_text.
        const rangeText =
          t.status === 'done' && t.translated_text ? t.translated_text : t.original_text

        const isMultiLine = rangeText.includes('\n')

        const startLineContent = model.getLineContent(t.line_start) || ''
        const startCol = byteColToCharCol(startLineContent, t.col_start)

        let endLine = t.line_start
        let endCol: number
        if (isMultiLine) {
          const textLines = rangeText.split('\n')
          endLine = t.line_start + textLines.length - 1
          const lastLineText = textLines[textLines.length - 1]
          endCol = lastLineText.length + 1
        } else {
          endCol = startCol + rangeText.length
        }

        return [
          {
            range: new mon.Range(t.line_start, startCol, endLine, endCol),
            options: {
              className,
              glyphMarginClassName,
              hoverMessage: {
                value: [
                  `#${t.id} - **${t.node_type}** — ${t.status}`,
                  '```',
                  t.original_text.substring(0, 200),
                  '```',
                  t.translated_text
                    ? `→ ${t.translated_text.substring(0, 200)}`
                    : '_Not yet translated_'
                ].join('\n')
              },
              minimap: {
                color:
                  t.status === 'done'
                    ? '#4ade80'
                    : t.node_type === 'COMMENT'
                      ? '#fb923c'
                      : '#c084fc',
                position: mon.editor.MinimapPosition.Inline
              },
              overviewRuler: {
                color:
                  t.status === 'done'
                    ? '#4ade80'
                    : t.node_type === 'COMMENT'
                      ? '#fb923c'
                      : '#c084fc',
                position: mon.editor.OverviewRulerLane.Center
              }
            }
          }
        ]
      }
    )

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations)
  }, [translations])

  // Load file content
  useEffect(() => {
    if (!fileId || !workspacePath || !isReady) return
    let cancelled = false

    async function loadFile() {
      const [content, trans] = await Promise.all([
        window.api.getFileContent(workspacePath!, filePath),
        window.api.getTranslations(fileId)
      ])
      if (cancelled) return
      setActiveFileTranslations(trans)

      const editor = editorRef.current
      const mon = monacoRef.current
      if (editor && mon && content !== null) {
        const model = editor.getModel()
        if (model) {
          mon.editor.setModelLanguage(model, getLanguageFromPath(filePath))
          model.setValue(content)
        }
      }
    }

    loadFile()
    return () => {
      cancelled = true
    }
  }, [fileId, workspacePath, filePath, setActiveFileTranslations, isReady, editorRefreshKey])

  useEffect(() => {
    if (isReady) applyDecorations()
  }, [applyDecorations, isReady])

  useEffect(() => {
    const mon = monacoRef.current
    if (mon) mon.editor.setTheme(isDark ? 'sutura-dark' : 'sutura-light')
  }, [isDark])

  const handleMount: OnMount = (editor, mon) => {
    editorRef.current = editor
    monacoRef.current = mon
    injectDecorationStyles()
    registerThemes(mon)
    mon.editor.setTheme(isDark ? 'sutura-dark' : 'sutura-light')
    setIsReady(true)
  }

  return (
    <Editor
      height="100%"
      defaultLanguage="plaintext"
      theme={isDark ? 'sutura-dark' : 'sutura-light'}
      onMount={handleMount}
      options={{
        readOnly: true,
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true },
        glyphMargin: true,
        padding: { top: 8 }
      }}
    />
  )
}

// ---------- Diff View ----------

function DiffView({
  isDark,
  filePath,
  originalContent,
  modifiedContent
}: {
  isDark: boolean
  filePath: string
  originalContent: string
  modifiedContent: string
}) {
  const diffRef = useRef<monacoEditor.editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    if (!diffRef.current) return
    registerThemes(monacoEditor)
    monacoEditor.editor.setTheme(isDark ? 'sutura-dark' : 'sutura-light')
  }, [isDark])

  const handleDiffMount: DiffOnMount = (editor) => {
    diffRef.current = editor
    injectDecorationStyles()
    registerThemes(monacoEditor)
    monacoEditor.editor.setTheme(isDark ? 'sutura-dark' : 'sutura-light')
  }

  const language = getLanguageFromPath(filePath)

  return (
    <DiffEditor
      height="100%"
      language={language}
      theme={isDark ? 'sutura-dark' : 'sutura-light'}
      original={originalContent}
      modified={modifiedContent}
      onMount={handleDiffMount}
      options={{
        readOnly: true,
        fontSize: 13,
        lineHeight: 20,
        renderSideBySide: true,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        diffWordWrap: 'on',
        minimap: { enabled: false },
        padding: { top: 8 }
      }}
    />
  )
}

// ---------- Hybrid Editor ----------

export function CodeEditor({ isDark = true }: { isDark?: boolean }) {
  const activeFileId = useAppStore((s) => s.activeFileId)
  const files = useAppStore((s) => s.files)
  const virtualBuffers = useAppStore((s) => s.virtualBuffers)
  const editorViewMode = useAppStore((s) => s.editorViewMode)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const [originalContent, setOriginalContent] = useState<string>('')

  const activeFile = files.find((f) => f.id === activeFileId)
  const virtualBuffer = activeFileId ? virtualBuffers.get(activeFileId) : undefined
  const hasModified = !!virtualBuffer

  // Show diff when mode is auto and it have a virtual buffer
  const showDiff = editorViewMode === 'auto' && hasModified

  // Load original content for diff view
  useEffect(() => {
    if (!showDiff || !activeFileId || !workspacePath || !activeFile) return
    let cancelled = false

    async function load() {
      const content = await window.api.getFileContent(workspacePath!, activeFile!.filePath)
      if (!cancelled && content !== null) setOriginalContent(content)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [showDiff, activeFileId, workspacePath, activeFile])

  if (!activeFile) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Select a file to view</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Choose a file from the sidebar</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      {showDiff ? (
        <DiffView
          key={`diff-${activeFile.id}`}
          isDark={isDark}
          filePath={activeFile.filePath}
          originalContent={originalContent}
          modifiedContent={virtualBuffer!}
        />
      ) : (
        <SourceView
          key={`source-${activeFile.id}`}
          isDark={isDark}
          fileId={activeFile.id}
          filePath={activeFile.filePath}
        />
      )}
    </div>
  )
}
