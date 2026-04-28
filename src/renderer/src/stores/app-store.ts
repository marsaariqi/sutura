import { create } from 'zustand'

export type LogProvider =
  | 'gemini'
  | 'deepseek'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'llamacpp'
  | 'system'

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'error' | 'warn' | 'debug'
  provider: LogProvider
  message: string
  workspacePath: string | null
  request?: unknown
  response?: unknown
  metadata?: Record<string, unknown>
}

export type FileStatus =
  | 'pending'
  | 'scanning'
  | 'scanned'
  | 'translating'
  | 'translated'
  | 'done'
  | 'error'
  | 'intact'
  | 'unsupported'

export type ProviderKey = 'gemini' | 'deepseek' | 'openai' | 'anthropic' | 'ollama' | 'llamacpp'

export type QueueStatus = 'idle' | 'running' | 'paused' | 'done' | 'error'

export interface ProjectFile {
  id: number
  filePath: string
  status: FileStatus
}

export interface Translation {
  id: number
  file_id: number
  line_start: number
  col_start: number
  line_end: number
  col_end: number
  node_type: string
  original_text: string
  translated_text: string | null
  status: string
}

export interface ScanProgress {
  totalFiles: number
  scannedFiles: number
  currentFile: string | null
}

export interface QueueProgress {
  totalItems: number
  completedItems: number
  errorItems: number
}

export interface GlossaryProgress {
  totalItems: number
  completedItems: number
  errorItems: number
}

export interface AppState {
  // Workspace
  workspacePath: string | null
  files: ProjectFile[]

  // Active file in editor
  activeFileId: number | null
  activeFileTranslations: Translation[]

  // Scan progress
  scanProgress: ScanProgress
  isScanning: boolean

  // Translation queue
  queueStatus: QueueStatus
  queueProgress: QueueProgress
  lastError: string | null

  // Settings
  aiProvider: ProviderKey
  aiModel: string
  translationScope: 'all' | 'comment' | 'string_literal'
  sourceLanguage: string
  targetLanguage: string
  batchSize: number
  temperature: number

  // Filter/sort for file list
  filterStatus: FileStatus | 'all'
  sortBy: 'path' | 'status'

  // Selected files for bulk actions
  selectedFileIds: Set<number>

  // Virtual injection buffers: fileId → modified content string
  virtualBuffers: Map<number, string>

  // Live feed log entries per workspace (key = workspacePath, '__system__' for null)
  liveFeedMap: Record<string, LogEntry[]>

  // Editor view mode: 'source' forces standard editor even if diff is available
  editorViewMode: 'auto' | 'source'

  // Editor refresh key: increment to force reload of file content
  editorRefreshKey: number

  // Settings version: bumped when settings are saved to trigger dependent views
  settingsVersion: number

  // Cooldown timer (burst-limiter)
  cooldownSeconds: number

  // Settings dialog
  settingsOpen: boolean
  settingsTab: string

  // home navigation
  activeView: 'main' | 'operations' | 'about' | 'glossary' // Add this
  setActiveView: (view: 'main' | 'operations' | 'about' | 'glossary') => void
  // Actions
  setWorkspacePath: (path: string | null) => void
  setFiles: (files: ProjectFile[]) => void
  setActiveFileId: (id: number | null) => void
  setActiveFileTranslations: (translations: Translation[]) => void
  setScanProgress: (progress: Partial<ScanProgress>) => void
  setIsScanning: (scanning: boolean) => void
  setQueueStatus: (status: QueueStatus) => void
  setQueueProgress: (progress: Partial<QueueProgress>) => void
  setLastError: (error: string | null) => void
  setAiProvider: (provider: ProviderKey) => void
  setAiModel: (model: string) => void
  setSourceLanguage: (language: string) => void
  setTargetLanguage: (language: string) => void
  setBatchSize: (size: number) => void
  setTemperature: (temp: number) => void
  setTranslationScope: (scope: 'all' | 'comment' | 'string_literal') => void
  setFilterStatus: (status: FileStatus | 'all') => void
  setSortBy: (sortBy: 'path' | 'status') => void
  setSettingsOpen: (open: boolean, tab?: string) => void
  toggleFileSelected: (fileId: number) => void
  setSelectedFileIds: (ids: Set<number>) => void
  selectAllFiles: () => void
  clearSelection: () => void
  updateFileStatus: (fileId: number, status: FileStatus) => void
  setVirtualBuffer: (fileId: number, content: string) => void
  clearVirtualBuffer: (fileId: number) => void
  clearVirtualBufferBatch: (fileIds: Array<number>) => void
  setEditorViewMode: (mode: 'auto' | 'source') => void
  bumpEditorRefreshKey: () => void
  bumpSettingsVersion: () => void
  setCooldownSeconds: (seconds: number) => void
  appendLiveFeed: (entry: LogEntry) => void
  setLiveFeedForWorkspace: (workspacePath: string | null, entries: LogEntry[]) => void
  clearLiveFeed: (workspacePath?: string | null) => void
  reset: () => void

  // dynamic sys prompt
  systemPrompt: string
  setSystemPrompt: (prompt: string) => void

  // Glossary states
  glossaryMinFreq: number
  setGlossaryMinFreq: (freq: number) => void
  isGlossaryScanning: boolean
  setGlossaryScanning: (scanning: boolean) => void
  isGlossaryTranslating: boolean
  setGlossaryTranslating: (translating: boolean) => void
  glossaryProgress: GlossaryProgress
  setGlossaryProgress: (progress: Partial<GlossaryProgress>) => void
}

const initialState = {
  workspacePath: null,
  files: [],
  activeFileId: null,
  activeFileTranslations: [],
  scanProgress: {
    totalFiles: 0,
    scannedFiles: 0,
    currentFile: null
  },
  isScanning: false,
  queueStatus: 'idle' as QueueStatus,
  queueProgress: {
    totalItems: 0,
    completedItems: 0,
    errorItems: 0
  },
  glossaryProgress: {
    totalItems: 0,
    completedItems: 0,
    errorItems: 0
  },
  lastError: null,
  aiProvider: 'gemini' as ProviderKey,
  aiModel: '',
  translationScope: 'all' as 'all',
  sourceLanguage: 'Chinese',
  targetLanguage: 'English',
  batchSize: 10,
  temperature: 0.3,
  filterStatus: 'all' as const,
  sortBy: 'path' as const,
  selectedFileIds: new Set<number>(),
  virtualBuffers: new Map<number, string>(),
  editorViewMode: 'auto' as const,
  editorRefreshKey: 0,
  settingsVersion: 0,
  cooldownSeconds: 0,
  settingsOpen: false,
  settingsTab: 'general',
  liveFeedMap: {} as Record<string, LogEntry[]>,
  activeView: 'main' as const
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setWorkspacePath: (path) =>
    set({
      workspacePath: path,
      // Clear workspace-dependent state to prevent stale data across switches
      files: [],
      activeFileId: null,
      activeFileTranslations: [],
      selectedFileIds: new Set<number>(),
      virtualBuffers: new Map<number, string>(),
      editorViewMode: 'auto' as const,
      queueStatus: 'idle' as QueueStatus,
      queueProgress: { totalItems: 0, completedItems: 0, errorItems: 0 },
      cooldownSeconds: 0,
      lastError: null
    }),

  setFiles: (files) => set({ files }),
  setActiveView: (view) => set({ activeView: view }),
  setActiveFileId: (id) => set({ activeFileId: id, editorViewMode: 'source', activeView: 'main' }),

  setActiveFileTranslations: (translations) => set({ activeFileTranslations: translations }),

  setScanProgress: (progress) =>
    set((state) => ({
      scanProgress: { ...state.scanProgress, ...progress }
    })),

  setIsScanning: (scanning) => set({ isScanning: scanning }),

  setQueueStatus: (status) => set({ queueStatus: status }),

  setQueueProgress: (progress) =>
    set((state) => ({
      queueProgress: { ...state.queueProgress, ...progress }
    })),

  setLastError: (error) => set({ lastError: error }),

  setAiProvider: (provider) => set({ aiProvider: provider }),

  setAiModel: (model) => set({ aiModel: model }),

  setTranslationScope: (scope) => set({ translationScope: scope }),

  setSourceLanguage: (language) => set({ sourceLanguage: language }),

  setTargetLanguage: (language) => set({ targetLanguage: language }),

  setBatchSize: (size) => set({ batchSize: size }),

  setTemperature: (temp) => set({ temperature: temp }),

  setFilterStatus: (status) => set({ filterStatus: status }),

  setSortBy: (sortBy) => set({ sortBy }),

  setSettingsOpen: (open, tab) => set({ settingsOpen: open, settingsTab: tab || 'general' }),

  toggleFileSelected: (fileId) =>
    set((state) => {
      const next = new Set(state.selectedFileIds)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return { selectedFileIds: next }
    }),

  setSelectedFileIds: (ids) => set({ selectedFileIds: ids }),

  selectAllFiles: () =>
    set((state) => ({
      selectedFileIds: new Set(state.files.map((f) => f.id))
    })),

  clearSelection: () => set({ selectedFileIds: new Set<number>() }),

  updateFileStatus: (fileId, status) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === fileId ? { ...f, status } : f))
    })),

  setVirtualBuffer: (fileId, content) =>
    set((state) => {
      const next = new Map(state.virtualBuffers)
      next.set(fileId, content)
      return { virtualBuffers: next }
    }),

  clearVirtualBuffer: (fileId) =>
    set((state) => {
      const next = new Map(state.virtualBuffers)
      next.delete(fileId)
      next.forEach((_, key) => {
        if (key === fileId) next.delete(key)
      })
      return { virtualBuffers: next }
    }),

  clearVirtualBufferBatch: (fileIds: Array<number>) =>
    set((state) => {
      const next = new Map(state.virtualBuffers)
      fileIds.forEach((fileId) => {
        next.delete(fileId)
      })
      return { virtualBuffers: next }
    }),

  setEditorViewMode: (mode) => set({ editorViewMode: mode }),

  bumpEditorRefreshKey: () => set((state) => ({ editorRefreshKey: state.editorRefreshKey + 1 })),

  bumpSettingsVersion: () => set((state) => ({ settingsVersion: state.settingsVersion + 1 })),

  setCooldownSeconds: (seconds) => set({ cooldownSeconds: seconds }),

  appendLiveFeed: (entry) =>
    set((state) => {
      const key = entry.workspacePath || '__system__'
      return {
        liveFeedMap: {
          ...state.liveFeedMap,
          [key]: [...(state.liveFeedMap[key] || []), entry]
        }
      }
    }),

  setLiveFeedForWorkspace: (workspacePath, entries) =>
    set((state) => {
      const key = workspacePath || '__system__'
      return {
        liveFeedMap: {
          ...state.liveFeedMap,
          [key]: entries
        }
      }
    }),

  clearLiveFeed: (workspacePath) =>
    set((state) => {
      if (workspacePath !== undefined) {
        const key = workspacePath || '__system__'
        const next = { ...state.liveFeedMap }
        delete next[key]
        return { liveFeedMap: next }
      }
      return { liveFeedMap: {} }
    }),

  // dynamic sys prompt
  systemPrompt: '', // Initialized as empty, will be filled by a fetch
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

  // Glossary states
  glossaryMinFreq: 5,
  setGlossaryMinFreq: (freq) => set({ glossaryMinFreq: freq }),
  isGlossaryScanning: false,
  setGlossaryScanning: (scanning) => set({ isGlossaryScanning: scanning }),
  isGlossaryTranslating: false,
  setGlossaryTranslating: (translating: boolean) => set({ isGlossaryTranslating: translating }),
  setGlossaryProgress: (progress) =>
    set((state) => ({
      glossaryProgress: { ...state.glossaryProgress, ...progress }
    })),

  reset: () => set(initialState)
}))
