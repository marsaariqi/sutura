import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import Store from 'electron-store'
import {
  initLogger,
  getSessionLogs,
  getGlobalLogs,
  getLogsFolder,
  clearSessionLogFiles,
  clearSessionLogsForWorkspace,
  logInfo,
  logSuccess,
  logError,
  logWarn
} from './logger'
import {
  getDb,
  upsertFile,
  getAllFiles,
  getFileById,
  getTranslationsByFileId,
  clearFiles,
  updateFileStatus,
  getSetting,
  setSetting,
  getTranslationStats,
  getNodeTypeStats,
  getFileStats,
  deleteTranslationsForFile,
  insertTranslationsBatch,
  upsertRecentWorkspace,
  getRecentWorkspaces,
  removeRecentWorkspace,
  resetTranslationsForFile,
  getUsageSummary,
  getFileBackup,
  hasFileBackup,
  deleteFileBackup,
  removeStaleFiles,
  updateTranslationStatus,
  getFilesWithSegmentStatus,
  getGlossaryTerms,
  updateGlossaryTerm,
  toggleAllGlossaryTerms,
  getOrInsertWorkspaceId
} from './database'
import { analyzeFrequency } from './glossary-scanner'
import { storeApiKey, hasApiKey, removeApiKey, getApiKey } from './safe-storage'
import {
  extractNodes,
  collectAllFiles,
  initParser,
  filterNodesBySourceLanguage,
  splitMixedStringLiterals
} from './parser'
import { TaskRunner } from './task-runner'
import { injectTranslations, injectTranslationsVirtual } from './injector'
import { GeminiProvider } from './ai/gemini'
import { DeepSeekProvider } from './ai/deepseek'
import { OpenAIProvider } from './ai/openai'
import { AnthropicProvider } from './ai/anthropic'
import { OllamaProvider } from './ai/ollama'
import { LlamaCppProvider } from './ai/llamacpp'
import {
  type ProviderKey,
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  LOCAL_DEFAULTS
} from './ai/provider'

let taskRunner: TaskRunner | null = null
let activeWorkspaceId: number = 0

// Persistent preferences store (survives between sessions, independent of SQLite)
const prefStore = new Store({
  name: 'sutura-preferences',
  defaults: {
    lastProvider: 'gemini',
    lastModel: 'gemini-3.1-flash-lite-preview',
    lastWorkspacePath: ''
  }
})

export function getTaskRunner(): TaskRunner {
  if (!taskRunner) {
    taskRunner = new TaskRunner()
  }
  return taskRunner
}

/** Update recent workspace metadata from current DB state */
function refreshWorkspaceMetadata(workspaceId: number): void {
  const files = getAllFiles(workspaceId)
  if (files.length > 0) {
    const intactCount = files.filter((f) => f.status === 'intact').length
    const doneCount = files.filter((f) => f.status === 'done').length
    upsertRecentWorkspace(workspaceId, files.length, intactCount, doneCount)
  }
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const runner = getTaskRunner()
  runner.setWindow(mainWindow)

  // Initialize logging engine
  initLogger(mainWindow)

  // Log startup with full configuration
  {
    const provider = (getSetting('ai_provider') || 'gemini') as ProviderKey
    const model = getSetting('ai_model') || (DEFAULT_MODELS[provider]?.[0]?.id ?? 'default')
    const isLocal = LOCAL_PROVIDERS.includes(provider)
    const configured = isLocal ? true : hasApiKey(provider as Parameters<typeof hasApiKey>[0])

    // Performance & Logic Settings
    const batchSize = getSetting('batch_size') || '100'
    const rpm = getSetting('rpm') || '4'
    const srcLang = getSetting('source_language') || 'Chinese'
    const tgtLang = getSetting('target_language') || 'English'
    const temp = getSetting('temperature') || '0.3'

    // Primary Log: Core service initialization
    logInfo(`Sutura Core Initialized — Provider: ${PROVIDER_LABELS[provider]} [${model}]`, {
      metadata: {
        event: 'app:init',
        provider,
        model,
        configured,
        isLocal
      }
    })

    /**
     * Technical Profile Entry:
     * Quantitative log for performance monitoring and error correlation.
     */
    logInfo(
      `System Configuration — Batch: ${batchSize} | RPM: ${rpm} | Lang: ${srcLang}->${tgtLang} | Temp: ${temp}`,
      {
        metadata: {
          event: 'config:profile',
          provider,
          batchSize: parseInt(batchSize, 10),
          rpm: parseInt(rpm, 10),
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
          temperature: parseFloat(temp),
          isLocal
        }
      }
    )

    if (!configured) {
      logWarn(`Configuration Alert: API Key not found for ${PROVIDER_LABELS[provider]}`, {
        provider: 'system',
        metadata: { event: 'config:warning', provider }
      })
    }
  }

  // Initialize native tree-sitter parser
  try {
    initParser()
  } catch (err) {
    console.error('Failed to init tree-sitter:', err)
  }

  // --- Workspace ---

  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Workspace Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:scan', async (_event, workspacePath: string) => {
    try {
      activeWorkspaceId = getOrInsertWorkspaceId(workspacePath)
      runner.setActiveWorkspace(workspacePath, activeWorkspaceId)

      logInfo(`Scanning workspace: ${workspacePath}`, {
        workspacePath,
        metadata: { event: 'scan:start' }
      })

      // Get source language for filtering
      const sourceLanguage = getSetting('source_language') || ''
      const targetLanguage = getSetting('target_language') || 'English'
      const ignorePatterns = getSetting('ignore_patterns')

      // Collect all files from filesystem
      const allCollected = collectAllFiles(workspacePath, ignorePatterns)
      const currentPaths = allCollected.map((f) => f.path)

      // Get existing DB files for this workspace
      const existingFiles = getAllFiles(activeWorkspaceId)
      const existingPathSet = new Set(existingFiles.map((f) => f.file_path))

      // Remove stale files (deleted from disk) — cascades translations & backups
      removeStaleFiles(activeWorkspaceId, currentPaths)

      // Insert only NEW files (preserve existing file status & translations)
      const newFiles: typeof allCollected = []
      for (const f of allCollected) {
        if (!existingPathSet.has(f.path)) {
          upsertFile(activeWorkspaceId, f.path, f.supported ? 'pending' : 'unsupported')
          newFiles.push(f)
        }
      }

      // Scan files that are in 'pending' status (new files + any previously unfinished)
      const dbFiles = getAllFiles(activeWorkspaceId)
      const filesToScan = dbFiles.filter((f) => f.status === 'pending')
      let scannedCount = 0

      for (const file of filesToScan) {
        const fullPath = join(workspacePath, file.file_path)
        mainWindow.webContents.send('scan:progress', {
          totalFiles: filesToScan.length,
          scannedFiles: scannedCount,
          currentFile: file.file_path
        })

        try {
          const rawNodes = await extractNodes(fullPath)
          const splitNodes = splitMixedStringLiterals(rawNodes, sourceLanguage)
          const nodes = filterNodesBySourceLanguage(splitNodes, sourceLanguage)

          if (nodes.length > 0) {
            // Delete existing translations for this file (in case of re-scan)
            deleteTranslationsForFile(file.id)

            // Insert new translations
            insertTranslationsBatch(
              nodes.map((node) => ({
                file_id: file.id,
                line_start: node.lineStart,
                col_start: node.colStart,
                line_end: node.lineEnd,
                col_end: node.colEnd,
                node_type: node.nodeType,
                original_text: node.text,
                source_lang: sourceLanguage,
                target_lang: targetLanguage
              }))
            )

            updateFileStatus(file.id, 'scanned')
          } else {
            updateFileStatus(file.id, 'intact')
          }
        } catch (error) {
          console.error(`Error scanning ${file.file_path}:`, error)
          updateFileStatus(file.id, 'error')
        }

        scannedCount++
      }

      mainWindow.webContents.send('scan:progress', {
        totalFiles: filesToScan.length,
        scannedFiles: filesToScan.length,
        currentFile: null
      })

      mainWindow.webContents.send('scan:complete')

      // Persist recent workspace metadata
      refreshWorkspaceMetadata(activeWorkspaceId)

      logInfo(
        `Scan complete — ${dbFiles.length} files, ${newFiles.length} new, ${filesToScan.length} scanned`,
        {
          workspacePath,
          metadata: {
            event: 'scan:complete',
            totalFiles: dbFiles.length,
            newFiles: newFiles.length,
            scannedFiles: filesToScan.length
          }
        }
      )

      return {
        success: true,
        fileCount: dbFiles.length,
        newFiles: newFiles.length,
        scannedFiles: filesToScan.length
      }
    } catch (error) {
      console.error('Scan error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // --- Files ---

  ipcMain.handle('files:getAll', () => {
    return getAllFiles(activeWorkspaceId || undefined)
  })

  ipcMain.handle('files:getTranslations', (_event, fileId: number) => {
    return getTranslationsByFileId(fileId)
  })

  ipcMain.handle('files:getContent', (_event, workspacePath: string, filePath: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs')
    const fullPath = join(workspacePath, filePath)
    try {
      return readFileSync(fullPath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('files:revealInExplorer', (_event, workspacePath: string, filePath: string) => {
    const fullPath = join(workspacePath, filePath)
    shell.showItemInFolder(fullPath)
  })

  // --- Translation Queue ---

  ipcMain.handle('queue:start', () => {
    // Fire-and-forget: don't await so the IPC response returns immediately
    // and the renderer can track progress via IPC events
    runner.start().catch((error) => {
      console.error('Queue start error:', error)
    })
    return { success: true }
  })

  ipcMain.handle('queue:startSelected', (_event, fileIds: number[]) => {
    runner.startForFiles(fileIds).catch((error) => {
      console.error('Queue startSelected error:', error)
    })
    return { success: true }
  })

  ipcMain.handle('queue:pause', () => {
    runner.pause()
    return { success: true }
  })

  ipcMain.handle('queue:resume', () => {
    runner.resume()
    return { success: true }
  })

  ipcMain.handle('queue:stop', () => {
    runner.stop()
    return { success: true }
  })

  ipcMain.handle('queue:status', () => {
    return runner.getStatus()
  })

  ipcMain.handle('queue:stats', () => {
    return getTranslationStats(activeWorkspaceId || undefined)
  })

  // --- Injection ---

  ipcMain.handle('inject:file', async (_event, workspacePath: string, fileId: number) => {
    const file = getFileById(fileId)
    if (!file) return { success: false, error: 'File not found' }

    try {
      const translations = getTranslationsByFileId(fileId)
      const fullPath = join(workspacePath, file.file_path)
      await injectTranslations(fullPath, translations, fileId)
      updateFileStatus(fileId, 'done')
      refreshWorkspaceMetadata(activeWorkspaceId || getOrInsertWorkspaceId(workspacePath))
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('inject:all', async (_event, workspacePath: string, fileIds?: number[]) => {
    const workspaceId = activeWorkspaceId || getOrInsertWorkspaceId(workspacePath)
    const allFiles = getAllFiles(workspaceId)
    const files = fileIds ? allFiles.filter((f) => fileIds.includes(f.id)) : allFiles
    let injectedCount = 0
    let errorCount = 0

    for (const file of files) {
      try {
        const translations = getTranslationsByFileId(file.id)
        const doneTranslations = translations.filter((t) => t.status === 'done')
        if (doneTranslations.length > 0) {
          const fullPath = join(workspacePath, file.file_path)
          await injectTranslations(fullPath, translations, file.id)
          updateFileStatus(file.id, 'done')
          injectedCount++
        }
      } catch (error) {
        console.error(`Inject error for ${file.file_path}:`, error)
        errorCount++
      }
    }

    refreshWorkspaceMetadata(workspaceId)
    return { success: true, injectedCount, errorCount }
  })

  // --- Retry Translation ---

  ipcMain.handle('files:retryTranslation', (_event, fileId: number) => {
    try {
      resetTranslationsForFile(fileId)
      updateFileStatus(fileId, 'scanned')
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // --- Toggle segment exclusion ---

  ipcMain.handle(
    'translations:updateStatus',
    (_event, translationId: number, status: 'pending' | 'excluded') => {
      try {
        updateTranslationStatus(translationId, status)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // --- Settings ---

  ipcMain.handle('settings:get', (_event, key: string) => {
    return getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    const oldValue = getSetting(key)
    setSetting(key, value)
    // Mirror critical settings to electron-store for cross-session persistence
    if (key === 'ai_provider') prefStore.set('lastProvider', value)
    if (key === 'ai_model') prefStore.set('lastModel', value)

    // Log meaningful settings changes
    if (key === 'ai_provider' && oldValue !== value) {
      const providerLabel = PROVIDER_LABELS[value as ProviderKey] || value
      const isLocal = LOCAL_PROVIDERS.includes(value as ProviderKey)
      const configured = isLocal ? true : hasApiKey(value as Parameters<typeof hasApiKey>[0])
      logInfo(`Provider changed → ${providerLabel}`, {
        metadata: {
          event: 'settings:change',
          setting: 'ai_provider',
          oldValue,
          newValue: value,
          configured,
          isLocal
        }
      })
      if (!configured) {
        logWarn(`API key not configured for ${providerLabel}`, {
          metadata: { event: 'config:warning', provider: value }
        })
      }
    } else if (key === 'ai_model' && oldValue !== value) {
      const provider = (getSetting('ai_provider') || 'gemini') as ProviderKey
      logInfo(`Model changed → ${value || 'default'} (${PROVIDER_LABELS[provider]})`, {
        metadata: {
          event: 'settings:change',
          setting: 'ai_model',
          oldValue,
          newValue: value,
          provider
        }
      })
    } else if (key === 'system_prompt' && oldValue !== value) {
      logInfo(`AI System Prompt updated`, {
        metadata: {
          event: 'settings:change',
          setting: 'system_prompt',
          oldLength: oldValue?.length || 0,
          newLength: value.length,
          snippet: value
        }
      })
    } else if (key === 'batch_size' && oldValue !== value) {
      logInfo(`Batch size changed → ${value}`, {
        metadata: { event: 'settings:change', setting: 'batch_size', oldValue, newValue: value }
      })
    } else if (key === 'rpm' && oldValue !== value) {
      logInfo(`RPM limit changed → ${value}`, {
        metadata: { event: 'settings:change', setting: 'rpm', oldValue, newValue: value }
      })
    } else if (key === 'temperature' && oldValue !== value) {
      logInfo(`Temperature changed → ${value}`, {
        metadata: { event: 'settings:change', setting: 'temperature', oldValue, newValue: value }
      })
    } else if ((key === 'source_language' || key === 'target_language') && oldValue !== value) {
      logInfo(`${key === 'source_language' ? 'Source' : 'Target'} language changed → ${value}`, {
        metadata: { event: 'settings:change', setting: key, oldValue, newValue: value }
      })
    } else if (key === 'translation_scope' && oldValue !== value) {
      const labels: Record<string, string> = {
        all: 'All (Comments + String Literals)',
        comment: 'Comments Only',
        string_literal: 'String Literals Only'
      }
      logInfo(`Translation scope changed → ${labels[value] || value}`, {
        metadata: {
          event: 'settings:change',
          setting: 'translation_scope',
          oldValue,
          newValue: value
        }
      })
    }

    return { success: true }
  })

  ipcMain.handle('settings:getAll', () => {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM project_settings').all() as {
      key: string
      value: string
    }[]
    const settings: Record<string, string> = {}
    for (const row of rows) {
      // Don't send encrypted keys to renderer
      if (!row.key.includes('api_key_encrypted')) {
        settings[row.key] = row.value
      }
    }
    return settings
  })

  // --- API Keys ---

  ipcMain.handle('apiKey:store', (_event, provider: string, key: string) => {
    try {
      storeApiKey(provider as Parameters<typeof storeApiKey>[0], key)
      const label = PROVIDER_LABELS[provider as ProviderKey] || provider
      logSuccess(`API key saved for ${label}`, {
        provider: provider as ProviderKey,
        metadata: { event: 'apiKey:store', provider }
      })
      return { success: true }
    } catch (error) {
      logError(`Failed to save API key for ${provider}: ${(error as Error).message}`, {
        metadata: { event: 'apiKey:store', provider, error: (error as Error).message }
      })
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('apiKey:has', (_event, provider: string) => {
    if (['ollama', 'llamacpp'].includes(provider)) return true // local providers don't need keys
    return hasApiKey(provider as Parameters<typeof hasApiKey>[0])
  })

  ipcMain.handle('apiKey:get', (_event, provider: string) => {
    try {
      if (['ollama', 'llamacpp'].includes(provider)) return { success: true, key: '' }
      const key = getApiKey(provider as Parameters<typeof getApiKey>[0])
      return { success: true, key }
    } catch {
      return { success: true, key: '' }
    }
  })

  ipcMain.handle('apiKey:validate', async (_event, provider: string, key: string) => {
    const label = PROVIDER_LABELS[provider as ProviderKey] || provider
    logInfo(`Validating API key for ${label}...`, {
      provider: provider as ProviderKey,
      metadata: { event: 'apiKey:validate:start', provider }
    })
    try {
      let valid = false
      let endpoint = ''
      switch (provider) {
        case 'gemini':
          endpoint = 'generativelanguage.googleapis.com'
          valid = await new GeminiProvider(key).validateApiKey(key)
          break
        case 'deepseek':
          endpoint = 'api.deepseek.com'
          valid = await new DeepSeekProvider(key).validateApiKey(key)
          break
        case 'openai':
          endpoint = 'api.openai.com'
          valid = await new OpenAIProvider(key).validateApiKey(key)
          break
        case 'anthropic':
          endpoint = 'api.anthropic.com'
          valid = await new AnthropicProvider(key).validateApiKey(key)
          break
        case 'ollama': {
          const url = getSetting('ollama_base_url') || LOCAL_DEFAULTS.ollama
          endpoint = url
          valid = await OllamaProvider.checkConnection(url)
          break
        }
        case 'llamacpp': {
          const url = getSetting('llamacpp_base_url') || LOCAL_DEFAULTS.llamacpp
          endpoint = url
          valid = await LlamaCppProvider.checkConnection(url)
          break
        }
      }
      if (valid) {
        logSuccess(`API key valid for ${label}`, {
          provider: provider as ProviderKey,
          metadata: { event: 'apiKey:validate:success', provider, endpoint }
        })
      } else {
        logWarn(`API key invalid for ${label}`, {
          provider: provider as ProviderKey,
          metadata: { event: 'apiKey:validate:failed', provider, endpoint }
        })
      }
      return { valid }
    } catch (err) {
      logError(`API key validation error for ${label}: ${(err as Error).message}`, {
        provider: provider as ProviderKey,
        metadata: { event: 'apiKey:validate:error', provider, error: (err as Error).message }
      })
      return { valid: false }
    }
  })

  // --- Stats ---

  ipcMain.handle('stats:translations', () => {
    return getTranslationStats(activeWorkspaceId || undefined)
  })

  ipcMain.handle('stats:nodeTypes', () => {
    return getNodeTypeStats(activeWorkspaceId || undefined)
  })

  ipcMain.handle('stats:files', () => {
    return getFileStats(activeWorkspaceId || undefined)
  })

  ipcMain.handle('stats:pendingCount', () => {
    const stats = getTranslationStats(activeWorkspaceId || undefined)
    return stats.pending
  })

  ipcMain.handle('stats:usage', () => {
    return getUsageSummary()
  })

  ipcMain.handle('stats:usageLocal', () => {
    if (!activeWorkspaceId) return getUsageSummary()
    return getUsageSummary(activeWorkspaceId)
  })

  ipcMain.handle('stats:providerInfo', () => {
    const provider = (getSetting('ai_provider') || 'gemini') as ProviderKey
    const model = getSetting('ai_model') || (DEFAULT_MODELS[provider]?.[0]?.id ?? '')
    const isLocal = LOCAL_PROVIDERS.includes(provider)
    const hasKey = isLocal ? true : hasApiKey(provider as Parameters<typeof hasApiKey>[0])
    return { provider, model, hasKey }
  })

  ipcMain.handle(
    'stats:filesWithStatus',
    (_e, status: 'error' | 'excluded' | 'pending' | 'done') => {
      return getFilesWithSegmentStatus(status, activeWorkspaceId || undefined)
    }
  )

  // --- Glossary ---
  ipcMain.handle(
    'glossary:analyzeFrequency',
    async (_event, minFrequency: number, scope: 'global' | 'workspace') => {
      try {
        await analyzeFrequency(minFrequency, scope, activeWorkspaceId || undefined)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('glossary:getTerms', (_event, scope: 'global' | 'workspace') => {
    try {
      const wId = scope === 'global' ? 0 : activeWorkspaceId || 0
      return { success: true, terms: getGlossaryTerms(wId) }
    } catch (error) {
      return { success: false, terms: [], error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'glossary:updateTerm',
    (
      _event,
      id: number,
      translation: string | null,
      translationSource: string | null,
      isEnabled: number
    ) => {
      try {
        updateGlossaryTerm(id, translation, translationSource, isEnabled)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'glossary:toggleAll',
    (_event, isEnabled: boolean, scope: 'global' | 'workspace') => {
      try {
        const wId = scope === 'global' ? 0 : activeWorkspaceId || 0
        toggleAllGlossaryTerms(wId, isEnabled ? 1 : 0)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('glossary:translateWithAI', async (_event, scope: 'global' | 'workspace') => {
    try {
      await getTaskRunner().startGlossary(scope)
      return { success: true }
    } catch (error) {
      logError(`Glossary AI Error: ${(error as Error).message}`, {
        provider: 'system',
        metadata: { event: 'glossary:aiError' }
      })
      return { success: false, error: (error as Error).message }
    }
  })

  // --- Model List ---

  ipcMain.handle('models:list', async (_event, provider: string) => {
    const p = provider as ProviderKey
    // Cloud providers: try to fetch from API, fall back to defaults
    if (p === 'gemini') {
      try {
        const key = getApiKey('gemini')
        if (key) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=50`,
            { signal: AbortSignal.timeout(8000) }
          )
          if (res.ok) {
            const data = (await res.json()) as {
              models?: {
                name: string
                displayName: string
                supportedGenerationMethods?: string[]
              }[]
            }
            const generative = (data.models || []).filter(
              (m) =>
                m.supportedGenerationMethods?.includes('generateContent') &&
                m.name.startsWith('models/')
            )
            if (generative.length > 0) {
              return generative.map((m) => ({
                id: m.name.replace('models/', ''),
                name: m.displayName || m.name.replace('models/', '')
              }))
            }
          }
        }
      } catch {
        // fall through to defaults
      }
      return DEFAULT_MODELS.gemini
    }
    if (p === 'openai') {
      try {
        const key = getApiKey('openai')
        if (key) {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(8000)
          })
          if (res.ok) {
            const data = (await res.json()) as { data?: { id: string; owned_by?: string }[] }
            const chatModels = (data.data || [])
              .filter(
                (m) =>
                  m.id.startsWith('gpt-') || m.id.startsWith('o') || m.id.startsWith('chatgpt-')
              )
              .sort((a, b) => a.id.localeCompare(b.id))
            if (chatModels.length > 0) {
              return chatModels.map((m) => ({ id: m.id, name: m.id }))
            }
          }
        }
      } catch {
        // fall through
      }
      return DEFAULT_MODELS.openai
    }
    if (p === 'deepseek') {
      try {
        const key = getApiKey('deepseek')
        if (key) {
          const { default: OpenAI } = await import('openai')
          const client = new OpenAI({ apiKey: key, baseURL: 'https://api.deepseek.com' })
          const list = await client.models.list()
          const models: { id: string; name: string }[] = []
          for await (const m of list) {
            models.push({ id: m.id, name: m.id })
          }
          if (models.length > 0) return models
        }
      } catch {
        // fall through
      }
      return DEFAULT_MODELS.deepseek
    }
    if (p === 'anthropic') {
      // Anthropic doesn't have a public models list endpoint — use curated defaults
      return DEFAULT_MODELS.anthropic
    }
    // Local providers: fetch from server
    if (p === 'ollama') {
      const url = getSetting('ollama_base_url') || LOCAL_DEFAULTS.ollama
      return await OllamaProvider.fetchModels(url)
    }
    if (p === 'llamacpp') {
      const url = getSetting('llamacpp_base_url') || LOCAL_DEFAULTS.llamacpp
      return await LlamaCppProvider.fetchModels(url)
    }
    return []
  })

  ipcMain.handle('models:providerMeta', () => {
    return {
      cloudProviders: CLOUD_PROVIDERS,
      localProviders: LOCAL_PROVIDERS,
      defaultModels: DEFAULT_MODELS,
      providerLabels: PROVIDER_LABELS,
      localDefaults: LOCAL_DEFAULTS
    }
  })

  // --- Virtual Injection ---

  ipcMain.handle('inject:virtual', (_event, workspacePath: string, fileId: number) => {
    const file = getFileById(fileId)
    if (!file) return { success: false, error: 'File not found', content: null }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require('fs')
      const fullPath = join(workspacePath, file.file_path)
      const source = readFileSync(fullPath, 'utf-8')
      const translations = getTranslationsByFileId(fileId)
      const modified = injectTranslationsVirtual(source, translations)
      return { success: true, content: modified }
    } catch (error) {
      return { success: false, error: (error as Error).message, content: null }
    }
  })

  ipcMain.handle(
    'inject:commit',
    (_event, workspacePath: string, fileId: number, content: string) => {
      const file = getFileById(fileId)
      if (!file) return { success: false, error: 'File not found' }

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { readFileSync, writeFileSync } = require('fs')
        const fullPath = join(workspacePath, file.file_path)
        // Save backup of current content before overwriting
        const currentContent = readFileSync(fullPath, 'utf-8')
        const { saveFileBackup } = require('./database')
        saveFileBackup(fileId, currentContent)
        writeFileSync(fullPath, content, 'utf-8')
        updateFileStatus(fileId, 'done')
        refreshWorkspaceMetadata(activeWorkspaceId || getOrInsertWorkspaceId(workspacePath))
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // --- Revert Injection ---

  ipcMain.handle('inject:revert', (_event, workspacePath: string, fileId: number) => {
    const file = getFileById(fileId)
    if (!file) return { success: false, error: 'File not found' }

    const backup = getFileBackup(fileId)
    if (!backup) return { success: false, error: 'No backup found for this file' }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writeFileSync } = require('fs')
      const fullPath = join(workspacePath, file.file_path)
      writeFileSync(fullPath, backup, 'utf-8')
      deleteFileBackup(fileId)
      // Reset file status to 'translated' (translations are still done, just not injected)
      updateFileStatus(fileId, 'translated')
      refreshWorkspaceMetadata(activeWorkspaceId || getOrInsertWorkspaceId(workspacePath))
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('inject:hasBackup', (_event, fileId: number) => {
    return hasFileBackup(fileId)
  })

  // --- API Key Revoke ---

  ipcMain.handle('apiKey:revoke', (_event, provider: string) => {
    try {
      if (['ollama', 'llamacpp'].includes(provider)) return { success: true }
      removeApiKey(provider as Parameters<typeof removeApiKey>[0])
      const label = PROVIDER_LABELS[provider as ProviderKey] || provider
      logInfo(`API key revoked for ${label}`, {
        provider: provider as ProviderKey,
        metadata: { event: 'apiKey:revoke', provider }
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // --- API Key Test (stored key) ---

  ipcMain.handle('apiKey:test', async (_event, provider: string) => {
    const label = PROVIDER_LABELS[provider as ProviderKey] || provider
    logInfo(`Testing connection for ${label}...`, {
      provider: provider as ProviderKey,
      metadata: { event: 'apiKey:test:start', provider }
    })
    try {
      if (provider === 'ollama') {
        const url = getSetting('ollama_base_url') || LOCAL_DEFAULTS.ollama
        const valid = await OllamaProvider.checkConnection(url)
        if (valid) {
          logSuccess(`Ollama connection OK → ${url}`, {
            provider: 'ollama',
            metadata: { event: 'apiKey:test:success', provider, endpoint: url }
          })
        } else {
          logWarn(`Ollama connection failed → ${url}`, {
            provider: 'ollama',
            metadata: { event: 'apiKey:test:failed', provider, endpoint: url }
          })
        }
        return { success: valid, error: valid ? undefined : 'Cannot connect to Ollama server' }
      }
      if (provider === 'llamacpp') {
        const url = getSetting('llamacpp_base_url') || LOCAL_DEFAULTS.llamacpp
        const valid = await LlamaCppProvider.checkConnection(url)
        if (valid) {
          logSuccess(`llama.cpp connection OK → ${url}`, {
            provider: 'llamacpp',
            metadata: { event: 'apiKey:test:success', provider, endpoint: url }
          })
        } else {
          logWarn(`llama.cpp connection failed → ${url}`, {
            provider: 'llamacpp',
            metadata: { event: 'apiKey:test:failed', provider, endpoint: url }
          })
        }
        return { success: valid, error: valid ? undefined : 'Cannot connect to llama.cpp server' }
      }

      const key = getApiKey(provider as Parameters<typeof getApiKey>[0])
      if (!key) {
        logWarn(`No API key stored for ${label}`, {
          provider: provider as ProviderKey,
          metadata: { event: 'apiKey:test:nokey', provider }
        })
        return { success: false, error: 'No key stored' }
      }

      let valid = false
      switch (provider) {
        case 'gemini':
          valid = await new GeminiProvider(key).validateApiKey(key)
          break
        case 'deepseek':
          valid = await new DeepSeekProvider(key).validateApiKey(key)
          break
        case 'openai':
          valid = await new OpenAIProvider(key).validateApiKey(key)
          break
        case 'anthropic':
          valid = await new AnthropicProvider(key).validateApiKey(key)
          break
      }
      if (valid) {
        logSuccess(`API key test passed for ${label}`, {
          provider: provider as ProviderKey,
          metadata: { event: 'apiKey:test:success', provider }
        })
      } else {
        logWarn(`API key test failed for ${label}`, {
          provider: provider as ProviderKey,
          metadata: { event: 'apiKey:test:failed', provider }
        })
      }
      return { success: valid, error: valid ? undefined : 'Key validation failed' }
    } catch (error) {
      logError(`API key test error for ${label}: ${(error as Error).message}`, {
        provider: provider as ProviderKey,
        metadata: { event: 'apiKey:test:error', provider, error: (error as Error).message }
      })
      return { success: false, error: (error as Error).message }
    }
  })

  // --- Recent Workspaces ---

  ipcMain.handle('workspace:listFiles', (_event, workspacePath: string) => {
    try {
      const ignorePatterns = getSetting('ignore_patterns')
      const allFiles = collectAllFiles(workspacePath, ignorePatterns)
      return { success: true, files: allFiles.map((f) => f.path) }
    } catch (error) {
      return { success: false, files: [], error: (error as Error).message }
    }
  })

  ipcMain.handle('workspace:load', (_event, workspacePath: string) => {
    try {
      // Stop any running queue from previous workspace
      runner.stop()

      // Set active workspace for all scoped queries
      activeWorkspaceId = getOrInsertWorkspaceId(workspacePath)
      runner.setActiveWorkspace(workspacePath, activeWorkspaceId)

      // Persist last workspace in electron-store
      prefStore.set('lastWorkspacePath', workspacePath)

      // Load workspace-scoped files from DB
      const dbFiles = getAllFiles(activeWorkspaceId)
      if (dbFiles.length > 0) {
        // Update last_opened timestamp
        refreshWorkspaceMetadata(activeWorkspaceId)
        return { success: true, source: 'db', files: dbFiles }
      }

      // No DB data for this workspace — list from filesystem
      const ignorePatterns = getSetting('ignore_patterns')
      const allFiles = collectAllFiles(workspacePath, ignorePatterns)
      return {
        success: true,
        source: 'fs',
        files: allFiles.map((f, i) => ({
          id: -(i + 1),
          file_path: f.path,
          status: f.supported ? 'pending' : 'unsupported'
        }))
      }
    } catch (error) {
      return { success: false, source: 'fs', files: [], error: (error as Error).message }
    }
  })

  ipcMain.handle('workspace:recent', () => {
    return getRecentWorkspaces()
  })

  ipcMain.handle('workspace:removeRecent', (_event, path: string) => {
    // Clean up all DB data for this workspace (files, translations, backups cascade)
    const wId = getOrInsertWorkspaceId(path)
    clearFiles(wId)
    removeRecentWorkspace(path)
    return { success: true }
  })

  // --- Logging ---

  ipcMain.handle('logs:getSession', (_event, workspacePath?: string) => {
    return getSessionLogs(workspacePath || undefined)
  })

  ipcMain.handle('logs:getGlobal', () => {
    return getGlobalLogs()
  })

  ipcMain.handle('logs:clearSession', (_event, workspacePath?: string) => {
    if (workspacePath) {
      const cleared = clearSessionLogsForWorkspace(workspacePath)
      return { success: true, cleared }
    }
    const cleared = clearSessionLogFiles()
    return { success: true, cleared }
  })

  ipcMain.handle('logs:openFolder', () => {
    shell.openPath(getLogsFolder())
    return { success: true }
  })

  ipcMain.handle('logs:getFolder', () => {
    return getLogsFolder()
  })

  // --- Preferences (electron-store) ---

  ipcMain.handle('prefs:get', (_event, key: string) => {
    return prefStore.get(key)
  })

  ipcMain.handle('prefs:set', (_event, key: string, value: unknown) => {
    prefStore.set(key, value)
    return { success: true }
  })

  ipcMain.handle('prefs:getAll', () => {
    return prefStore.store
  })

  // --- External Links ---
  ipcMain.handle('openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // --- App Info & Updates ---
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  // Disable auto downloading
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      if (!app.isPackaged) {
        return { success: false, error: 'Auto-update is only available in the packaged app.' }
      }
      const result = await autoUpdater.checkForUpdates()
      if (result && result.updateInfo && result.updateInfo.version !== app.getVersion()) {
        return { success: true, updateAvailable: true, version: result.updateInfo.version }
      }
      return { success: true, updateAvailable: false }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('app:downloadUpdate', async () => {
    try {
      if (!app.isPackaged) return { success: false, error: 'Not packaged' }
      // This runs asynchronously
      autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Listen for when the download completes
  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message:
          'A new version of Sutura has been downloaded. Restart the application to apply the updates.',
        buttons: ['Restart Now', 'Later']
      })
      .then((res) => {
        if (res.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })
}
