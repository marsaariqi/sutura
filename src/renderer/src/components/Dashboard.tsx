import { useCallback, useState } from 'react'
import { useAppStore, type FileStatus } from '@/stores/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  FolderOpen,
  ScanSearch,
  Play,
  Pause,
  Square,
  Download,
  Settings,
  Loader2,
  Zap,
  FileCheck,
  Sun,
  Moon,
  X,
  GitCompare,
  FileCode,
  Undo2,
  ListChecks,
  RotateCcw,
  ArchiveRestore,
  FileX2,
  Ban,
  Bug,
  Info,
  Warehouse,
  BookA
} from 'lucide-react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { FileTree } from '@/components/FileTree'
import { CodeEditor } from '@/components/CodeEditor'
import { HomeView } from '@/components/HomeView'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TranslationSummary } from '@/components/TranslationSummary'
import { OperationsCenter } from '@/components/OperationsCenter'
import { GlossaryPage } from '@/components/GlossaryPage'
import { AboutPage } from '@/components/AboutPage'

export function Dashboard() {
  const workspacePath = useAppStore((s) => s.workspacePath)
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath)
  const setFiles = useAppStore((s) => s.setFiles)
  const isScanning = useAppStore((s) => s.isScanning)
  const setIsScanning = useAppStore((s) => s.setIsScanning)
  const scanProgress = useAppStore((s) => s.scanProgress)
  const queueStatus = useAppStore((s) => s.queueStatus)
  const queueProgress = useAppStore((s) => s.queueProgress)
  const files = useAppStore((s) => s.files)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const activeFileId = useAppStore((s) => s.activeFileId)
  const setActiveFileId = useAppStore((s) => s.setActiveFileId)
  const selectedFileIds = useAppStore((s) => s.selectedFileIds)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const lastError = useAppStore((s) => s.lastError)
  const setLastError = useAppStore((s) => s.setLastError)
  const virtualBuffers = useAppStore((s) => s.virtualBuffers)
  const setVirtualBuffer = useAppStore((s) => s.setVirtualBuffer)
  const clearVirtualBuffer = useAppStore((s) => s.clearVirtualBuffer)
  const clearVirtualBufferBatch = useAppStore((s) => s.clearVirtualBufferBatch)
  const editorViewMode = useAppStore((s) => s.editorViewMode)
  const setEditorViewMode = useAppStore((s) => s.setEditorViewMode)
  const cooldownSeconds = useAppStore((s) => s.cooldownSeconds)
  const bumpSettingsVersion = useAppStore((s) => s.bumpSettingsVersion)
  const activeFileTranslations = useAppStore((s) => s.activeFileTranslations)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [confirmAction, setConfirmAction] = useState<
    'translate' | 'inject' | 'home' | 'revert' | 'retry' | null
  >(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  // navigation
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)

  // editor toolbar
  const activeFile = files.find((f) => f.id === activeFileId)
  const hasTranslatedSegments = activeFileTranslations.some(
    (t) => t.translated_text !== null && t.translated_text !== ''
  )
  const hasSegments = activeFileTranslations.length > 0

  const handleSelectWorkspace = useCallback(async () => {
    const path = await window.api.selectWorkspace()
    if (path) {
      // Stop running queue before switching workspace
      if (queueStatus === 'running' || queueStatus === 'paused') {
        await window.api.queueStop()
      }
      setWorkspacePath(path)
      // Auto-load file tree — prefer DB data if available, else list from FS
      try {
        const result = await window.api.loadWorkspace(path)
        if (result.success && result.files.length > 0) {
          setFiles(
            result.files.map((f) => ({
              id: f.id,
              filePath: f.file_path,
              status: f.status as FileStatus
            }))
          )
        }
      } catch {
        // Fail silently — files will load on scan
      } finally {
      }
    }
  }, [setWorkspacePath, setFiles, queueStatus])

  const handleScan = useCallback(async () => {
    if (!workspacePath) return
    setIsScanning(true)
    setActionLoading('scan')
    try {
      const result = await window.api.scanWorkspace(workspacePath)
      if (result.success) {
        const allFiles = await window.api.getAllFiles()
        setFiles(
          allFiles.map((f) => ({
            id: f.id,
            filePath: f.file_path,
            status: f.status as FileStatus
          }))
        )

        bumpSettingsVersion()
      }
    } finally {
      setIsScanning(false)
      setActionLoading(null)
    }
  }, [workspacePath, setIsScanning, setFiles, bumpSettingsVersion])

  const handleQueueStart = useCallback(async () => {
    setActionLoading('translate')
    setActiveFileId(null)
    try {
      if (selectedFileIds.size > 0) {
        await window.api.queueSelectedFiles(Array.from(selectedFileIds))
        // clearVirtualBufferBatch(Array.from(selectedFileIds))
        clearSelection()
      } else {
        await window.api.queueStart()
      }
    } finally {
      setActionLoading(null)
      // useAppStore.getState().bumpEditorRefreshKey()
    }
  }, [selectedFileIds, clearSelection])

  const handleQueuePause = useCallback(async () => {
    await window.api.queuePause()
  }, [])

  const handleQueueResume = useCallback(async () => {
    await window.api.queueResume()
  }, [])

  const handleQueueStop = useCallback(async () => {
    await window.api.queueStop()
  }, [])

  const handleInjectAll = useCallback(async () => {
    if (!workspacePath) return
    setActionLoading('inject')
    try {
      const fileIds = selectedFileIds.size > 0 ? Array.from(selectedFileIds) : undefined
      await window.api.injectAll(workspacePath, fileIds)
      if (selectedFileIds.size > 0) clearSelection()
      // Refresh file list
      clearVirtualBufferBatch(fileIds || files.map((f) => f.id))
      const allFiles = await window.api.getAllFiles()
      setFiles(
        allFiles.map((f) => ({
          id: f.id,
          filePath: f.file_path,
          status: f.status as FileStatus
        }))
      )

      bumpSettingsVersion()
    } finally {
      setActionLoading(null)
    }
  }, [
    workspacePath,
    selectedFileIds,
    clearSelection,
    clearVirtualBufferBatch,
    setFiles,
    bumpSettingsVersion,
    files
  ])

  const handleInjectFile = useCallback(async () => {
    if (!workspacePath || !activeFileId) return
    setActionLoading('inject-file')
    try {
      // Virtual injection: build modified content in memory, store in Zustand
      const result = await window.api.injectVirtual(workspacePath, activeFileId)
      if (result.success && result.content) {
        setVirtualBuffer(activeFileId, result.content)
        setEditorViewMode('auto') // Switch to diff view automatically
      } else if (result.success && !result.content) {
        setLastError('No translated segments to preview — translate the file first.')
      }
    } finally {
      setActionLoading(null)
    }
  }, [workspacePath, activeFileId, setVirtualBuffer, setEditorViewMode, setLastError])

  const handleInjectCommitFile = useCallback(async () => {
    if (!workspacePath || !activeFileId) return
    setActionLoading('inject-commit')
    try {
      const result = await window.api.injectFile(workspacePath, activeFileId)
      if (result.success) {
        clearVirtualBuffer(activeFileId)
        const allFiles = await window.api.getAllFiles()
        setFiles(
          allFiles.map((f) => ({
            id: f.id,
            filePath: f.file_path,
            status: f.status as FileStatus
          }))
        )
      }
    } finally {
      setActionLoading(null)
    }
  }, [workspacePath, activeFileId, clearVirtualBuffer, setFiles])

  const handleRetryFile = useCallback(async () => {
    if (!activeFileId) return
    setActionLoading('retry')
    try {
      const result = await window.api.retryTranslation(activeFileId)
      if (result.success) {
        clearVirtualBuffer(activeFileId)
        const allFiles = await window.api.getAllFiles()
        setFiles(
          allFiles.map((f) => ({
            id: f.id,
            filePath: f.file_path,
            status: f.status as FileStatus
          }))
        )
        // Refresh active file translations so editor decorations update immediately
        const trans = await window.api.getTranslations(activeFileId)
        useAppStore.getState().setActiveFileTranslations(trans)
        // Force editor to reload file content from disk
        useAppStore.getState().bumpEditorRefreshKey()
      }
    } finally {
      setActionLoading(null)
    }
  }, [activeFileId, clearVirtualBuffer, setFiles])

  const handleRevertSuture = useCallback(() => {
    if (!activeFileId) return
    clearVirtualBuffer(activeFileId)
  }, [activeFileId, clearVirtualBuffer])

  const handleRevertInjection = useCallback(async () => {
    if (!workspacePath || !activeFileId) return
    setActionLoading('revert-injection')
    try {
      const result = await window.api.revertInjection(workspacePath, activeFileId)
      if (result.success) {
        clearVirtualBuffer(activeFileId)
        const allFiles = await window.api.getAllFiles()
        setFiles(
          allFiles.map((f) => ({
            id: f.id,
            filePath: f.file_path,
            status: f.status as FileStatus
          }))
        )
        // Refresh active file translations so editor decorations update immediately
        const trans = await window.api.getTranslations(activeFileId)
        useAppStore.getState().setActiveFileTranslations(trans)
        // Force editor to reload file content from disk
        useAppStore.getState().bumpEditorRefreshKey()
      } else {
        setLastError(result.error || 'Failed to revert injection')
      }
    } finally {
      setActionLoading(null)
    }
  }, [workspacePath, activeFileId, clearVirtualBuffer, setFiles, setLastError])

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('light', !next)
      return next
    })
  }, [])

  const scanPercent =
    scanProgress.totalFiles > 0
      ? Math.round((scanProgress.scannedFiles / scanProgress.totalFiles) * 100)
      : 0

  const queuePercent =
    queueProgress.totalItems > 0
      ? Math.min(
          100,
          Math.round(
            ((queueProgress.completedItems + queueProgress.errorItems) / queueProgress.totalItems) *
              100
          )
        )
      : 0

  const isQueueActive = queueStatus === 'running' || queueStatus === 'paused'

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        {/* Top toolbar */}
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <h1
            className="text-xl font-mono font-semibold tracking-tight mr-2 cursor-pointer hover:text-primary transition-colors"
            onClick={() => {
              setActiveFileId(null)
              setActiveView('main')
            }}
          >
            Sutura
          </h1>

          {/* Home — back to landing page */}
          {workspacePath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setConfirmAction('home')}
                >
                  <Warehouse className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to recent workspace selector</TooltipContent>
            </Tooltip>
          )}

          <Separator orientation="vertical" className="h-5" />

          {/* Workspace button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={handleSelectWorkspace}>
                <FolderOpen className="mr-1.5 h-4 w-4" />
                {workspacePath ? workspacePath.split(/[\\/]/).pop() : 'Open Workspace'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{workspacePath || 'Select a workspace folder'}</TooltipContent>
          </Tooltip>

          {/* Scan button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={!workspacePath || isScanning}
                onClick={handleScan}
              >
                {isScanning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="mr-1.5 h-4 w-4" />
                )}
                Scan
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scan workspace for translatable strings</TooltipContent>
          </Tooltip>

          {/* Ignore Patterns */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setSettingsOpen(true, 'ignore')}
              >
                <FileX2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit ignore patterns</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5" />

          {/* Translation controls */}
          {!isQueueActive ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  disabled={files.length === 0 || actionLoading === 'translate'}
                  onClick={() => {
                    if (selectedFileIds.size > 0) {
                      handleQueueStart()
                    } else {
                      setConfirmAction('translate')
                    }
                  }}
                  variant={selectedFileIds.size > 0 ? 'default' : 'outline'}
                >
                  {actionLoading === 'translate' ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-4 w-4" />
                  )}
                  {selectedFileIds.size > 0
                    ? `Translate ${selectedFileIds.size} file${selectedFileIds.size > 1 ? 's' : ''}`
                    : 'Translate All'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedFileIds.size > 0
                  ? `Translate ${selectedFileIds.size} selected file${selectedFileIds.size > 1 ? 's' : ''}`
                  : 'Translate all pending segments'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              {queueStatus === 'paused' ? (
                <Button size="sm" variant="outline" onClick={handleQueueResume}>
                  <Play className="mr-1.5 h-4 w-4" />
                  Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handleQueuePause}>
                  <Pause className="mr-1.5 h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={handleQueueStop}>
                <Square className="mr-1.5 h-4 w-4" />
                Stop
              </Button>
            </>
          )}

          {/* Inject & Commit All (or selected) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={selectedFileIds.size > 0 ? 'default' : 'outline'}
                disabled={
                  !workspacePath ||
                  files.length === 0 ||
                  actionLoading === 'inject' ||
                  (selectedFileIds.size > 0
                    ? !files.some((f) => selectedFileIds.has(f.id) && f.status === 'translated')
                    : !files.some((f) => f.status === 'translated'))
                }
                onClick={() => setConfirmAction('inject')}
              >
                {actionLoading === 'inject' ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                {selectedFileIds.size > 0
                  ? `Inject & Commit ${selectedFileIds.size} file${selectedFileIds.size > 1 ? 's' : ''}`
                  : 'Inject & Commit All'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {selectedFileIds.size > 0
                ? `Inject & commit ${selectedFileIds.size} selected file${selectedFileIds.size > 1 ? 's' : ''}`
                : 'Write all translations back to files on disk'}
            </TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={handleToggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isDark ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>

          {/* Glossary */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={activeView === 'glossary' ? 'default' : 'ghost'}
                onClick={() => {
                  setActiveView(activeView === 'glossary' ? 'main' : 'glossary')
                }}
              >
                <BookA className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Glossary</TooltipContent>
          </Tooltip>

          {/* Operations Center */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={activeView === 'operations' ? 'default' : 'ghost'}
                onClick={() => {
                  // setActiveFileId(null)
                  setActiveView(activeView === 'operations' ? 'main' : 'operations')
                  // if (activeView == 'operations') {
                  //   setActiveFileId(null)
                  // }
                }}
              >
                <Bug className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Operations Center</TooltipContent>
          </Tooltip>

          {/* About / Technical */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={activeView === 'about' ? 'default' : 'ghost'}
                onClick={() => {
                  // setActiveFileId(null)
                  setActiveView(activeView === 'about' ? 'main' : 'about')
                }}
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>How Sutura Works</TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </header>

        {/* Progress bars */}
        {(isScanning || isQueueActive || cooldownSeconds > 0) && (
          <div className="border-b px-4 py-2 space-y-1">
            {isScanning && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12">Scan</span>
                <Progress value={scanPercent} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-24 text-right">
                  {scanProgress.scannedFiles}/{scanProgress.totalFiles}
                </span>
              </div>
            )}
            {isQueueActive && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12">
                  {queueStatus === 'paused' ? 'Paused' : 'AI'}
                </span>
                <Progress value={queuePercent} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-24 text-right">
                  {queueProgress.completedItems}/{queueProgress.totalItems}
                  {queueProgress.errorItems > 0 && (
                    <span className="text-destructive ml-1">({queueProgress.errorItems} err)</span>
                  )}
                </span>
              </div>
            )}
            {cooldownSeconds > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-orange-400 w-12">Cool</span>
                <Progress value={((3 - cooldownSeconds) / 3) * 100} className="flex-1 h-2" />
                <span className="text-xs text-orange-400 w-24 text-right">
                  {cooldownSeconds}s remaining
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {lastError && (
          <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-1.5">
            <span className="text-xs text-destructive flex-1 truncate">{lastError}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0"
              onClick={() => setLastError(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Main content — resizable panels */}
        <div className="flex flex-1 overflow-hidden">
          <PanelGroup orientation="horizontal">
            {/* Sidebar — File Tree */}
            <Panel defaultSize="20%" minSize="12%" maxSize="40%">
              <aside className="h-full overflow-hidden border-r">
                <FileTree />
              </aside>
            </Panel>

            <PanelResizeHandle />

            {/* Editor / Home / Operations / About area */}
            <Panel>
              <main className="h-full overflow-hidden flex flex-col">
                {activeView === 'operations' ? (
                  <OperationsCenter />
                ) : activeView === 'about' ? (
                  <AboutPage />
                ) : activeView === 'glossary' ? (
                  <GlossaryPage />
                ) : (
                  <>
                    {activeFileId &&
                      (() => {
                        const activeStatus = activeFile?.status
                        const isUnsupported = activeStatus === 'unsupported'
                        const isDone = activeStatus === 'done'
                        const hasVirtualBuffer = virtualBuffers.has(activeFileId)
                        return (
                          <div className="flex items-center gap-1.5 border-b px-3 py-1.5 shrink-0">
                            <span className="text-xs text-muted-foreground truncate flex-1">
                              {activeFile?.filePath}
                              {isUnsupported && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-[10px] text-zinc-500 border-zinc-500/30"
                                >
                                  Unsupported
                                </Badge>
                              )}
                            </span>

                            {!isUnsupported && (
                              <>
                                {/* Inject & Commit (direct to disk) — only in diff view, not for done files */}
                                {!isDone && hasVirtualBuffer && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="default"
                                        className="h-6 text-xs px-2"
                                        disabled={
                                          actionLoading === 'inject-commit' ||
                                          actionLoading === 'inject-file'
                                        }
                                        onClick={handleInjectCommitFile}
                                      >
                                        {actionLoading === 'inject-commit' ? (
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        ) : (
                                          <Download className="mr-1 h-3 w-3" />
                                        )}
                                        Inject &amp; Commit
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Inject translations and write to disk immediately
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {!isDone && hasVirtualBuffer && (
                                  <Separator orientation="vertical" className="h-4" />
                                )}

                                {/* Preview injection (virtual) — hide when already in diff view or for done files */}
                                {!isDone && !hasVirtualBuffer && hasTranslatedSegments && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-xs px-2"
                                        disabled={actionLoading === 'inject-file'}
                                        onClick={handleInjectFile}
                                      >
                                        {actionLoading === 'inject-file' ? (
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        ) : (
                                          <FileCheck className="mr-1 h-3 w-3" />
                                        )}
                                        Preview
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Preview injection (virtual diff)
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {/* View mode toggle + Commit/Revert — only when virtual buffer exists */}
                                {hasVirtualBuffer && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant={
                                            editorViewMode === 'source' ? 'default' : 'ghost'
                                          }
                                          className="h-6 w-6"
                                          onClick={() =>
                                            setEditorViewMode(
                                              editorViewMode === 'source' ? 'auto' : 'source'
                                            )
                                          }
                                        >
                                          {editorViewMode === 'source' ? (
                                            <FileCode className="h-3.5 w-3.5" />
                                          ) : (
                                            <GitCompare className="h-3.5 w-3.5" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {editorViewMode === 'source'
                                          ? 'Switch to Diff view'
                                          : 'Switch to Source view'}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-orange-400 hover:text-orange-300"
                                          onClick={handleRevertSuture}
                                        >
                                          <Undo2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Revert — discard virtual injection
                                      </TooltipContent>
                                    </Tooltip>
                                  </>
                                )}

                                {hasSegments && (
                                  <Separator orientation="vertical" className="h-4" />
                                )}

                                {/* Summary */}
                                {hasSegments && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 w-fit px-2 text-xs"
                                        onClick={() => setSummaryOpen(true)}
                                      >
                                        <ListChecks className="h-3.5 w-3.5" />
                                        <span>Summary</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Translation summary</TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Retry — only for non-done files (revert first, then retry) */}
                                {!isDone && hasTranslatedSegments && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6"
                                        disabled={actionLoading === 'retry'}
                                        onClick={() => setConfirmAction('retry')}
                                      >
                                        {actionLoading === 'retry' ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <RotateCcw className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Retry — reset translations to pending and re-translate
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Revert Injection — only for committed (done) files */}
                                {isDone && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-red-400 hover:text-red-300"
                                        disabled={actionLoading === 'revert-injection'}
                                        onClick={() => setConfirmAction('revert')}
                                      >
                                        {actionLoading === 'revert-injection' ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <ArchiveRestore className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Revert injection — restore original file from backup
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </>
                            )}

                            <Separator orientation="vertical" className="h-4" />

                            {/* Close file */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => setActiveFileId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Close file &amp; return to dashboard</TooltipContent>
                            </Tooltip>
                          </div>
                        )
                      })()}
                    <div className="flex-1 overflow-hidden">
                      {activeFileId ? (
                        (() => {
                          const file = files.find((f) => f.id === activeFileId)
                          if (file?.status === 'unsupported') {
                            return (
                              <div className="flex h-full items-center justify-center">
                                <div className="text-center space-y-2">
                                  <Ban className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                                  <p className="text-sm font-medium text-muted-foreground">
                                    Unsupported file type
                                  </p>
                                  <p className="text-xs text-muted-foreground/60 max-w-xs">
                                    This file cannot be scanned or edited. Sutura supports source
                                    code, markup, and config files only.
                                  </p>
                                </div>
                              </div>
                            )
                          }
                          return <CodeEditor isDark={isDark} />
                        })()
                      ) : (
                        <HomeView />
                      )}
                    </div>
                  </>
                )}
              </main>
            </Panel>
          </PanelGroup>
        </div>

        {/* Status bar */}
        <footer className="flex items-center gap-4 border-t px-4 py-1 text-xs text-muted-foreground">
          <span>{files.length} files</span>
          {queueStatus !== 'idle' && (
            <span>
              Queue: {queueStatus} — {queueProgress.completedItems} done
              {queueProgress.errorItems > 0 && `, ${queueProgress.errorItems} errors`}
            </span>
          )}
          <div className="flex-1" />
          {workspacePath && <span className="truncate max-w-75">{workspacePath}</span>}
        </footer>

        <SettingsDialog />
        {activeFileId && (
          <TranslationSummary
            open={summaryOpen}
            onOpenChange={setSummaryOpen}
            fileId={activeFileId}
            fileStatus={files.find((f) => f.id === activeFileId)?.status || 'pending'}
          />
        )}

        {/* Confirmation Modal */}
        <AlertDialog
          open={confirmAction !== null}
          onOpenChange={(open) => !open && setConfirmAction(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction === 'translate'
                  ? 'Translate All Segments?'
                  : confirmAction === 'home'
                    ? 'Return to Workspace Selector?'
                    : confirmAction === 'revert'
                      ? 'Revert Injection?'
                      : confirmAction === 'retry'
                        ? 'Retry Translation?' // New Title
                        : selectedFileIds.size > 0
                          ? `Inject & Commit ${selectedFileIds.size} File${selectedFileIds.size > 1 ? 's' : ''}?`
                          : 'Inject & Commit All Files?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction === 'translate'
                  ? 'This will send all pending segments to the AI provider for translation. API usage costs may apply.'
                  : confirmAction === 'home'
                    ? 'This will close the current workspace and reset the file tree. Any unsaved virtual injections will be discarded.'
                    : confirmAction === 'revert'
                      ? 'This will restore the original file from backup, undoing all injected translations. The file will return to its pre-translation state.'
                      : confirmAction === 'retry'
                        ? 'This will delete the stored translations for this file and reset all segments to pending. You will need to run the translator again.'
                        : selectedFileIds.size > 0
                          ? `This will write translations for ${selectedFileIds.size} selected file${selectedFileIds.size > 1 ? 's' : ''} back to disk. This action cannot be undone.`
                          : 'This will write all translated segments back to the original files on disk. This action cannot be undone.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  confirmAction === 'retry'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ''
                }
                onClick={() => {
                  if (confirmAction === 'translate') {
                    handleQueueStart()
                  } else if (confirmAction === 'inject') {
                    handleInjectAll()
                  } else if (confirmAction === 'revert') {
                    handleRevertInjection()
                  } else if (confirmAction === 'retry') {
                    handleRetryFile()
                  } else if (confirmAction === 'home') {
                    if (queueStatus === 'running' || queueStatus === 'paused') {
                      window.api.queueStop()
                    }
                    setActiveFileId(null)
                    setWorkspacePath(null)
                  }
                  setConfirmAction(null)
                }}
              >
                {confirmAction === 'translate'
                  ? 'Translate All'
                  : confirmAction === 'home'
                    ? 'Leave Workspace'
                    : confirmAction === 'revert'
                      ? 'Revert'
                      : confirmAction === 'retry'
                        ? 'Reset & Retry' // New Action Label
                        : selectedFileIds.size > 0
                          ? `Inject & Commit ${selectedFileIds.size}`
                          : 'Inject & Commit All'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
