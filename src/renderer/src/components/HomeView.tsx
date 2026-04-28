import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore, type FileStatus } from '@/stores/app-store'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import {
  Activity,
  FileCode,
  FolderOpen,
  Globe,
  Languages,
  TrendingUp,
  X,
  Clock,
  Zap,
  Play,
  Pause,
  Square,
  Shield,
  Loader2,
  CheckCircle2,
  Cpu,
  ArrowUpDown,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

interface TranslationStats {
  total: number
  pending: number
  done: number
  error: number
  excluded: number
}

interface NodeTypeStats {
  comments: number
  strings: number
}

interface FileStats {
  total: number
  intact: number
  scanned: number
  translating: number
  translated: number
  done: number
  error: number
  pending: number
  unsupported: number
}

interface RecentWorkspace {
  id: number
  path: string
  name: string
  last_opened: string
  file_count: number
  intact_count: number
  translated_count: number
}

const DONUT_COLORS = ['#4ade80', '#fb923c', '#ef4444']
const BAR_COLORS = ['#fb923c', '#c084fc']
const PROVIDER_COLORS = ['#60a5fa', '#f472b6', '#a78bfa', '#34d399']

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'var(--color-card-foreground)'
  },
  itemStyle: { color: 'var(--color-card-foreground)' },
  labelStyle: { color: 'var(--color-card-foreground)' }
}

export function HomeView() {
  const workspacePath = useAppStore((s) => s.workspacePath)
  const files = useAppStore((s) => s.files)
  const setWorkspacePath = useAppStore((s) => s.setWorkspacePath)
  const setFiles = useAppStore((s) => s.setFiles)
  const queueProgress = useAppStore((s) => s.queueProgress)
  const queueStatus = useAppStore((s) => s.queueStatus)
  const cooldownSeconds = useAppStore((s) => s.cooldownSeconds)
  const selectedFileIds = useAppStore((s) => s.selectedFileIds)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const settingsVersion = useAppStore((s) => s.settingsVersion)
  // const translationScope = useAppStore((s) => s.translationScope)

  // const SCOPE_INFO: Record<
  //   'all' | 'comment' | 'string_literal',
  //   { label: string; subtitle: string; description: string }
  // > = {
  //   all: {
  //     label: 'All',
  //     subtitle: 'Comments + String Literals',
  //     description: 'Translate both comments and user-facing string literals.'
  //   },
  //   comment: {
  //     label: 'Comments Only',
  //     subtitle: 'Comments',
  //     description: 'Translate code comments for technical clarity; keep strings unchanged.'
  //   },
  //   string_literal: {
  //     label: 'String Literals Only',
  //     subtitle: 'Strings',
  //     description: 'Translate user-facing string literals; preserve comments and code.'
  //   }
  // }

  // const currentScope = SCOPE_INFO[translationScope || 'all']

  const [stats, setStats] = useState<TranslationStats>({
    total: 0,
    pending: 0,
    done: 0,
    error: 0,
    excluded: 0
  })
  const [nodeStats, setNodeStats] = useState<NodeTypeStats>({ comments: 0, strings: 0 })
  const [fileStats, setFileStats] = useState<FileStats>({
    total: 0,
    intact: 0,
    scanned: 0,
    translating: 0,
    translated: 0,
    done: 0,
    error: 0,
    pending: 0,
    unsupported: 0
  })
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [showTranslateConfirm, setShowTranslateConfirm] = useState(false)
  const [usageScope, setUsageScope] = useState<'local' | 'global'>('local')
  const [providerInfo, setProviderInfo] = useState<{
    provider: string
    model: string
    hasKey: boolean
  } | null>(null)
  const [usageSummary, setUsageSummary] = useState<{
    totalInput: number
    totalOutput: number
    totalTokens: number
    totalBatches: number
    byProvider: {
      provider: string
      model: string
      inputTokens: number
      outputTokens: number
      totalTokens: number
      batchCount: number
    }[]
  } | null>(null)
  const [localUsage, setLocalUsage] = useState<{
    totalInput: number
    totalOutput: number
    totalTokens: number
    totalBatches: number
    byProvider: {
      provider: string
      model: string
      inputTokens: number
      outputTokens: number
      totalTokens: number
      batchCount: number
    }[]
  } | null>(null)

  // Segment file tracing
  const [expandedSegmentStatus, setExpandedSegmentStatus] = useState<
    'error' | 'excluded' | 'pending' | 'done' | null
  >(null)
  const [segmentFiles, setSegmentFiles] = useState<
    { fileId: number; filePath: string; count: number }[]
  >([])
  const [segmentDisplayCount, setSegmentDisplayCount] = useState(100)

  // File tracing
  const [expandedFileStatus, setExpandedFileStatus] = useState<
    'translated' | 'done' | 'intact' | 'awaiting' | 'unsupported' | null
  >(null)
  const [fileDisplayCount, setFileDisplayCount] = useState(100)

  const setActiveFileId = useAppStore((s) => s.setActiveFileId)

  const toggleSegmentFiles = useCallback(
    async (status: 'error' | 'excluded' | 'pending' | 'done') => {
      if (expandedSegmentStatus === status) {
        setExpandedSegmentStatus(null)
        setSegmentFiles([])
        return
      }
      setExpandedSegmentStatus(status)
      setSegmentDisplayCount(100)
      try {
        const files = await window.api.getFilesWithSegmentStatus(status)
        setSegmentFiles(files)
      } catch {
        setSegmentFiles([])
      }
    },
    [expandedSegmentStatus]
  )

  const toggleFileStatus = useCallback(
    (status: 'translated' | 'done' | 'intact' | 'awaiting' | 'unsupported') => {
      if (expandedFileStatus === status) {
        setExpandedFileStatus(null)
      } else {
        setExpandedFileStatus(status)
        setFileDisplayCount(100)
      }
    },
    [expandedFileStatus]
  )

  const filteredFiles = useMemo(() => {
    if (!expandedFileStatus) return []
    if (expandedFileStatus === 'awaiting') {
      return files.filter((f) => f.status === 'scanned' || f.status === 'translating')
    }
    return files.filter((f) => f.status === expandedFileStatus)
  }, [files, expandedFileStatus])

  // Load recent workspaces on mount
  useEffect(() => {
    async function loadRecent() {
      try {
        const recent = await window.api.getRecentWorkspaces()
        setRecentWorkspaces(recent)
      } catch {
        // ignore
      }
    }
    loadRecent()
  }, [workspacePath])

  // Reset local stats immediately when workspace changes to avoid showing stale data
  useEffect(() => {
    setStats({ total: 0, pending: 0, done: 0, error: 0, excluded: 0 })
    setNodeStats({ comments: 0, strings: 0 })
    setFileStats({
      total: 0,
      intact: 0,
      scanned: 0,
      translating: 0,
      translated: 0,
      done: 0,
      error: 0,
      pending: 0,
      unsupported: 0
    })
    setUsageSummary(null)
    setLocalUsage(null)
  }, [workspacePath])

  // Always reload provider info when workspace or settings change
  useEffect(() => {
    window.api
      .getProviderInfo()
      .then(setProviderInfo)
      .catch(() => {})
  }, [workspacePath, settingsVersion])

  useEffect(() => {
    if (!workspacePath || files.length === 0) return

    async function loadStats() {
      try {
        const [s, ns, fs, usage, pInfo] = await Promise.all([
          window.api.getTranslationStats(),
          window.api.getNodeTypeStats(),
          window.api.getFileStats(),
          window.api.getUsageSummary(),
          window.api.getProviderInfo()
        ])
        setStats(s)
        setNodeStats(ns)
        setFileStats(fs)
        setUsageSummary(usage)
        setProviderInfo(pInfo)
      } catch {
        // stats endpoints may not exist yet
      }

      // Load local usage separately so it doesn't block other stats
      try {
        const localU = await window.api.getUsageSummaryLocal()
        setLocalUsage(localU)
      } catch {
        // ignore — may not be available yet
      }
    }

    loadStats()
  }, [
    workspacePath,
    files.length,
    queueProgress.completedItems,
    queueProgress.errorItems,
    queueStatus,
    settingsVersion
  ])

  const donutData = [
    { name: 'Translated', value: stats.done },
    { name: 'Untranslated', value: stats.pending },
    { name: 'Errors', value: stats.error }
  ].filter((d) => d.value > 0)

  const barData = [
    { name: 'Comments', count: nodeStats.comments, fill: BAR_COLORS[0] },
    { name: 'String Literals', count: nodeStats.strings, fill: BAR_COLORS[1] }
  ]

  const progressPercent = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  // 1. Do it actually have files in the store?
  const hasFiles = files.length > 0

  // 2. Has the database actually processed any segments yet?
  const hasSegments = stats.total > 0

  // 3. SPECIAL CASE: Files exist, but none have been scanned for segments
  const isPendingInitialScan = hasFiles && !hasSegments && fileStats.scanned === 0

  const isQueueActive = queueStatus === 'running' || queueStatus === 'paused'

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

  const handleQueueStart = useCallback(async () => {
    setActionLoading(true)
    try {
      if (selectedFileIds.size > 0) {
        await window.api.queueSelectedFiles(Array.from(selectedFileIds))
        clearSelection()
      } else {
        await window.api.queueStart()
      }
    } finally {
      setActionLoading(false)
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

  const handleOpenRecent = async (path: string) => {
    setWorkspacePath(path)
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
      // ignore
    }
  }

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    await window.api.removeRecentWorkspace(path)
    setRecentWorkspaces((prev) => prev.filter((w) => w.path !== path))
  }

  return (
    <div
      className={`flex h-full flex-col items-center ${hasSegments ? 'overflow-auto p-8 justify-start' : 'overflow-hidden'}`}
    >
      {!workspacePath ? (
        <div className="w-full max-w-2xl flex flex-col h-full overflow-hidden">
          <div className="text-center space-y-3 shrink-0 pt-8 pb-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <Languages className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Welcome to Sutura</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Open a workspace folder and scan it to begin translating comments and strings across
              your codebase.
            </p>
          </div>

          {/* Recent Workspaces */}
          {recentWorkspaces.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col px-8 pb-8">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 shrink-0 mb-3">
                <Clock className="h-4 w-4" />
                Recent Workspaces
              </h3>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {recentWorkspaces.map((ws) => (
                  <button
                    key={ws.id}
                    className="group w-full flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                    onClick={() => handleOpenRecent(ws.path)}
                  >
                    <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ws.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ws.path}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{ws.file_count} files</p>
                      <div className="flex items-center gap-2 text-xs">
                        {ws.intact_count > 0 && (
                          <span className="text-zinc-400">{ws.intact_count} intact</span>
                        )}
                        {ws.translated_count > 0 && (
                          <span className="text-green-400">{ws.translated_count} done</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 transition-opacity shrink-0"
                      onClick={(e) => handleRemoveRecent(e, ws.path)}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : !hasFiles ? (
        /* CASE 1: Brand new workspace, no files found at all */
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Workspace is empty</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              We couldn't find any supported source files in this directory.
            </p>
          </div>
        </div>
      ) : isPendingInitialScan ? (
        /* CASE 2: Files found, but total segments is 0 (Needs Scan) */
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Zap className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Ready to Scan</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                We found <span className="text-foreground font-medium">{files.length} files</span>.
                Click <span className="font-bold text-foreground">Scan</span> in the toolbar to
                identify comments and strings for translation.
              </p>
            </div>
            {/* Optional: Add a big Scan button here too */}
          </div>
        </div>
      ) : !hasSegments ? (
        /* CASE 3: Scanned, but actually found 0 segments (Empty code files) */
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <EyeOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No translatable segments</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              The scanned files contain no comments or string literals that require translation.
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-5xl font-semibold font-mono tracking-tight select-none ">Sutura</h2>
            <p className="text-sm text-muted-foreground">
              {files.length} files &middot; {stats.total} segments &middot; {progressPercent}%
              complete
            </p>
            {/* placeholder test666 */}
            {providerInfo && (
              <p
                className={`text-sm font-medium font-mono capitalize select-none flex items-center justify-center ${providerInfo.hasKey ? 'text-green-500' : 'text-red-500'}`}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                {providerInfo.provider}
              </p>
            )}
            {/* {translationScope && (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mt-2">
                <Filter className="h-4 w-4" />
                <span className="font-mono font-medium uppercase">{currentScope.subtitle}</span>
              </p>
            )} */}
          </div>

          {/* Progress + Queue Controls */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Translation Progress</h3>
              <div className="flex items-center gap-2">
                {!isQueueActive ? (
                  <Button
                    size="sm"
                    disabled={files.length === 0 || actionLoading}
                    onClick={() => {
                      if (selectedFileIds.size > 0) {
                        handleQueueStart()
                      } else {
                        setShowTranslateConfirm(true)
                      }
                    }}
                  >
                    {actionLoading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {selectedFileIds.size > 0
                      ? `Translate ${selectedFileIds.size} files`
                      : 'Translate All'}
                  </Button>
                ) : (
                  <>
                    {queueStatus === 'paused' ? (
                      <Button size="sm" variant="outline" onClick={handleQueueResume}>
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Resume
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={handleQueuePause}>
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                        Pause
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={handleQueueStop}>
                      <Square className="mr-1.5 h-3.5 w-3.5" />
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">Segments</span>
                <Progress value={progressPercent} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">
                  {stats.done}/{stats.total}
                </span>
              </div>
              {isQueueActive && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">
                    {queueStatus === 'paused' ? 'Paused' : 'Queue'}
                  </span>
                  <Progress value={queuePercent} className="flex-1 h-2" />
                  <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">
                    {queueProgress.completedItems}/{queueProgress.totalItems}
                  </span>
                </div>
              )}
              {cooldownSeconds > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-orange-400 w-16">Cooldown</span>
                  <Progress value={((3 - cooldownSeconds) / 3) * 100} className="flex-1 h-2" />
                  <span className="text-xs text-orange-400 w-20 text-right tabular-nums">
                    {cooldownSeconds}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stat cards — Segments */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              Segments
            </h3>
            <div className="grid grid-cols-5 gap-4">
              <StatCard label="Total" value={stats.total} icon={<Activity className="h-4 w-4" />} />
              <StatCard
                label="Translated"
                value={stats.done}
                icon={<TrendingUp className="h-4 w-4 text-green-400" />}
                color="text-green-400"
                onClick={stats.done > 0 ? () => toggleSegmentFiles('done') : undefined}
                active={expandedSegmentStatus === 'done'}
              />
              <StatCard
                label="Pending"
                value={stats.pending}
                icon={<Languages className="h-4 w-4 text-orange-400" />}
                color="text-orange-400"
                onClick={stats.pending > 0 ? () => toggleSegmentFiles('pending') : undefined}
                active={expandedSegmentStatus === 'pending'}
              />
              <StatCard
                label="Errors"
                value={stats.error}
                icon={<FileCode className="h-4 w-4 text-red-400" />}
                color="text-red-400"
                onClick={stats.error > 0 ? () => toggleSegmentFiles('error') : undefined}
                active={expandedSegmentStatus === 'error'}
              />
              <StatCard
                label="Excluded"
                value={stats.excluded}
                icon={<EyeOff className="h-4 w-4 text-zinc-400" />}
                color="text-zinc-400"
                onClick={stats.excluded > 0 ? () => toggleSegmentFiles('excluded') : undefined}
                active={expandedSegmentStatus === 'excluded'}
              />
            </div>

            {/* Expandable file list for segments */}
            {expandedSegmentStatus && segmentFiles.length > 0 && (
              <div className="mt-3 rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                  {expandedSegmentStatus === 'error' ? (
                    <FileCode className="h-3.5 w-3.5 text-red-400" />
                  ) : expandedSegmentStatus === 'excluded' ? (
                    <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
                  ) : expandedSegmentStatus === 'done' ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Languages className="h-3.5 w-3.5 text-orange-400" />
                  )}
                  <span className="text-xs font-medium">
                    Files with {expandedSegmentStatus} segments
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {segmentFiles.length} {segmentFiles.length === 1 ? 'file' : 'files'}
                  </span>
                </div>
                <div className="max-h-50 overflow-y-auto">
                  {segmentFiles.slice(0, segmentDisplayCount).map((f) => (
                    <button
                      key={f.fileId}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/50 transition-colors border-b last:border-b-0 cursor-pointer"
                      onClick={() => setActiveFileId(f.fileId)}
                    >
                      <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-mono text-foreground truncate flex-1">
                        {f.filePath}
                      </span>
                      <span
                        className={`text-[10px] font-mono tabular-nums shrink-0 ${expandedSegmentStatus === 'error' ? 'text-red-400' : expandedSegmentStatus === 'excluded' ? 'text-zinc-400' : expandedSegmentStatus === 'done' ? 'text-green-400' : 'text-orange-400'}`}
                      >
                        {f.count}
                      </span>
                    </button>
                  ))}
                  {segmentFiles.length > segmentDisplayCount && (
                    <button
                      className="w-full px-3 py-2 text-[10px] text-muted-foreground text-center hover:bg-accent/50 transition-colors bg-muted/10 cursor-pointer font-medium"
                      onClick={() => setSegmentDisplayCount((prev) => prev + 100)}
                    >
                      View {Math.min(100, segmentFiles.length - segmentDisplayCount)} more (
                      {segmentFiles.length - segmentDisplayCount} remaining)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stat cards — Files */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              Files
            </h3>
            <div className="grid grid-cols-6 gap-3">
              <StatCard
                label="Total"
                value={fileStats.total}
                icon={<FileCode className="h-4 w-4" />}
              />
              <StatCard
                label="Translated"
                value={fileStats.translated}
                icon={<Languages className="h-4 w-4 text-blue-400" />}
                color="text-blue-400"
                onClick={
                  fileStats.translated > 0 ? () => toggleFileStatus('translated') : undefined
                }
                active={expandedFileStatus === 'translated'}
              />
              <StatCard
                label="Sutured"
                value={fileStats.done}
                icon={<CheckCircle2 className="h-4 w-4 text-green-400" />}
                color="text-green-400"
                onClick={fileStats.done > 0 ? () => toggleFileStatus('done') : undefined}
                active={expandedFileStatus === 'done'}
              />
              <StatCard
                label="Intact"
                value={fileStats.intact}
                icon={<Shield className="h-4 w-4 text-zinc-400" />}
                color="text-zinc-400"
                onClick={fileStats.intact > 0 ? () => toggleFileStatus('intact') : undefined}
                active={expandedFileStatus === 'intact'}
              />
              <StatCard
                label="Awaiting"
                value={fileStats.scanned + fileStats.translating}
                icon={<Activity className="h-4 w-4 text-orange-400" />}
                color="text-orange-400"
                onClick={
                  fileStats.scanned + fileStats.translating > 0
                    ? () => toggleFileStatus('awaiting')
                    : undefined
                }
                active={expandedFileStatus === 'awaiting'}
              />
              <StatCard
                label="Unsupported"
                value={fileStats.unsupported}
                icon="" //{<X className="h-4 w-4 text-red-400" />}
                color="text-red-400"
                onClick={
                  fileStats.unsupported > 0 ? () => toggleFileStatus('unsupported') : undefined
                }
                active={expandedFileStatus === 'unsupported'}
              />
            </div>

            {/* Expandable file list for files */}
            {expandedFileStatus && filteredFiles.length > 0 && (
              <div className="mt-3 rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                  {expandedFileStatus === 'translated' ? (
                    <Languages className="h-3.5 w-3.5 text-blue-400" />
                  ) : expandedFileStatus === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  ) : expandedFileStatus === 'intact' ? (
                    <Shield className="h-3.5 w-3.5 text-zinc-400" />
                  ) : expandedFileStatus === 'unsupported' ? (
                    <X className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Activity className="h-3.5 w-3.5 text-orange-400" />
                  )}
                  <span className="text-xs font-medium capitalize">{expandedFileStatus} files</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
                  </span>
                </div>
                <div className="max-h-50 overflow-y-auto">
                  {filteredFiles.slice(0, fileDisplayCount).map((f) => (
                    <button
                      key={f.id}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/50 transition-colors border-b last:border-b-0 cursor-pointer"
                      onClick={() => setActiveFileId(f.id)}
                    >
                      <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-mono text-foreground truncate flex-1">
                        {f.filePath}
                      </span>
                    </button>
                  ))}
                  {filteredFiles.length > fileDisplayCount && (
                    <button
                      className="w-full px-3 py-2 text-[10px] text-muted-foreground text-center hover:bg-accent/50 transition-colors bg-muted/10 cursor-pointer font-medium"
                      onClick={() => setFileDisplayCount((prev) => prev + 100)}
                    >
                      View {Math.min(100, filteredFiles.length - fileDisplayCount)} more (
                      {filteredFiles.length - fileDisplayCount} remaining)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Donut chart — Suture Progress */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium mb-4">Suture Progress</h3>
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-50 items-center justify-center text-xs text-muted-foreground">
                  No data yet
                </div>
              )}
            </div>

            {/* Bar chart — Node Density */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium mb-4">Node Density</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} barSize={40}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {barData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Provider Info & API Usage */}
          <div className="grid grid-cols-2 gap-6">
            {/* Provider Info */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Active Provider
              </h3>
              {providerInfo ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Provider</span>
                    <span className="text-sm font-medium capitalize">{providerInfo.provider}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Model</span>
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                      {providerInfo.model}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">API Key</span>
                    <span
                      className={`text-xs font-medium ${providerInfo.hasKey ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {providerInfo.hasKey ? 'Configured' : 'Not Set'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Loading...</div>
              )}
            </div>

            {/* Token Usage */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Token Usage
                </h3>
                <Tabs
                  value={usageScope}
                  onValueChange={(v) => setUsageScope(v as 'local' | 'global')}
                >
                  <TabsList className="h-7">
                    <TabsTrigger value="local" className="text-xs h-6 gap-1 px-2">
                      <FolderOpen className="h-3 w-3" />
                      Workspace
                    </TabsTrigger>
                    <TabsTrigger value="global" className="text-xs h-6 gap-1 px-2">
                      <Globe className="h-3 w-3" />
                      Global
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <UsageBlock usage={usageScope === 'local' ? localUsage : usageSummary} />
            </div>
          </div>

          {/* Usage by Provider (pie chart) */}
          {(() => {
            const activeUsage = usageScope === 'local' ? localUsage : usageSummary
            if (!activeUsage || activeUsage.byProvider.length === 0) return null
            return (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-medium mb-4">Usage by Provider</h3>
                <div className="grid grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={activeUsage.byProvider.map((p) => ({
                          name: `${p.provider} (${p.model})`,
                          value: p.totalTokens
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {activeUsage.byProvider.map((_, i) => (
                          <Cell key={i} fill={PROVIDER_COLORS[i % PROVIDER_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex flex-col justify-center">
                    {activeUsage.byProvider.map((p, i) => (
                      <div key={`${p.provider}-${p.model}`} className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PROVIDER_COLORS[i % PROVIDER_COLORS.length] }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium capitalize truncate">{p.provider}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.model}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs tabular-nums">
                            {p.totalTokens.toLocaleString()} tokens
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {p.batchCount} calls
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Translate All Confirmation */}
      <AlertDialog open={showTranslateConfirm} onOpenChange={setShowTranslateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Translate All Segments?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send all pending segments to the AI provider for translation. API usage
              costs may apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleQueueStart()
                setShowTranslateConfirm(false)
              }}
            >
              Translate All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  onClick,
  active
}: {
  label: string
  value: number
  icon: React.ReactNode
  color?: string
  onClick?: () => void
  active?: boolean
}) {
  const isClickable = !!onClick && value > 0
  return (
    <div
      className={`rounded-lg border bg-card p-3 space-y-1 transition-colors ${isClickable ? 'cursor-pointer hover:bg-accent/50' : ''} ${active ? 'ring-1 ring-muted-foreground/30' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
        {isClickable &&
          (active ? (
            <ChevronDown className="h-3 w-3 ml-auto" />
          ) : (
            <ChevronRight className="h-3 w-3 ml-auto" />
          ))}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color || ''}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function UsageBlock({
  usage
}: {
  usage: {
    totalInput: number
    totalOutput: number
    totalTokens: number
    totalBatches: number
  } | null
}) {
  if (!usage || usage.totalBatches === 0) {
    return <div className="text-xs text-muted-foreground">No API usage recorded yet</div>
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Input Tokens</span>
        <span className="text-sm font-bold tabular-nums text-blue-400">
          {usage.totalInput.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Output Tokens</span>
        <span className="text-sm font-bold tabular-nums text-purple-400">
          {usage.totalOutput.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Total Tokens</span>
        <span className="text-sm font-bold tabular-nums">{usage.totalTokens.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">API Calls</span>
        <span className="text-sm font-bold tabular-nums">{usage.totalBatches}</span>
      </div>
    </div>
  )
}
