import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Typed API for renderer
const api = {
  // Workspace
  selectWorkspace: (): Promise<string | null> => ipcRenderer.invoke('workspace:select'),
  scanWorkspace: (
    path: string
  ): Promise<{ success: boolean; fileCount?: number; error?: string }> =>
    ipcRenderer.invoke('workspace:scan', path),

  // Files
  getAllFiles: (): Promise<{ id: number; file_path: string; status: string }[]> =>
    ipcRenderer.invoke('files:getAll'),
  getTranslations: (
    fileId: number
  ): Promise<
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
  > => ipcRenderer.invoke('files:getTranslations', fileId),
  getFileContent: (workspacePath: string, filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('files:getContent', workspacePath, filePath),
  revealInExplorer: (workspacePath: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke('files:revealInExplorer', workspacePath, filePath),

  // Queue
  queueStart: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('queue:start'),
  queueSelectedFiles: (fileIds: number[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('queue:startSelected', fileIds),
  queuePause: (): Promise<{ success: boolean }> => ipcRenderer.invoke('queue:pause'),
  queueResume: (): Promise<{ success: boolean }> => ipcRenderer.invoke('queue:resume'),
  queueStop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('queue:stop'),
  queueStatus: (): Promise<{ isRunning: boolean; isPaused: boolean }> =>
    ipcRenderer.invoke('queue:status'),
  queueStats: (): Promise<{
    total: number
    pending: number
    done: number
    error: number
  }> => ipcRenderer.invoke('queue:stats'),

  // Injection
  injectFile: (
    workspacePath: string,
    fileId: number
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('inject:file', workspacePath, fileId),
  injectAll: (
    workspacePath: string,
    fileIds?: number[]
  ): Promise<{ success: boolean; injectedCount?: number; errorCount?: number }> =>
    ipcRenderer.invoke('inject:all', workspacePath, fileIds),
  revertInjection: (
    workspacePath: string,
    fileId: number
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('inject:revert', workspacePath, fileId),
  hasBackup: (fileId: number): Promise<boolean> => ipcRenderer.invoke('inject:hasBackup', fileId),

  // Retry
  retryTranslation: (fileId: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('files:retryTranslation', fileId),

  // Segment exclusion
  updateTranslationStatus: (
    translationId: number,
    status: 'pending' | 'excluded'
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('translations:updateStatus', translationId, status),

  // Settings
  getSetting: (key: string): Promise<string | undefined> => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: (): Promise<Record<string, string>> => ipcRenderer.invoke('settings:getAll'),

  // API Keys
  storeApiKey: (provider: string, key: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('apiKey:store', provider, key),
  hasApiKey: (provider: string): Promise<boolean> => ipcRenderer.invoke('apiKey:has', provider),
  getApiKey: (provider: string): Promise<{ success: boolean; key: string }> =>
    ipcRenderer.invoke('apiKey:get', provider),
  validateApiKey: (provider: string, key: string): Promise<{ valid: boolean }> =>
    ipcRenderer.invoke('apiKey:validate', provider, key),

  // Stats
  getTranslationStats: (): Promise<{
    total: number
    pending: number
    done: number
    error: number
    excluded: number
  }> => ipcRenderer.invoke('stats:translations'),
  getNodeTypeStats: (): Promise<{ comments: number; strings: number }> =>
    ipcRenderer.invoke('stats:nodeTypes'),
  getFileStats: (): Promise<{
    total: number
    intact: number
    scanned: number
    translating: number
    translated: number
    done: number
    error: number
    pending: number
    unsupported: number
  }> => ipcRenderer.invoke('stats:files'),
  getPendingCount: (): Promise<number> => ipcRenderer.invoke('stats:pendingCount'),
  getUsageSummary: (): Promise<{
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
  }> => ipcRenderer.invoke('stats:usage'),
  getUsageSummaryLocal: (): Promise<{
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
  }> => ipcRenderer.invoke('stats:usageLocal'),
  getProviderInfo: (): Promise<{ provider: string; model: string; hasKey: boolean }> =>
    ipcRenderer.invoke('stats:providerInfo'),
  getFilesWithSegmentStatus: (
    status: 'error' | 'excluded' | 'pending' | 'done'
  ): Promise<{ fileId: number; filePath: string; count: number }[]> =>
    ipcRenderer.invoke('stats:filesWithStatus', status),

  // Glossary
  analyzeFrequency: (
    minFrequency: number,
    scope: 'global' | 'workspace'
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('glossary:analyzeFrequency', minFrequency, scope),
  getGlossaryTerms: (
    scope: 'global' | 'workspace'
  ): Promise<{ success: boolean; terms: any[]; error?: string }> =>
    ipcRenderer.invoke('glossary:getTerms', scope),
  updateGlossaryTerm: (
    id: number,
    translation: string | null,
    translationSource: string | null,
    isEnabled: number
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('glossary:updateTerm', id, translation, translationSource, isEnabled),
  toggleAllGlossaryTerms: (
    isEnabled: boolean,
    scope: 'global' | 'workspace'
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('glossary:toggleAll', isEnabled, scope),
  translateGlossaryWithAI: (
    scope: 'global' | 'workspace'
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('glossary:translateWithAI', scope),

  // IPC event listeners (Main → Renderer)
  onScanProgress: (
    callback: (data: {
      totalFiles: number
      scannedFiles: number
      currentFile: string | null
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { totalFiles: number; scannedFiles: number; currentFile: string | null })
    ipcRenderer.on('scan:progress', handler)
    return (): void => {
      ipcRenderer.removeListener('scan:progress', handler)
    }
  },
  onScanComplete: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('scan:complete', handler)
    return (): void => {
      ipcRenderer.removeListener('scan:complete', handler)
    }
  },
  onQueueStatus: (callback: (status: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown): void =>
      callback(status as string)
    ipcRenderer.on('queue:status', handler)
    return (): void => {
      ipcRenderer.removeListener('queue:status', handler)
    }
  },
  onQueueProgress: (
    callback: (stats: { totalItems: number; completedItems: number; errorItems: number }) => void
  ) => {
    const handler = (_event: any, stats: any): void => callback(stats)
    ipcRenderer.on('queue:progress', handler)
    return (): void => {
      ipcRenderer.removeListener('queue:progress', handler)
    }
  },
  onGlossaryStatus: (callback: (status: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown): void =>
      callback(status as string)
    ipcRenderer.on('glossary:status', handler)
    return (): void => {
      ipcRenderer.removeListener('glossary:status', handler)
    }
  },
  onGlossaryProgress: (
    callback: (stats: { totalItems: number; completedItems: number; errorItems: number }) => void
  ) => {
    const handler = (_event: any, stats: any): void => callback(stats)
    ipcRenderer.on('glossary:progress', handler)
    return (): void => {
      ipcRenderer.removeListener('glossary:progress', handler)
    }
  },
  onQueueError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: unknown): void =>
      callback(error as string)
    ipcRenderer.on('queue:error', handler)
    return (): void => {
      ipcRenderer.removeListener('queue:error', handler)
    }
  },
  onQueueCooldown: (callback: (seconds: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, seconds: unknown): void =>
      callback(seconds as number)
    ipcRenderer.on('queue:cooldown', handler)
    return (): void => {
      ipcRenderer.removeListener('queue:cooldown', handler)
    }
  },
  onFileStatusChanged: (callback: (data: { fileId: number; status: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { fileId: number; status: string })
    ipcRenderer.on('file:statusChanged', handler)
    return (): void => {
      ipcRenderer.removeListener('file:statusChanged', handler)
    }
  },

  // Virtual Injection
  injectVirtual: (
    workspacePath: string,
    fileId: number
  ): Promise<{ success: boolean; content: string | null; error?: string }> =>
    ipcRenderer.invoke('inject:virtual', workspacePath, fileId),
  commitSuture: (
    workspacePath: string,
    fileId: number,
    content: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('inject:commit', workspacePath, fileId, content),

  // API Key management
  revokeApiKey: (provider: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('apiKey:revoke', provider),
  testApiKey: (provider: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('apiKey:test', provider),

  // Model list
  listModels: (provider: string): Promise<{ id: string; name: string }[]> =>
    ipcRenderer.invoke('models:list', provider),
  getProviderMeta: (): Promise<{
    cloudProviders: string[]
    localProviders: string[]
    defaultModels: Record<string, { id: string; name: string }[]>
    providerLabels: Record<string, string>
    localDefaults: Record<string, string>
  }> => ipcRenderer.invoke('models:providerMeta'),

  // Recent Workspaces
  listWorkspaceFiles: (
    workspacePath: string
  ): Promise<{ success: boolean; files: string[]; error?: string }> =>
    ipcRenderer.invoke('workspace:listFiles', workspacePath),
  loadWorkspace: (
    workspacePath: string
  ): Promise<{
    success: boolean
    source: 'db' | 'fs'
    files: { id: number; file_path: string; status: string }[]
    error?: string
  }> => ipcRenderer.invoke('workspace:load', workspacePath),
  getRecentWorkspaces: (): Promise<
    {
      id: number
      path: string
      name: string
      last_opened: string
      file_count: number
      intact_count: number
      translated_count: number
    }[]
  > => ipcRenderer.invoke('workspace:recent'),
  removeRecentWorkspace: (path: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('workspace:removeRecent', path),

  // Logging
  getSessionLogs: (workspacePath?: string): Promise<unknown[]> =>
    ipcRenderer.invoke('logs:getSession', workspacePath),
  getGlobalLogs: (): Promise<unknown[]> => ipcRenderer.invoke('logs:getGlobal'),
  clearSessionLogs: (workspacePath?: string): Promise<{ success: boolean; cleared: number }> =>
    ipcRenderer.invoke('logs:clearSession', workspacePath),
  openLogsFolder: (): Promise<{ success: boolean }> => ipcRenderer.invoke('logs:openFolder'),
  getLogsFolder: (): Promise<string> => ipcRenderer.invoke('logs:getFolder'),
  onLogEntry: (callback: (entry: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: unknown): void => callback(entry)
    ipcRenderer.on('log:entry', handler)
    return (): void => {
      ipcRenderer.removeListener('log:entry', handler)
    }
  },

  // Preferences (electron-store)
  getPref: (key: string): Promise<unknown> => ipcRenderer.invoke('prefs:get', key),
  setPref: (key: string, value: unknown): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('prefs:set', key, value),
  getAllPrefs: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('prefs:getAll'),
  // External Links
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('openExternal', url),

  // App Info & Updates
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: (): Promise<{
    success: boolean
    updateAvailable?: boolean
    version?: string
    error?: string
  }> => ipcRenderer.invoke('app:checkForUpdates'),
  downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:downloadUpdate')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
