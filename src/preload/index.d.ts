import { ElectronAPI } from '@electron-toolkit/preload'

interface SutraAPI {
  selectWorkspace: () => Promise<string | null>
  scanWorkspace: (path: string) => Promise<{ success: boolean; fileCount?: number; error?: string }>
  getAllFiles: () => Promise<{ id: number; file_path: string; status: string }[]>
  getTranslations: (fileId: number) => Promise<
    {
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
    }[]
  >
  getFileContent: (workspacePath: string, filePath: string) => Promise<string | null>
  revealInExplorer: (workspacePath: string, filePath: string) => Promise<void>
  queueStart: () => Promise<{ success: boolean; error?: string }>
  queueSelectedFiles: (fileIds: number[]) => Promise<{ success: boolean; error?: string }>
  queuePause: () => Promise<{ success: boolean }>
  queueResume: () => Promise<{ success: boolean }>
  queueStop: () => Promise<{ success: boolean }>
  queueStatus: () => Promise<{ isRunning: boolean; isPaused: boolean }>
  queueStats: () => Promise<{ total: number; pending: number; done: number; error: number }>
  injectFile: (
    workspacePath: string,
    fileId: number
  ) => Promise<{ success: boolean; error?: string }>
  injectAll: (
    workspacePath: string,
    fileIds?: number[]
  ) => Promise<{ success: boolean; injectedCount?: number; errorCount?: number }>
  revertInjection: (
    workspacePath: string,
    fileId: number
  ) => Promise<{ success: boolean; error?: string }>
  hasBackup: (fileId: number) => Promise<boolean>
  retryTranslation: (fileId: number) => Promise<{ success: boolean; error?: string }>
  updateTranslationStatus: (
    translationId: number,
    status: 'pending' | 'excluded'
  ) => Promise<{ success: boolean; error?: string }>
  getSetting: (key: string) => Promise<string | undefined>
  setSetting: (key: string, value: string) => Promise<{ success: boolean }>
  getAllSettings: () => Promise<Record<string, string>>
  storeApiKey: (provider: string, key: string) => Promise<{ success: boolean; error?: string }>
  hasApiKey: (provider: string) => Promise<boolean>
  getApiKey: (provider: string) => Promise<{ success: boolean; key: string }>
  validateApiKey: (provider: string, key: string) => Promise<{ valid: boolean }>
  getTranslationStats: () => Promise<{
    total: number
    pending: number
    done: number
    error: number
    excluded: number
  }>
  getNodeTypeStats: () => Promise<{ comments: number; strings: number }>
  getFileStats: () => Promise<{
    total: number
    intact: number
    scanned: number
    translating: number
    translated: number
    done: number
    error: number
    pending: number
    unsupported: number
  }>
  getPendingCount: () => Promise<number>
  getUsageSummary: () => Promise<{
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
  }>
  getUsageSummaryLocal: () => Promise<{
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
  }>
  getProviderInfo: () => Promise<{ provider: string; model: string; hasKey: boolean }>
  getFilesWithSegmentStatus(
    status: 'error' | 'excluded' | 'pending' | 'done'
  ): Promise<{ fileId: number; filePath: string; count: number }[]>

  // Glossary
  analyzeFrequency: (
    minFrequency: number,
    scope: 'global' | 'workspace'
  ) => Promise<{ success: boolean; error?: string }>
  getGlossaryTerms: (
    scope: 'global' | 'workspace'
  ) => Promise<{ success: boolean; terms: any[]; error?: string }>
  updateGlossaryTerm: (
    id: number,
    translation: string | null,
    translationSource: string | null,
    isEnabled: number
  ) => Promise<{ success: boolean; error?: string }>
  toggleAllGlossaryTerms: (
    isEnabled: boolean,
    scope: 'global' | 'workspace'
  ) => Promise<{ success: boolean; error?: string }>
  translateGlossaryWithAI: (
    scope: 'global' | 'workspace'
  ) => Promise<{ success: boolean; error?: string }>

  onScanProgress: (
    callback: (data: {
      totalFiles: number
      scannedFiles: number
      currentFile: string | null
    }) => void
  ) => () => void
  onScanComplete: (callback: () => void) => () => void
  onQueueStatus: (callback: (status: string) => void) => () => void
  onQueueProgress: (
    callback: (stats: { total: number; pending: number; done: number; error: number }) => void
  ) => () => void
  onGlossaryStatus: (callback: (status: string) => void) => () => void
  onGlossaryProgress: (
    callback: (stats: { totalItems: number; completedItems: number; errorItems: number }) => void
  ) => () => void
  onQueueError: (callback: (error: string) => void) => () => void
  onQueueCooldown: (callback: (seconds: number) => void) => () => void
  onFileStatusChanged: (callback: (data: { fileId: number; status: string }) => void) => () => void
  injectVirtual: (
    workspacePath: string,
    fileId: number
  ) => Promise<{ success: boolean; content: string | null; error?: string }>
  commitSuture: (
    workspacePath: string,
    fileId: number,
    content: string
  ) => Promise<{ success: boolean; error?: string }>
  revokeApiKey: (provider: string) => Promise<{ success: boolean; error?: string }>
  testApiKey: (provider: string) => Promise<{ success: boolean; error?: string }>
  listModels: (provider: string) => Promise<{ id: string; name: string }[]>
  getProviderMeta: () => Promise<{
    cloudProviders: string[]
    localProviders: string[]
    defaultModels: Record<string, { id: string; name: string }[]>
    providerLabels: Record<string, string>
    localDefaults: Record<string, string>
  }>
  listWorkspaceFiles: (
    workspacePath: string
  ) => Promise<{ success: boolean; files: string[]; error?: string }>
  loadWorkspace: (workspacePath: string) => Promise<{
    success: boolean
    source: 'db' | 'fs'
    files: { id: number; file_path: string; status: string }[]
    error?: string
  }>
  getRecentWorkspaces: () => Promise<
    {
      id: number
      path: string
      name: string
      last_opened: string
      file_count: number
      intact_count: number
      translated_count: number
    }[]
  >
  removeRecentWorkspace: (path: string) => Promise<{ success: boolean }>

  // Logging
  getSessionLogs: (workspacePath?: string) => Promise<unknown[]>
  getGlobalLogs: () => Promise<unknown[]>
  clearSessionLogs: (workspacePath?: string) => Promise<{ success: boolean; cleared: number }>
  openLogsFolder: () => Promise<{ success: boolean }>
  getLogsFolder: () => Promise<string>
  onLogEntry: (callback: (entry: unknown) => void) => () => void

  // External Links
  openExternal: (url: string) => Promise<void>

  // App Info & Updates
  getVersion: () => Promise<string>
  checkForUpdates: () => Promise<{
    success: boolean
    updateAvailable?: boolean
    version?: string
    error?: string
  }>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SutraAPI
  }
}
