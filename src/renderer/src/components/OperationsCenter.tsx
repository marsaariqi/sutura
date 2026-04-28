import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, type LogEntry } from '@/stores/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  FolderOpen,
  Trash2,
  Globe,
  MapPin,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Bug as BugIcon,
  ChevronRight,
  Sparkles,
  Cpu,
  Terminal,
  GripHorizontal,
  Zap,
  Layers,
  Activity
} from 'lucide-react'

// ---------- Helpers ----------

/** Extract the human-readable prompt parts from a raw request payload */
function extractFormattedPrompt(request: unknown): {
  systemPrompt: string | null
  userPrompt: string | null
  instruction: string | null
  entries: unknown | null
} | null {
  if (!request || typeof request !== 'object') return null
  const req = request as Record<string, unknown>

  let systemPrompt: string | null = null
  let userPrompt: string | null = null

  // Gemini format
  const sysInstr = req.systemInstruction as { parts?: { text?: string }[] } | undefined
  if (sysInstr?.parts?.[0]?.text) {
    systemPrompt = sysInstr.parts[0].text
  }
  const contents = req.contents as { parts?: { text?: string }[] }[] | undefined
  if (contents?.[0]?.parts?.[0]?.text) {
    userPrompt = contents[0].parts[0].text
  }

  // Anthropic format
  const system = req.system as { type?: string; text?: string }[] | undefined
  if (system) {
    for (const s of system) {
      if (s.type === 'text' && s.text) systemPrompt = s.text
    }
  }

  // OpenAI-compatible format (DeepSeek, OpenAI, Ollama, llama.cpp)
  const messages = req.messages as { role?: string; content?: string }[] | undefined
  if (messages) {
    for (const msg of messages) {
      if (msg.role === 'system' && msg.content) systemPrompt = msg.content
      if (msg.role === 'user' && msg.content) userPrompt = msg.content
    }
  }

  if (!systemPrompt && !userPrompt) return null

  // Try to extract the instruction text and JSON entries from the user prompt
  let instruction: string | null = null
  let entries: unknown = null
  if (userPrompt) {
    // Standard Sutura format includes a "Payload:" marker
    const payloadMarker = 'Payload:'
    const payloadIndex = userPrompt.indexOf(payloadMarker)

    if (payloadIndex !== -1) {
      // Everything before and including "Payload:" is the Instruction
      instruction = userPrompt.slice(0, payloadIndex + payloadMarker.length).trim()
      const jsonStr = userPrompt.slice(payloadIndex + payloadMarker.length).trim()
      try {
        entries = JSON.parse(jsonStr)
      } catch {
        // If it's not valid JSON, we'll fall through to regex
      }
    }

    // Fallback: If no Payload marker or JSON parse failed, try the old regex method
    if (!entries) {
      const jsonMatch = userPrompt.match(/\{[\s\S]*"entries"[\s\S]*\}/)
      if (jsonMatch) {
        if (!instruction) {
          const before = userPrompt.slice(0, jsonMatch.index).trim()
          if (before) instruction = before
        }
        try {
          entries = JSON.parse(jsonMatch[0])
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { systemPrompt, userPrompt, instruction, entries }
}

function getLevelIcon(level: string) {
  switch (level) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />
    case 'warn':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
    case 'info':
      return <Info className="h-3.5 w-3.5 text-blue-500" />
    default:
      return <BugIcon className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'success':
      return 'text-emerald-500'
    case 'error':
      return 'text-red-500'
    case 'warn':
      return 'text-amber-500'
    case 'info':
      return 'text-blue-500'
    default:
      return 'text-muted-foreground'
  }
}

function getProviderBadge(provider: string) {
  const normalizedProvider = provider.toLowerCase()

  switch (normalizedProvider) {
    case 'gemini':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-purple-500/40 text-purple-700 dark:text-purple-400 font-mono"
        >
          <Sparkles className="h-2.5 w-2.5 mr-0.5" />
          Gemini
        </Badge>
      )
    case 'deepseek':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-cyan-500/40 text-cyan-700 dark:text-cyan-400 font-mono"
        >
          <Cpu className="h-2.5 w-2.5 mr-0.5" />
          DeepSeek
        </Badge>
      )
    case 'openai':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-mono"
        >
          <Zap className="h-2.5 w-2.5 mr-0.5" />
          OpenAI
        </Badge>
      )
    case 'anthropic':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-orange-500/40 text-orange-700 dark:text-orange-400 font-mono"
        >
          <Activity className="h-2.5 w-2.5 mr-0.5" />
          Anthropic
        </Badge>
      )
    case 'ollama':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-slate-500/40 text-slate-700 dark:text-slate-400 font-mono"
        >
          <Terminal className="h-2.5 w-2.5 mr-0.5" />
          Ollama
        </Badge>
      )
    case 'llama.cpp':
    case 'llamacpp':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-700 dark:text-amber-400 font-mono"
        >
          <Layers className="h-2.5 w-2.5 mr-0.5" />
          llama.cpp
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-muted-foreground font-mono"
        >
          System
        </Badge>
      )
  }
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDate(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ---------- Component ----------

export function OperationsCenter() {
  const workspacePath = useAppStore((s) => s.workspacePath)
  const liveFeedMap = useAppStore((s) => s.liveFeedMap)
  const clearLiveFeed = useAppStore((s) => s.clearLiveFeed)

  // Derive live feed for current workspace (workspace entries + system entries)
  const liveFeed = useMemo(() => {
    const wpKey = workspacePath || '__system__'
    const wpEntries = liveFeedMap[wpKey] || []
    if (!workspacePath) return wpEntries
    const sysEntries = liveFeedMap['__system__'] || []
    const ids = new Set(wpEntries.map((e) => e.id))
    const merged = [...wpEntries]
    for (const e of sysEntries) {
      if (!ids.has(e.id)) merged.push(e)
    }
    return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [liveFeedMap, workspacePath])

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [scope, setScope] = useState<'local' | 'global'>('local')
  const [filterLevel, setFilterLevel] = useState<'all' | 'success' | 'error' | 'warn' | 'info'>(
    'all'
  )
  const [filterProvider, setFilterProvider] = useState<
    'all' | 'gemini' | 'deepseek' | 'openai' | 'anthropic' | 'ollama' | 'llamacpp' | 'system'
  >('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [inspectedLog, setInspectedLog] = useState<LogEntry | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const feedRef = useRef<HTMLDivElement>(null)
  const [feedHeight, setFeedHeight] = useState(144)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const [displayCount, setDisplayCount] = useState(50)

  useEffect(() => {
    setDisplayCount(50)
  }, [scope, filterLevel, filterProvider, searchQuery])

  const loadLogs = useCallback(async () => {
    try {
      const data =
        scope === 'local'
          ? ((await window.api.getSessionLogs(workspacePath || undefined)) as LogEntry[])
          : ((await window.api.getGlobalLogs()) as LogEntry[])
      setLogs(data)
    } catch {
      setLogs([])
    }
  }, [scope, workspacePath])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // Sync new live feed entries into the log list
  const prevFeedLenRef = useRef(liveFeed.length)

  // Reset feed length tracking when workspace changes (loadLogs handles the reload)
  useEffect(() => {
    prevFeedLenRef.current = liveFeed.length
  }, [workspacePath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (liveFeed.length > prevFeedLenRef.current) {
      const newEntries = liveFeed.slice(prevFeedLenRef.current)
      setLogs((prev) => [...prev, ...newEntries])
    }
    prevFeedLenRef.current = liveFeed.length
  }, [liveFeed])

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [liveFeed, autoScroll])

  // Drag-to-resize live feed
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const delta = e.clientY - dragRef.current.startY
      const newHeight = Math.min(Math.max(dragRef.current.startHeight + delta, 64), 500)
      setFeedHeight(newHeight)
    }
    const handleMouseUp = () => {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startHeight: feedHeight }
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [feedHeight]
  )

  const filteredLogs = useMemo(() => {
    let result = [...logs]
    if (scope === 'local' && workspacePath) {
      result = result.filter((l) => l.workspacePath === workspacePath || l.workspacePath === null)
    }
    if (filterLevel !== 'all') result = result.filter((l) => l.level === filterLevel)
    if (filterProvider !== 'all') result = result.filter((l) => l.provider === filterProvider)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((l) => {
        if (l.message.toLowerCase().includes(q)) return true
        if (l.provider.toLowerCase().includes(q)) return true
        if (l.metadata && JSON.stringify(l.metadata).toLowerCase().includes(q)) return true
        if (l.request && JSON.stringify(l.request).toLowerCase().includes(q)) return true
        if (l.response && JSON.stringify(l.response).toLowerCase().includes(q)) return true
        return false
      })
    }
    return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [logs, scope, workspacePath, filterLevel, filterProvider, searchQuery])

  const handleClearSession = useCallback(async () => {
    await window.api.clearSessionLogs(workspacePath || undefined)
    clearLiveFeed(workspacePath)
    loadLogs()
  }, [loadLogs, clearLiveFeed, workspacePath])

  const handleOpenFolder = useCallback(async () => {
    await window.api.openLogsFolder()
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2 shrink-0">
        <Terminal className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-semibold font-mono tracking-tight">Operations Center</h2>
        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleOpenFolder}>
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open logs folder</TooltipContent>
        </Tooltip>

        {/* Header Trigger */}
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Clear session logs</TooltipContent>
          </Tooltip>

          {/* Fixed Styling: Increased width and better text hierarchy */}
          <AlertDialogContent className="max-w-105 p-6">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold tracking-tight">
                Clear Operations History?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                This will permanently delete all logs for the current session in this workspace.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel className="h-9 px-4 text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearSession}
                className="h-9 px-4 text-sm bg-destructive text-destructive-foreground hover:bg-destructive/70"
              >
                Confirm Wipe
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Live Terminal Feed */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-secondary/40">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Live Feed
            </span>
          </div>
          <div className="flex-1" />
          <button
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${autoScroll ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
        </div>
        <div
          ref={feedRef}
          style={{ height: feedHeight }}
          className="overflow-y-auto font-mono text-[11px] leading-relaxed px-4 py-2 bg-muted/30 ops-terminal-scroll"
        >
          {liveFeed.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-[11px]">
              <span className="opacity-60">Waiting for events...</span>
              <span className="ml-1 animate-pulse">|</span>
            </div>
          ) : (
            liveFeed.map((entry) => (
              <div
                key={entry.id}
                className="flex gap-2 hover:bg-accent/30 rounded px-1 -mx-1 py-0.5"
              >
                <span className="text-muted-foreground shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`shrink-0 uppercase w-12 ${getLevelColor(entry.level)}`}>
                  {entry.level === 'success' ? 'OK' : entry.level.toUpperCase().slice(0, 5)}
                </span>
                <span className="text-foreground/80 break-all whitespace-pre-wrap">
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
        {/* Drag handle to resize */}
        <div
          className="h-2 border-b cursor-row-resize flex items-center justify-center hover:bg-accent/50 transition-colors group"
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 flex-wrap">
        {/* Scope toggle */}
        <div className="flex rounded-md border overflow-hidden">
          <button
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono transition-colors ${scope === 'local' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setScope('local')}
          >
            <MapPin className="h-3 w-3" />
            Local
          </button>
          <button
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono transition-colors ${scope === 'global' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setScope('global')}
          >
            <Globe className="h-3 w-3" />
            Global
          </button>
        </div>

        <Separator orientation="vertical" className="h-4" />

        {/* Level filters */}
        <div className="flex gap-1">
          {(['all', 'success', 'error', 'warn', 'info'] as const).map((level) => (
            <button
              key={level}
              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                filterLevel === level
                  ? level === 'all'
                    ? 'bg-secondary text-secondary-foreground'
                    : level === 'success'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : level === 'error'
                        ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                        : level === 'warn'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setFilterLevel(level)}
            >
              {level}
            </button>
          ))}
        </div>

        <Separator orientation="vertical" className="h-4" />

        {/* Provider filters */}
        <div className="flex gap-1">
          {(
            [
              'all',
              'gemini',
              'deepseek',
              'openai',
              'anthropic',
              'ollama',
              'llamacpp',
              'system'
            ] as const
          ).map((prov) => (
            <button
              key={prov}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                filterProvider === prov
                  ? prov === 'gemini'
                    ? 'bg-purple-500/15 text-purple-700 dark:text-purple-400'
                    : prov === 'deepseek'
                      ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400'
                      : prov === 'openai'
                        ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                        : prov === 'anthropic'
                          ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
                          : prov === 'ollama' || prov === 'llamacpp'
                            ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                            : 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setFilterProvider(prov)}
            >
              {prov === 'all'
                ? 'All'
                : prov === 'llamacpp'
                  ? 'llama.cpp'
                  : prov.charAt(0).toUpperCase() + prov.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            className="h-7 text-[11px] pl-7 font-mono"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
          {filteredLogs.length} entries
        </Badge>
      </div>

      {/* Log List */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Terminal className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-mono">No log entries found</p>
              <p className="text-[11px] mt-1 opacity-60">Logs will appear here during operations</p>
            </div>
          ) : (
            <>
              {filteredLogs.slice(0, displayCount).map((entry) => (
                <button
                  key={entry.id}
                  className="w-full grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2 text-left hover:bg-muted/50 transition-colors group"
                  onClick={() => setInspectedLog(entry)}
                >
                  <div className="shrink-0">{getLevelIcon(entry.level)}</div>
                  <div className="min-w-0 overflow-hidden">
                    <p className="text-[11px] font-mono text-foreground/80 truncate">
                      {entry.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatTime(entry.timestamp)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">&bull;</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">{getProviderBadge(entry.provider)}</div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
              {filteredLogs.length > displayCount && (
                <div className="py-2 px-4 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 text-muted-foreground hover:text-foreground border-dashed"
                    onClick={() => setDisplayCount((prev) => prev + 100)}
                  >
                    Load More ({filteredLogs.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Payload Inspection Modal */}
      <Dialog open={inspectedLog !== null} onOpenChange={(open) => !open && setInspectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              {inspectedLog && getLevelIcon(inspectedLog.level)}
              <span className="truncate">{inspectedLog?.message}</span>
            </DialogTitle>
            <DialogDescription className="font-mono text-[11px]">
              {inspectedLog && (
                <span className="flex items-center gap-2">
                  <span>{new Date(inspectedLog.timestamp).toLocaleString()}</span>
                  <span>&bull;</span>
                  <span className="uppercase">{inspectedLog.provider}</span>
                  {inspectedLog.workspacePath && (
                    <>
                      <span>&bull;</span>
                      <span className="truncate max-w-50">{inspectedLog.workspacePath}</span>
                    </>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 ops-terminal-scroll px-2">
            {inspectedLog?.metadata && (
              <div>
                <h4 className="text-[10px] font-mono text-muted-foreground uppercase mb-1.5 tracking-wider">
                  Metadata
                </h4>
                <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap break-all">
                  {JSON.stringify(inspectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}
            {!!inspectedLog?.request && (
              <div>
                <h4 className="text-[10px] font-mono text-muted-foreground uppercase mb-1.5 tracking-wider">
                  Request Payload (Raw)
                </h4>
                <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-blue-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap break-all">
                  {JSON.stringify(inspectedLog.request, null, 2)}
                </pre>
              </div>
            )}
            {!!inspectedLog?.request &&
              (() => {
                const formatted = extractFormattedPrompt(inspectedLog.request)
                if (!formatted) return null
                return (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      Formatted Prompt (Human Readable)
                    </h4>
                    {formatted.systemPrompt && (
                      <div>
                        <h5 className="text-[10px] font-mono text-zinc-400 mb-1">System Prompt</h5>
                        <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-purple-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap wrap-break-word">
                          {formatted.systemPrompt}
                        </pre>
                      </div>
                    )}
                    {formatted.instruction && (
                      <div>
                        <h5 className="text-[10px] font-mono text-zinc-400 mb-1">Instruction</h5>
                        <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-amber-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap wrap-break-word">
                          {formatted.instruction}
                        </pre>
                      </div>
                    )}
                    {formatted.entries ? (
                      <div>
                        <h5 className="text-[10px] font-mono text-zinc-400 mb-1">
                          Translation Entries
                        </h5>
                        <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-cyan-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap wrap-break-word">
                          {JSON.stringify(formatted.entries, null, 2)}
                        </pre>
                      </div>
                    ) : formatted.userPrompt ? (
                      <div>
                        <h5 className="text-[10px] font-mono text-zinc-400 mb-1">User Prompt</h5>
                        <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-cyan-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap wrap-break-word">
                          {formatted.userPrompt}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                )
              })()}
            {!!inspectedLog?.response && (
              <div>
                <h4 className="text-[10px] font-mono text-muted-foreground uppercase mb-1.5 tracking-wider">
                  Response Payload
                </h4>
                <pre className="bg-zinc-950 rounded-md p-3 text-[11px] font-mono text-amber-300 overflow-x-auto leading-relaxed border border-zinc-700/50 ops-terminal-scroll whitespace-pre-wrap break-all">
                  {JSON.stringify(inspectedLog.response, null, 2)}
                </pre>
              </div>
            )}
            {!inspectedLog?.metadata && !inspectedLog?.request && !inspectedLog?.response && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm font-mono">No payload data for this entry</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
