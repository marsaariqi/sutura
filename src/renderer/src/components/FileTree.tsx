import { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import { Tree, NodeRendererProps, TreeApi } from 'react-arborist'
import { useAppStore, type FileStatus, type ProjectFile } from '@/stores/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  FileText,
  FolderOpen,
  Folder,
  FolderClosed,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  MoreVertical,
  Zap,
  CheckSquare,
  Square,
  MinusSquare,
  Ban
} from 'lucide-react'

// ---------- Status config ----------

const STATUS_CONFIG: Record<
  FileStatus,
  { label: string; color: string; dot: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Pending',
    color: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    icon: Clock
  },
  scanning: { label: 'Scanning', color: 'text-blue-400', dot: 'bg-blue-400', icon: Loader2 },
  scanned: { label: 'Scanned', color: 'text-orange-400', dot: 'bg-orange-400', icon: Search },
  translating: {
    label: 'Translating',
    color: 'text-purple-400',
    dot: 'bg-purple-400',
    icon: Loader2
  },
  translated: {
    label: 'Translated',
    color: 'text-blue-400',
    dot: 'bg-blue-400',
    icon: CheckCircle2
  },
  done: { label: 'Done', color: 'text-green-400', dot: 'bg-green-400', icon: CheckCircle2 },
  error: { label: 'Error', color: 'text-destructive', dot: 'bg-destructive', icon: AlertCircle },
  intact: { label: 'Intact', color: 'text-zinc-400', dot: 'bg-zinc-400', icon: CheckCircle2 },
  unsupported: {
    label: 'Unsupported',
    color: 'text-zinc-500',
    dot: 'bg-zinc-500',
    icon: Ban
  }
}

// ---------- Tree node types ----------

export interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  // Only on leaf (file) nodes
  fileId?: number
  filePath?: string
  status?: FileStatus
}

// ---------- Build hierarchical tree from flat file list ----------

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode = { id: '__root__', name: '', children: [] }

  for (const file of files) {
    const parts = file.filePath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const pathSoFar = parts.slice(0, i + 1).join('/')

      if (isLast) {
        // File leaf
        current.children!.push({
          id: `file:${file.id}`,
          name: part,
          fileId: file.id,
          filePath: file.filePath,
          status: file.status
        })
      } else {
        // Folder node — find or create
        let folder = current.children!.find((c) => c.children && c.name === part)
        if (!folder) {
          folder = { id: `folder:${pathSoFar}`, name: part, children: [] }
          current.children!.push(folder)
        }
        current = folder
      }
    }
  }

  // Sort: folders first, then files, both alphabetical
  function sortChildren(node: TreeNode): void {
    if (!node.children) return
    node.children.sort((a, b) => {
      const aIsFolder = !!a.children
      const bIsFolder = !!b.children
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortChildren)
  }
  sortChildren(root)

  return root.children || []
}

// ---------- Collect all file IDs under a node ----------

function collectFileIds(node: TreeNode): number[] {
  if (node.fileId !== undefined) return [node.fileId]
  if (!node.children) return []
  return node.children.flatMap(collectFileIds)
}

// ---------- Aggregate status for folder ----------

function getFolderStatus(node: TreeNode, files: ProjectFile[]): FileStatus | null {
  const ids = collectFileIds(node)
  if (ids.length === 0) return null

  const idSet = new Set(ids)
  const statuses = files.filter((f) => idSet.has(f.id)).map((f) => f.status)

  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.every((s) => s === 'intact')) return 'intact'
  if (statuses.every((s) => s === 'done' || s === 'intact')) return 'done'
  if (statuses.every((s) => s === 'unsupported')) return 'unsupported'
  if (statuses.some((s) => s === 'error')) return 'error'
  if (statuses.some((s) => s === 'translating')) return 'translating'
  if (statuses.some((s) => s === 'translated')) return 'translated'
  if (statuses.some((s) => s === 'scanning')) return 'scanning'
  if (statuses.some((s) => s === 'scanned')) return 'scanned'
  return 'pending'
}

// ---------- StatusDot ----------

function StatusDot({ status }: { status: FileStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${cfg.dot} ${
        status === 'scanning' || status === 'translating' ? 'animate-pulse' : ''
      }`}
      title={cfg.label}
    />
  )
}

// ---------- Checkbox logic ----------

function CheckboxIcon({ checked, indeterminate }: { checked: boolean; indeterminate: boolean }) {
  if (indeterminate) return <MinusSquare className="h-3.5 w-3.5 text-muted-foreground" />
  if (checked) return <CheckSquare className="h-3.5 w-3.5 text-primary" />
  return <Square className="h-3.5 w-3.5 text-muted-foreground/50" />
}

// ---------- File icon by extension ----------

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  const codeExts = new Set([
    'js',
    'jsx',
    'ts',
    'tsx',
    'java',
    'go',
    'py',
    'kt',
    'rs',
    'c',
    'cpp',
    'h',
    'cs',
    'swift',
    'rb',
    'php',
    'groovy'
  ])
  if (ext && codeExts.has(ext)) {
    return <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />
  }
  return <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

// ---------- Node renderer ----------

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const data = node.data
  const isFolder = !!data.children
  const activeFileId = useAppStore((s) => s.activeFileId)
  const setActiveFileId = useAppStore((s) => s.setActiveFileId)
  const selectedFileIds = useAppStore((s) => s.selectedFileIds)
  const toggleFileSelected = useAppStore((s) => s.toggleFileSelected)
  const setSelectedFileIds = useAppStore((s) => s.setSelectedFileIds)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const files = useAppStore((s) => s.files)

  const isActive = !isFolder && activeFileId === data.fileId
  const status = isFolder ? getFolderStatus(data, files) : data.status

  // Checkbox state
  let checked = false
  let indeterminate = false

  if (isFolder) {
    const ids = collectFileIds(data)
    const selectedCount = ids.filter((id) => selectedFileIds.has(id)).length
    checked = ids.length > 0 && selectedCount === ids.length
    indeterminate = selectedCount > 0 && selectedCount < ids.length
  } else if (data.fileId !== undefined) {
    checked = selectedFileIds.has(data.fileId)
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isFolder) {
      const ids = collectFileIds(data)
      const next = new Set(selectedFileIds)
      if (checked) {
        // Uncheck all under this folder
        ids.forEach((id) => next.delete(id))
      } else {
        // Check all under this folder
        ids.forEach((id) => next.add(id))
      }
      setSelectedFileIds(next)
    } else if (data.fileId !== undefined) {
      toggleFileSelected(data.fileId)
    }
  }

  const handleClick = () => {
    if (isFolder) {
      node.toggle()
    } else if (data.fileId !== undefined) {
      setActiveFileId(data.fileId)
    }
  }

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`group flex items-center gap-1.5 pr-2 cursor-pointer text-[13px] h-7 transition-colors hover:bg-accent/50 ${
        isActive ? 'bg-accent text-accent-foreground' : ''
      }`}
      onClick={handleClick}
    >
      {/* Checkbox */}
      <button
        className="shrink-0 ml-0.5 opacity-0 group-hover:opacity-100 data-[vis=true]:opacity-100 transition-opacity"
        data-vis={checked || indeterminate ? 'true' : undefined}
        onClick={handleCheckboxClick}
      >
        <CheckboxIcon checked={checked} indeterminate={indeterminate} />
      </button>

      {/* Folder arrow / file icon */}
      {isFolder ? (
        node.isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
        ) : (
          <FolderClosed className="h-3.5 w-3.5 shrink-0 text-yellow-500/70" />
        )
      ) : (
        getFileIcon(data.name)
      )}

      {/* Name */}
      <span className="truncate flex-1" title={data.filePath || data.name}>
        {data.name}
      </span>

      {/* Status dot */}
      {status && <StatusDot status={status} />}

      {/* Context menu (files only) */}
      {!isFolder && data.filePath && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => {
                if (workspacePath && data.filePath) {
                  window.api.revealInExplorer(workspacePath, data.filePath)
                }
              }}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Reveal in Explorer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// ---------- Main FileTree component ----------

export function FileTree() {
  const files = useAppStore((s) => s.files)
  const filterStatus = useAppStore((s) => s.filterStatus)
  const setFilterStatus = useAppStore((s) => s.setFilterStatus)
  const activeFileId = useAppStore((s) => s.activeFileId)
  const selectedFileIds = useAppStore((s) => s.selectedFileIds)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const selectAllFiles = useAppStore((s) => s.selectAllFiles)
  const treeRef = useRef<TreeApi<TreeNode>>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const [treeHeight, setTreeHeight] = useState(400)

  const filteredFiles = useMemo(() => {
    if (filterStatus === 'all') return files
    return files.filter((f) => f.status === filterStatus)
  }, [files, filterStatus])

  const treeData = useMemo(() => buildTree(filteredFiles), [filteredFiles])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: files.length }
    for (const f of files) {
      counts[f.status] = (counts[f.status] || 0) + 1
    }
    return counts
  }, [files])

  const handleQueueSelected = useCallback(async () => {
    if (selectedFileIds.size === 0) return
    const ids = Array.from(selectedFileIds)
    await window.api.queueSelectedFiles(ids)
    clearSelection()
  }, [selectedFileIds, clearSelection])

  // Auto-scroll and expand tree when active file changes
  useEffect(() => {
    if (activeFileId && treeRef.current) {
      const file = files.find((f) => f.id === activeFileId)
      if (file) {
        // If file is not visible under current filter, reset filter to 'all'
        if (filterStatus !== 'all' && file.status !== filterStatus) {
          setFilterStatus('all')
        }

        // Expand all parent folders
        const parts = file.filePath.split('/')
        for (let i = 0; i < parts.length - 1; i++) {
          const pathSoFar = parts.slice(0, i + 1).join('/')
          treeRef.current.open(`folder:${pathSoFar}`)
        }

        // Scroll to the file node
        const fileNodeId = `file:${file.id}`
        setTimeout(() => {
          treeRef.current?.focus(fileNodeId)
          treeRef.current?.scrollTo(fileNodeId)
        }, 50)
      }
    }
  }, [activeFileId, files, filterStatus, setFilterStatus])

  // Measure tree container for react-arborist height
  useEffect(() => {
    const el = treeContainerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setTreeHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as FileStatus | 'all')}
        >
          <SelectTrigger className="h-7 w-27.5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({statusCounts.all || 0})</SelectItem>
            <SelectItem value="pending">Pending ({statusCounts.pending || 0})</SelectItem>
            <SelectItem value="scanned">Scanned ({statusCounts.scanned || 0})</SelectItem>
            <SelectItem value="translated">Translated ({statusCounts.translated || 0})</SelectItem>
            <SelectItem value="done">Done ({statusCounts.done || 0})</SelectItem>
            <SelectItem value="error">Error ({statusCounts.error || 0})</SelectItem>
            <SelectItem value="intact">Intact ({statusCounts.intact || 0})</SelectItem>
            <SelectItem value="unsupported">
              Unsupported ({statusCounts.unsupported || 0})
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {files.length > 0 && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={selectedFileIds.size === files.length ? clearSelection : selectAllFiles}
          >
            {selectedFileIds.size === files.length ? 'None' : 'All'}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedFileIds.size > 0 && (
        <div className="flex items-center gap-2 border-b bg-accent/30 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">{selectedFileIds.size} selected</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="default"
            className="h-6 text-xs px-2"
            onClick={handleQueueSelected}
          >
            <Zap className="mr-1 h-3 w-3" />
            Queue for Translation
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-1.5" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      {/* Tree */}
      <div ref={treeContainerRef} className="flex-1 overflow-hidden">
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
            <Folder className="h-8 w-8" />
            <p className="text-sm">
              {files.length === 0 ? 'No workspace loaded' : 'No files match filter'}
            </p>
          </div>
        ) : (
          <Tree<TreeNode>
            ref={treeRef}
            data={treeData}
            openByDefault={false}
            width="100%"
            height={treeHeight}
            indent={16}
            rowHeight={28}
            overscanCount={10}
            disableDrag
            disableDrop
            disableEdit
          >
            {Node}
          </Tree>
        )}
      </div>

      {/* Footer */}
      {files.length > 0 && (
        <div className="border-t px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          <span>
            {filteredFiles.length} / {files.length} files
          </span>
          {statusCounts.done ? (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {statusCounts.done} done
            </Badge>
          ) : null}
        </div>
      )}
    </div>
  )
}
