import { BrowserWindow } from 'electron'
import { performance } from 'perf_hooks'
import {
  getPendingTranslations,
  getPendingTranslationsForFiles,
  updateTranslationResult,
  markBatchError,
  getSetting,
  getTranslationStats,
  getTranslationStatsForFiles,
  updateFileStatus,
  isFileFullyTranslated,
  fileHasErrors,
  getFileIdFromTranslation,
  recordUsage,
  getGlossaryTerms,
  updateGlossaryTerm
} from './database'
import { getApiKey } from './safe-storage'
import {
  AIProvider,
  TranslationBatch,
  ProviderKey,
  buildPrompt,
  getSystemPrompt,
  UsageStats
} from './ai/provider'
import { GeminiProvider, GEMINI_MODEL } from './ai/gemini'
import { DeepSeekProvider, DEEPSEEK_MODEL } from './ai/deepseek'
import { OpenAIProvider } from './ai/openai'
import { AnthropicProvider } from './ai/anthropic'
import { OllamaProvider } from './ai/ollama'
import { LlamaCppProvider } from './ai/llamacpp'
import {
  logInfo,
  logSuccess,
  logBurstStart,
  logBurstComplete,
  logCooldownStart,
  logCooldownReset,
  logApiRequest,
  logApiResponse,
  logApiError,
  logError,
  type LogProvider
} from './logger'

export class TaskRunner {
  private isPaused = false
  private isRunning = false
  private abortController: AbortController | null = null
  private window: BrowserWindow | null = null
  private activeWorkspace: string | null = null
  private activeWorkspaceId: number = 0

  private batchCounter = 0

  private isGlossaryRunning = false
  private isGlossaryPaused = false
  private glossaryAbortController: AbortController | null = null
  private glossaryBatchCounter = 0

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  setActiveWorkspace(path: string | null, id: number = 0): void {
    this.activeWorkspace = path
    this.activeWorkspaceId = id
  }

  private emit(channel: string, data?: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  private getProvider(temperature?: number): AIProvider {
    const provider = (getSetting('ai_provider') || 'gemini') as ProviderKey
    const model = getSetting('ai_model') || ''

    switch (provider) {
      case 'openai': {
        const apiKey = getApiKey('openai')
        if (!apiKey) throw new Error('No API key configured for OpenAI')
        return new OpenAIProvider(apiKey, model || undefined, temperature)
      }
      case 'anthropic': {
        const apiKey = getApiKey('anthropic')
        if (!apiKey) throw new Error('No API key configured for Anthropic')
        return new AnthropicProvider(apiKey, model || undefined, temperature)
      }
      case 'deepseek': {
        const apiKey = getApiKey('deepseek')
        if (!apiKey) throw new Error('No API key configured for DeepSeek')
        return new DeepSeekProvider(apiKey, model || undefined, temperature)
      }
      case 'ollama': {
        const baseUrl = getSetting('ollama_base_url') || 'http://localhost:11434'
        return new OllamaProvider(baseUrl, model || undefined, temperature)
      }
      case 'llamacpp': {
        const baseUrl = getSetting('llamacpp_base_url') || 'http://localhost:8080'
        return new LlamaCppProvider(baseUrl, model || undefined, temperature)
      }
      case 'gemini':
      default: {
        const apiKey = getApiKey('gemini')
        if (!apiKey) throw new Error('No API key configured for Gemini')
        return new GeminiProvider(apiKey, model || undefined, temperature)
      }
    }
  }

  private getProviderMeta(): { endpoint: string; model: string; apiKey: string } {
    const provider = (getSetting('ai_provider') || 'gemini') as ProviderKey
    const model = getSetting('ai_model') || ''

    switch (provider) {
      case 'openai':
        return {
          endpoint: 'https://api.openai.com/v1/chat/completions',
          model: model || 'gpt-4.1-nano',
          apiKey: getApiKey('openai') || ''
        }
      case 'anthropic':
        return {
          endpoint: 'https://api.anthropic.com/v1/messages',
          model: model || 'claude-sonnet-4-20250514',
          apiKey: getApiKey('anthropic') || ''
        }
      case 'deepseek':
        return {
          endpoint: 'https://api.deepseek.com/chat/completions',
          model: model || DEEPSEEK_MODEL,
          apiKey: getApiKey('deepseek') || ''
        }
      case 'ollama': {
        const baseUrl = getSetting('ollama_base_url') || 'http://localhost:11434'
        return {
          endpoint: `${baseUrl}/v1/chat/completions`,
          model: model || 'llama3',
          apiKey: ''
        }
      }
      case 'llamacpp': {
        const baseUrl = getSetting('llamacpp_base_url') || 'http://localhost:8080'
        return {
          endpoint: `${baseUrl}/v1/chat/completions`,
          model: model || 'default',
          apiKey: ''
        }
      }
      case 'gemini':
      default:
        return {
          endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model || GEMINI_MODEL}:generateContent`,
          model: model || GEMINI_MODEL,
          apiKey: getApiKey('gemini') || ''
        }
    }
  }

  /** Obscure API key for logging: show first 4 chars + redacted */
  private obscureKey(key: string): string {
    if (!key || key.length < 8) return '***SUTURA***'
    return key.slice(0, 4) + '****' + key.slice(-4)
  }

  async start(): Promise<void> {
    return this.runQueue()
  }

  async startForFiles(fileIds: number[]): Promise<void> {
    return this.runQueue(fileIds)
  }

  private async runQueue(fileIds?: number[]): Promise<void> {
    if (this.isRunning) return

    this.isRunning = true
    this.isPaused = false
    this.abortController = new AbortController()
    this.batchCounter = 0

    this.emit('queue:status', 'running')

    try {
      const batchSize = parseInt(getSetting('batch_size') || '10', 10)
      const rpm = parseInt(getSetting('rpm') || '4', 10)
      const targetLanguage = getSetting('target_language') || 'English'
      const sourceLanguage = getSetting('source_language') || ''
      const userTemperature = parseFloat(getSetting('temperature') || '0.3')

      const translationScope = (getSetting('translation_scope') || 'all') as
        | 'all'
        | 'comment'
        | 'string_literal'

      // Compute an accurate total for the chosen translation scope by scanning pending items
      const allPendingForScope = fileIds
        ? getPendingTranslationsForFiles(fileIds, 6000000, 0)
        : getPendingTranslations(6000000, 0, this.activeWorkspaceId || undefined)

      const matchesScope = (t: { node_type: string }) => {
        if (translationScope === 'all') return true
        if (translationScope === 'comment') return t.node_type === 'COMMENT'
        return t.node_type === 'STRING_LITERAL'
      }

      const queueTotal = allPendingForScope.filter(matchesScope).length
      let queueCompleted = 0
      let queueErrors = 0

      this.emit('queue:progress', {
        totalItems: queueTotal,
        completedItems: 0,
        errorItems: 0
      })

      logInfo(`Translation queue started — ${queueTotal} items pending`, {
        provider: (getSetting('ai_provider') || 'gemini') as LogProvider,
        workspacePath: this.activeWorkspace,
        metadata: { event: 'queue:start', queueTotal, batchSize, rpm, translationScope }
      })

      // Initialize burst token counters
      let burstInput = 0
      let burstOutput = 0
      let burstTotal = 0

      const QStartTime = performance.now()
      while (true) {
        if (this.abortController.signal.aborted) break

        // Fetch a large pool to organize into a global queue (per-iteration)
        const rawPending = fileIds
          ? getPendingTranslationsForFiles(fileIds, 6000000, 0)
          : getPendingTranslations(6000000, 0, this.activeWorkspaceId || undefined)

        // Apply translation_scope filter to this iteration's pool
        const pendingPool = rawPending.filter(matchesScope)

        if (pendingPool.length === 0) break

        // 1. ORGANIZE: Group by type so it can handle them per batch
        const stringItems = pendingPool.filter((t) => t.node_type === 'STRING_LITERAL')
        const commentItems = pendingPool.filter((t) => t.node_type === 'COMMENT')

        // 2. CHUNK: Create a global list of batches
        const globalBatchQueue: { items: typeof rawPending; temp: number }[] = []

        for (let i = 0; i < stringItems.length; i += batchSize) {
          globalBatchQueue.push({ items: stringItems.slice(i, i + batchSize), temp: 0.0 })
        }
        for (let i = 0; i < commentItems.length; i += batchSize) {
          globalBatchQueue.push({
            items: commentItems.slice(i, i + batchSize),
            temp: userTemperature
          })
        }

        // 3. EXECUTE: Take exactly 'RPM' batches from the global queue
        const burstLimit = globalBatchQueue.slice(0, rpm)
        logBurstStart(burstLimit.length, batchSize, this.activeWorkspace)

        const burstPromises = burstLimit.map(async (batchData) => {
          const batchId = ++this.batchCounter
          const startTime = performance.now()

          const result = await this.processBatch(
            batchData.items,
            targetLanguage,
            sourceLanguage,
            batchData.temp,
            batchId,
            startTime
          )

          // Local accumulation for the burst log
          queueCompleted += result.done
          queueErrors += result.errors

          // Now emit using your specific interface keys
          this.emit('queue:progress', {
            totalItems: queueTotal, // Dashboard expects totalItems
            completedItems: queueCompleted, // Dashboard expects completedItems
            errorItems: queueErrors // Dashboard expects errorItems
          })
          return result
        })

        const burstResults = await Promise.all(burstPromises)

        // Sum up tokens from all batches in this burst
        burstResults.forEach((res) => {
          if (res.usage) {
            burstInput += res.usage.inputTokens
            burstOutput += res.usage.outputTokens
            burstTotal += res.usage.totalTokens
          }
        })

        // Log completion with the summed tokens
        logBurstComplete(queueCompleted, queueErrors, this.activeWorkspace)

        // 4. COOLDOWN: check if there are more items for the selected scope
        const nextPool = fileIds
          ? getPendingTranslationsForFiles(fileIds, 6000000, 0)
          : getPendingTranslations(6000000, 0, this.activeWorkspaceId || undefined)
        const hasMore = nextPool.filter(matchesScope).length > 0

        if (hasMore && !this.abortController.signal.aborted) {
          logCooldownStart(3, this.activeWorkspace)
          for (let sec = 3; sec > 0; sec--) {
            if (this.abortController.signal.aborted) break
            while (this.isPaused) {
              if (this.abortController.signal.aborted) break
              await new Promise((r) => setTimeout(r, 200))
            }
            this.emit('queue:cooldown', sec)
            await new Promise((r) => setTimeout(r, 1000))
          }
          this.emit('queue:cooldown', 0)
          logCooldownReset(this.activeWorkspace)
        } else {
          break
        }
      }

      // 5. FINAL LOG: Query DB for the actual current state
      const finalStats = fileIds
        ? getTranslationStatsForFiles(fileIds)
        : getTranslationStats(this.activeWorkspaceId || undefined)

      const durationQ = Math.round(performance.now() - QStartTime)

      const tokenMsg = burstTotal
        ? ` | Tokens: ${burstTotal} [In: ${burstInput}, Out: ${burstOutput}]`
        : ''
      const timing = durationQ
        ? durationQ >= 1000
          ? ` — [${(durationQ / 1000).toFixed(3)}s | ${durationQ}ms]`
          : ` — [${durationQ}ms]`
        : ''

      this.emit('queue:status', 'done')
      logSuccess(
        `Queue completed — ${finalStats.done} total items done, ${finalStats.error} remaining errors${tokenMsg}${timing}`,
        {
          provider: (getSetting('ai_provider') || 'gemini') as LogProvider,
          workspacePath: this.activeWorkspace,
          metadata: {
            event: 'queue:done',
            ...finalStats,
            usage: { inputTokens: burstInput, outputTokens: burstOutput, totalTokens: burstTotal },
            queueDuration: durationQ
          }
        }
      )
    } catch (error) {
      console.error('TaskRunner error:', error)
      logError(`Queue error — ${(error as Error).message}`, {
        provider: (getSetting('ai_provider') || 'gemini') as LogProvider,
        workspacePath: this.activeWorkspace
      })
      this.emit('queue:status', 'error')
      this.emit('queue:error', (error as Error).message)
    } finally {
      this.isRunning = false
      this.abortController = null
    }
  }

  private async processBatch(
    items: { id: number; node_type: 'COMMENT' | 'STRING_LITERAL'; original_text: string }[],
    targetLanguage: string,
    sourceLanguage: string,
    temperature: number,
    batchId: number,
    startTime: number
  ): Promise<{ done: number; errors: number; usage?: UsageStats }> {
    const provider = this.getProvider(temperature)
    const providerName = (getSetting('ai_provider') || 'gemini') as LogProvider

    // --- Glossary Integration ---
    let activeGlossary: Record<string, string> | undefined = undefined
    const glossaryUsage = getSetting('glossary_usage') || 'none'
    const glossaryTargetLang = getSetting('glossary_target_language') || 'English'

    if (glossaryUsage !== 'none' && glossaryTargetLang === targetLanguage) {
      const scope = glossaryUsage === 'global' ? 0 : this.activeWorkspaceId || 0
      const terms = getGlossaryTerms(scope).filter((t) => t.is_enabled === 0 && t.translation)

      if (terms.length > 0) {
        const batchOriginalTexts = items.map((it) => it.original_text).join(' ')
        const matchedTerms: Record<string, string> = {}

        for (const t of terms) {
          if (batchOriginalTexts.includes(t.term)) {
            matchedTerms[t.term] = t.translation!
          }
        }

        if (Object.keys(matchedTerms).length > 0) {
          activeGlossary = matchedTerms
        }
      }
    }

    // 1. Build the batch object for the provider
    const batch: TranslationBatch = {
      items: items.map((t) => ({
        id: t.id,
        nodeType: t.node_type,
        originalText: t.original_text
      })),
      targetLanguage,
      sourceLanguage: sourceLanguage || undefined,
      nodeType: items[0]?.node_type,
      glossary: activeGlossary
    }

    const batchIds = items.map((t) => t.id)
    const meta = this.getProviderMeta()

    let retries = 0
    const maxRetries = 3
    let success = false
    let doneCount = 0
    let errorCount = 0

    let lastUsage: UsageStats | undefined = undefined

    while (retries <= maxRetries && !success) {
      if (this.abortController?.signal.aborted) break

      try {
        // 2. Generate the actual strings being sent
        const prompt = buildPrompt(batch)
        const systemPrompt = getSystemPrompt()

        // 3. Reconstruct the FULL Request Payload for the log
        // This ensures your "Request Payload (Raw)" in the UI shows everything
        let fullRequestPayload: any = {
          endpoint: meta.endpoint,
          model: meta.model,
          apiKey: this.obscureKey(meta.apiKey),
          temperature,
          batchId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          itemsCount: items.length
        }

        // 4. Log the FULL request
        logApiRequest(
          providerName,
          items.length,
          items[0]?.node_type || 'MIXED',
          this.activeWorkspace,
          fullRequestPayload, // Now passing the object with the prompt/systemPrompt
          batchId
        )

        // --- TPS CALCULATION START ---
        const requestStartTime = performance.now()
        const result = await provider.translate(batch)
        const requestEndTime = performance.now()
        // --- TPS CALCULATION END ---
        // console.log('res: {}', result)

        lastUsage = result.usage

        for (const item of result.items) {
          updateTranslationResult(
            item.id,
            item.translatedText,
            'done',
            sourceLanguage,
            targetLanguage
          )
        }
        doneCount = result.items.length

        if (result.usage) {
          recordUsage(
            result.usage.provider,
            result.usage.model,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.totalTokens,
            this.activeWorkspaceId || 0
          )
        }

        if (result.errors.length > 0) {
          markBatchError(result.errors.map((e) => e.id))
          errorCount = result.errors.length
        }

        const duration = Math.round(performance.now() - startTime)
        const batchDuration = requestEndTime - requestStartTime

        // --- Calculate Raw TPS ---
        let rawTps = 0
        if (result.usage && result.usage.outputTokens > 0 && batchDuration > 0) {
          // Tokens per ms * 1000 = Tokens per second
          rawTps = result.usage.outputTokens / (batchDuration / 1000)
        }

        logApiResponse(
          providerName,
          doneCount,
          errorCount,
          this.activeWorkspace,
          result.usage
            ? {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens
              }
            : undefined,
          {
            results: result.items.map((item) => ({
              id: item.id,
              tr: item.translatedText
            })),
            errors: result.errors.length > 0 ? result.errors : undefined,
            usage: result.usage
              ? {
                  provider: result.usage.provider,
                  model: result.usage.model,
                  inputTokens: result.usage.inputTokens,
                  outputTokens: result.usage.outputTokens,
                  totalTokens: result.usage.totalTokens
                }
              : undefined
          },
          batchId,
          duration,
          rawTps
        )

        // Check if any files are now fully translated and update their status
        const affectedFileIds = new Set<number>()
        for (const item of items) {
          const fileId = getFileIdFromTranslation(item.id)
          if (fileId !== null) affectedFileIds.add(fileId)
        }
        for (const fileId of affectedFileIds) {
          if (fileHasErrors(fileId)) {
            updateFileStatus(fileId, 'error')
            this.emit('file:statusChanged', { fileId, status: 'error' })
          } else if (isFileFullyTranslated(fileId)) {
            updateFileStatus(fileId, 'translated')
            this.emit('file:statusChanged', { fileId, status: 'translated' })
          }
        }

        success = true
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string }
        const errMeta = { endpoint: meta.endpoint, model: meta.model, batchSize: items.length }
        if (err.status === 429 && retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000
          console.warn(`Rate limited, retrying in ${delay}ms...`)
          logApiError(providerName, `Rate limited (429)`, this.activeWorkspace, retries, errMeta)
          retries++
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else if (retries < maxRetries) {
          retries++
          const delay = Math.pow(2, retries) * 1000
          console.warn(`Batch error: ${err.message || 'Unknown'}, retrying in ${delay}ms...`)
          logApiError(
            providerName,
            err.message || 'Unknown error',
            this.activeWorkspace,
            retries,
            errMeta
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          console.error(`Batch failed after ${maxRetries} retries:`, err.message)
          logApiError(
            providerName,
            `Final failure after ${maxRetries} retries: ${err.message}`,
            this.activeWorkspace,
            undefined,
            errMeta
          )
          markBatchError(batchIds)
          errorCount = batchIds.length

          // Check if any files are now fully processed and update their status
          const affectedFileIds = new Set<number>()
          for (const item of items) {
            const fileId = getFileIdFromTranslation(item.id)
            if (fileId !== null) affectedFileIds.add(fileId)
          }
          for (const fileId of affectedFileIds) {
            if (fileHasErrors(fileId)) {
              updateFileStatus(fileId, 'error')
              this.emit('file:statusChanged', { fileId, status: 'error' })
            } else if (isFileFullyTranslated(fileId)) {
              updateFileStatus(fileId, 'translated')
              this.emit('file:statusChanged', { fileId, status: 'translated' })
            }
          }

          success = true // Don't halt — continue with next batch
        }
      }
    }

    return { done: doneCount, errors: errorCount, usage: lastUsage }
  }

  async startGlossary(scope: 'global' | 'workspace'): Promise<void> {
    return this.runGlossaryQueue(scope)
  }

  private async runGlossaryQueue(scope: 'global' | 'workspace'): Promise<void> {
    if (this.isGlossaryRunning) return

    this.isGlossaryRunning = true
    this.isGlossaryPaused = false
    this.glossaryAbortController = new AbortController()
    this.glossaryBatchCounter = 0

    // Do NOT emit queue:status running for glossary as it might affect main segment UI
    // We rely entirely on the frontend's local isGlossaryTranslating state

    try {
      const batchSize = parseInt(getSetting('batch_size') || '20', 10)
      const rpm = parseInt(getSetting('rpm_limit') || getSetting('rpm') || '10', 10)
      const targetLang = getSetting('glossary_target_language') || 'English'
      const sourceLang = getSetting('glossary_source_language') || 'Chinese'

      const workspaceId = scope === 'global' ? 0 : this.activeWorkspaceId || 0

      const allPendingTerms = getGlossaryTerms(workspaceId).filter(
        (t) => t.is_enabled === 0 && !t.translation
      )

      const queueTotal = allPendingTerms.length
      let queueCompleted = 0
      let queueErrors = 0

      this.emit('glossary:progress', {
        totalItems: queueTotal,
        completedItems: 0,
        errorItems: 0
      })

      if (queueTotal === 0) {
        return
      }

      logInfo(`Glossary translation queue started — ${queueTotal} terms pending`, {
        provider: (getSetting('ai_provider') || 'gemini') as LogProvider,
        workspacePath: this.activeWorkspace,
        metadata: { event: 'glossary:start', scope, queueTotal, batchSize, rpm }
      })

      let burstInput = 0
      let burstOutput = 0
      let burstTotal = 0

      const QStartTime = performance.now()

      while (true) {
        if (this.glossaryAbortController.signal.aborted) break

        const pendingPool = getGlossaryTerms(workspaceId).filter(
          (t) => t.is_enabled === 0 && !t.translation
        )

        if (pendingPool.length === 0) break

        const globalBatchQueue: { items: typeof pendingPool }[] = []
        for (let i = 0; i < pendingPool.length; i += batchSize) {
          globalBatchQueue.push({ items: pendingPool.slice(i, i + batchSize) })
        }

        const burstLimit = globalBatchQueue.slice(0, rpm)
        logBurstStart(burstLimit.length, batchSize, this.activeWorkspace)

        const burstPromises = burstLimit.map(async (batchData) => {
          const batchId = ++this.glossaryBatchCounter
          const startTime = performance.now()

          const result = await this.processGlossaryBatch(
            batchData.items,
            targetLang,
            sourceLang,
            batchId,
            startTime
          )

          queueCompleted += result.done
          queueErrors += result.errors

          this.emit('glossary:progress', {
            totalItems: queueTotal,
            completedItems: queueCompleted,
            errorItems: queueErrors
          })
          return result
        })

        const burstResults = await Promise.all(burstPromises)

        burstResults.forEach((res) => {
          if (res.usage) {
            burstInput += res.usage.inputTokens
            burstOutput += res.usage.outputTokens
            burstTotal += res.usage.totalTokens
          }
        })

        logBurstComplete(queueCompleted, queueErrors, this.activeWorkspace)

        const nextPool = getGlossaryTerms(workspaceId).filter(
          (t) => t.is_enabled === 0 && !t.translation
        )
        const hasMore = nextPool.length > 0

        if (hasMore && !this.glossaryAbortController.signal.aborted) {
          logCooldownStart(3, this.activeWorkspace)
          for (let sec = 3; sec > 0; sec--) {
            if (this.glossaryAbortController.signal.aborted) break
            while (this.isGlossaryPaused) {
              if (this.glossaryAbortController.signal.aborted) break
              await new Promise((r) => setTimeout(r, 200))
            }
            await new Promise((r) => setTimeout(r, 1000))
          }
          logCooldownReset(this.activeWorkspace)
        } else {
          break
        }
      }

      const durationQ = Math.round(performance.now() - QStartTime)
      const tokenMsg = burstTotal
        ? ` | Tokens: ${burstTotal} [In: ${burstInput}, Out: ${burstOutput}]`
        : ''
      const timing =
        durationQ >= 1000
          ? ` — [${(durationQ / 1000).toFixed(3)}s | ${durationQ}ms]`
          : ` — [${durationQ}ms]`

      logSuccess(
        `Glossary queue completed — ${queueCompleted} translated, ${queueErrors} errors${tokenMsg}${timing}`,
        {
          provider: (getSetting('ai_provider') || 'gemini') as LogProvider,
          workspacePath: this.activeWorkspace,
          metadata: {
            event: 'glossary:done',
            scope,
            done: queueCompleted,
            error: queueErrors,
            usage: { inputTokens: burstInput, outputTokens: burstOutput, totalTokens: burstTotal },
            queueDuration: durationQ
          }
        }
      )
    } catch (error) {
      console.error('TaskRunner glossary error:', error)
      logError(`Glossary queue error — ${(error as Error).message}`, {
        provider: (getSetting('ai_provider') || 'gemini') as LogProvider,
        workspacePath: this.activeWorkspace
      })
      throw error // Propagate to IPC handler
    } finally {
      this.isGlossaryRunning = false
      this.glossaryAbortController = null
    }
  }

  private async processGlossaryBatch(
    items: { id: number; term: string }[],
    targetLang: string,
    sourceLang: string,
    batchId: number,
    startTime: number
  ): Promise<{ done: number; errors: number; usage?: UsageStats }> {
    const providerName = (getSetting('ai_provider') || 'gemini') as LogProvider
    const provider = this.getProvider(0.1)
    const meta = this.getProviderMeta()

    let retries = 0
    const maxRetries = 3
    let success = false
    let doneCount = 0
    let errorCount = 0
    let lastUsage: UsageStats | undefined = undefined

    const sysPrompt = `You are a professional software localization expert. 
Your task is to translate technical glossary terms from ${sourceLang} to ${targetLang}.

INPUT FORMAT
You will receive a JSON object with an "entries" array. Each entry contains:
- "id": A unique identifier (must be preserved in your response).
- "og": The original technical term in ${sourceLang}.

OUTPUT FORMAT
Return ONLY a valid JSON object. No prose, no markdown blocks, no chatter.
The structure must be:
{
  "results": [
    { "id": [matching_id], "tr": "[concise_translation]" }
  ]
}

TRANSLATION GUIDELINES
1. Accuracy: Use standard technical/programming terminology for ${targetLang}.
2. Conciseness: Provide the most direct translation. Avoid explanations.
3. Context: Assume these terms are used in software source code, database schemas, or technical documentation.`

    const payloadStr = JSON.stringify({
      entries: items.map((t) => ({ id: t.id, og: t.term }))
    })
    const prompt = `Target: ${targetLang} from ${sourceLang}\n\nPayload: ${payloadStr}`

    while (retries <= maxRetries && !success) {
      if (this.abortController?.signal.aborted) break

      try {
        const fullRequestPayload: any = {
          endpoint: meta.endpoint,
          model: meta.model,
          apiKey: this.obscureKey(meta.apiKey),
          temperature: 0.1,
          batchId,
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: prompt }
          ],
          itemsCount: items.length
        }

        logApiRequest(
          providerName,
          items.length,
          'TERMS',
          this.activeWorkspace,
          fullRequestPayload,
          batchId
        )

        const requestStartTime = performance.now()

        const generateResult = await provider.generateContent(prompt, meta.model, {
          systemPrompt: sysPrompt
        })

        const requestEndTime = performance.now()
        const responseText = generateResult.text

        let resultItems: any[] = []
        const jsonMatch =
          responseText.match(/\{[\s\S]*"results"[\s\S]*\}/) || responseText.match(/\{[\s\S]*\}/)

        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0])
            const results = parsed.results || (Array.isArray(parsed) ? parsed : null)
            if (Array.isArray(results)) {
              resultItems = results.map((r: any) => ({ id: r.id, tr: r.tr ?? r.translated_text }))
            }
          } catch (err) {
            console.error('Failed to parse AI response for glossary batch:', err)
          }
        }

        let usage = generateResult.usage
        if (!usage) {
          usage = {
            inputTokens: Math.floor(prompt.length / 4) + Math.floor(sysPrompt.length / 4),
            outputTokens: Math.floor(responseText.length / 4),
            totalTokens: Math.floor((prompt.length + sysPrompt.length + responseText.length) / 4),
            provider: providerName,
            model: meta.model
          }
        }
        lastUsage = usage

        doneCount = resultItems.length
        errorCount = items.length - doneCount

        const batchDuration = requestEndTime - requestStartTime
        let rawTps = 0
        if (usage.outputTokens > 0 && batchDuration > 0) {
          rawTps = usage.outputTokens / (batchDuration / 1000)
        }

        for (const res of resultItems) {
          if (res.id && res.tr) {
            updateGlossaryTerm(res.id, res.tr, 'AI', 0)
          }
        }

        recordUsage(
          usage.provider,
          usage.model,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalTokens,
          this.activeWorkspaceId || 0
        )

        const duration = Math.round(performance.now() - startTime)

        logApiResponse(
          providerName,
          doneCount,
          errorCount,
          this.activeWorkspace,
          usage,
          {
            results: resultItems.map((r) => ({ id: r.id, tr: r.tr })),
            raw: responseText,
            usage
          },
          batchId,
          duration,
          rawTps
        )

        success = true
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string }
        const errMeta = { endpoint: meta.endpoint, model: meta.model, batchSize: items.length }
        const is429 =
          err.status === 429 || err.message?.includes('429') || err.message?.includes('Rate limit')

        if (is429 && retries < maxRetries) {
          const delay = Math.pow(2, retries) * 5000
          console.warn(`Rate limited (Glossary), retrying in ${delay}ms...`)
          logApiError(providerName, `Rate limited (429)`, this.activeWorkspace, retries, errMeta)
          retries++
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else if (retries < maxRetries) {
          retries++
          const delay = Math.pow(2, retries) * 2000
          console.warn(
            `Glossary batch error: ${err.message || 'Unknown'}, retrying in ${delay}ms...`
          )
          logApiError(
            providerName,
            err.message || 'Unknown error',
            this.activeWorkspace,
            retries,
            errMeta
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          console.error(`Glossary batch failed after ${maxRetries} retries:`, err.message)
          logApiError(
            providerName,
            `Final failure after ${maxRetries} retries: ${err.message}`,
            this.activeWorkspace,
            undefined,
            errMeta
          )
          errorCount = items.length
          success = true // Don't halt
        }
      }
    }

    return { done: doneCount, errors: errorCount, usage: lastUsage }
  }

  pause(): void {
    if (this.isRunning) {
      this.isPaused = true
      this.emit('queue:status', 'paused')
    }
  }

  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false
      this.emit('queue:status', 'running')
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.isRunning = false
    this.isPaused = false
    this.emit('queue:progress', {
      totalItems: 0,
      completedItems: 0,
      errorItems: 0
    })
    this.emit('queue:status', 'idle')
  }

  getStatus(): { isRunning: boolean; isPaused: boolean } {
    return { isRunning: this.isRunning, isPaused: this.isPaused }
  }
}
