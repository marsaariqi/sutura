/**
 * Sutura Logging Engine
 * Provides structured logging with metadata tagging, API key sanitization,
 * burst event tracking, and real-time IPC streaming to the renderer.
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'fs'

// ---------- Types ----------

export type LogLevel = 'info' | 'success' | 'error' | 'warn' | 'debug'
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
  level: LogLevel
  provider: LogProvider
  message: string
  workspacePath: string | null
  request?: unknown
  response?: unknown
  metadata?: Record<string, unknown>
}

// ---------- In-memory session log ----------

const sessionLogs: LogEntry[] = []
let logIdCounter = 0
let mainWindow: BrowserWindow | null = null

// ---------- Paths ----------

function getLogsDir(): string {
  const logsDir = join(app.getPath('userData'), 'logs')
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }
  return logsDir
}

function getSessionLogFile(): string {
  const date = new Date().toISOString().slice(0, 10)
  return join(getLogsDir(), `sutura-${date}.jsonl`)
}

// ---------- Sanitization ----------

const API_KEY_PATTERNS = [
  /(?:api[_-]?key|apikey|authorization|bearer|token|secret)["\s:=]+["']?([A-Za-z0-9_\-./+=]{10,})/gi,
  /AIza[A-Za-z0-9_\-]{33,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /key=([A-Za-z0-9_\-]{10,})/gi
]

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let sanitized = value
    for (const pattern of API_KEY_PATTERNS) {
      pattern.lastIndex = 0
      sanitized = sanitized.replace(pattern, (match) => {
        // Preserve first 4 chars, redact the rest
        const prefix = match.slice(0, 8)
        return prefix + '***SUTURA***'
      })
    }
    return sanitized
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase()
      // Whitelist token *count* fields (usage stats) — these are numbers, not secrets
      const isTokenCount =
        lk === 'inputtokens' ||
        lk === 'outputtokens' ||
        lk === 'totaltokens' ||
        lk === 'prompt_tokens' ||
        lk === 'completion_tokens' ||
        lk === 'total_tokens' ||
        lk === 'prompttokencount' ||
        lk === 'candidatestokencount' ||
        lk === 'totaltokencount' ||
        lk === 'tokensUsage' ||
        lk === 'input' ||
        lk === 'output' ||
        lk === 'total' ||
        lk === 'burstInput' ||
        lk === 'burstOutput' ||
        lk === 'burstTotal'
      if (
        !isTokenCount &&
        (lk.includes('key') ||
          lk.includes('secret') ||
          lk.includes('token') ||
          lk.includes('authorization'))
      ) {
        sanitized[k] = typeof v === 'string' ? v.slice(0, 4) + '***SUTURA***' : '***SUTURA***'
      } else {
        sanitized[k] = sanitizeValue(v)
      }
    }
    return sanitized
  }
  return value
}

// ---------- Core Logger ----------

export function initLogger(win: BrowserWindow): void {
  mainWindow = win
}

function emitToRenderer(entry: LogEntry): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log:entry', entry)
  }
}

export function log(
  level: LogLevel,
  message: string,
  options: {
    provider?: LogProvider
    workspacePath?: string | null
    request?: unknown
    response?: unknown
    metadata?: Record<string, unknown>
  } = {}
): LogEntry {
  const entry: LogEntry = {
    id: `log_${++logIdCounter}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    level,
    provider: options.provider || 'system',
    message,
    workspacePath: options.workspacePath ?? null,
    request: options.request ? sanitizeValue(options.request) : undefined,
    response: options.response ? sanitizeValue(options.response) : undefined,
    metadata: options.metadata
      ? (sanitizeValue(options.metadata) as Record<string, unknown>)
      : undefined
  }

  // Add to in-memory session
  sessionLogs.push(entry)

  // Persist to JSONL
  try {
    appendFileSync(getSessionLogFile(), JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // Silent fail on persist
  }

  // Stream to renderer
  emitToRenderer(entry)

  return entry
}

// ---------- Convenience methods ----------

export function logInfo(message: string, opts?: Parameters<typeof log>[2]): LogEntry {
  return log('info', message, opts)
}

export function logSuccess(message: string, opts?: Parameters<typeof log>[2]): LogEntry {
  return log('success', message, opts)
}

export function logError(message: string, opts?: Parameters<typeof log>[2]): LogEntry {
  return log('error', message, opts)
}

export function logWarn(message: string, opts?: Parameters<typeof log>[2]): LogEntry {
  return log('warn', message, opts)
}

export function logDebug(message: string, opts?: Parameters<typeof log>[2]): LogEntry {
  return log('debug', message, opts)
}

// ---------- Burst event logging ----------

export function logBurstStart(rpm: number, batchSize: number, workspacePath: string | null): void {
  log('info', `Burst started — RPM: ${rpm}, Batch Size: ${batchSize}`, {
    provider: 'system',
    workspacePath,
    metadata: { event: 'burst:start', rpm, batchSize, maxItems: rpm * batchSize }
  })
}

export function logBurstComplete(
  completed: number,
  errors: number,
  workspacePath: string | null,
  tokens?: { input: number; output: number; total: number },
  duration?: number
): void {
  const tokenMsg = tokens
    ? ` | Tokens: ${tokens.total} (In: ${tokens.input}, Out: ${tokens.output})`
    : ''
  const timing = duration
    ? duration >= 1000
      ? ` — [${(duration / 1000).toFixed(2)}s | ${duration}ms]`
      : ` — [${duration}ms]`
    : ''
  log(
    errors > 0 ? 'warn' : 'success',
    `Burst complete — ${completed} done, ${errors} errors${tokenMsg}${timing}`,
    {
      provider: 'system',
      workspacePath,
      metadata: {
        event: 'burst:complete',
        completed,
        errors,
        duration
      }
    }
  )
}

export function logCooldownStart(seconds: number, workspacePath: string | null): void {
  log('info', `Cooldown started — ${seconds}s until next burst`, {
    provider: 'system',
    workspacePath,
    metadata: { event: 'cooldown:start', seconds }
  })
}

export function logCooldownReset(workspacePath: string | null): void {
  log('info', 'Cooldown reset — ready for next burst', {
    provider: 'system',
    workspacePath,
    metadata: { event: 'cooldown:reset' }
  })
}

// ---------- API call logging ----------

export function logApiRequest(
  provider: LogProvider,
  batchSize: number,
  nodeType: string,
  workspacePath: string | null,
  requestPayload?: unknown,
  batchId?: number
): void {
  const payload = requestPayload as Record<string, unknown> | undefined
  const model = payload?.model || ''
  const endpoint = payload?.endpoint || ''

  const batchTag = batchId ? `#${batchId} ` : ''
  log(
    'info',
    `API request ${batchTag}→ ${provider}${model ? ` (${model})` : ''} | ${batchSize} ${nodeType} items | ${endpoint}`,
    {
      provider,
      workspacePath,
      request: requestPayload,
      metadata: { event: 'api:request', batchId, batchSize, nodeType }
    }
  )
}

export function logApiResponse(
  provider: LogProvider,
  successCount: number,
  errorCount: number,
  workspacePath: string | null,
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number },
  responsePayload?: unknown,
  batchId?: number,
  durationMs?: number,
  rawTps?: number
): void {
  const level = errorCount > 0 ? 'warn' : 'success'
  const payload = responsePayload as Record<string, unknown> | undefined
  const model = payload?.model || ''
  const tokens = usage ? ` | ${usage.totalTokens} tokens` : ''
  const timing = durationMs
    ? durationMs >= 1000
      ? ` — [${(durationMs / 1000).toFixed(2)}s | ${durationMs}ms]`
      : ` — [${durationMs}ms]`
    : ''
  // Inject #[batchId] and (ms) into the message
  const batchTag = batchId ? `#${batchId} ` : ''

  const tpsText = rawTps ? ` | ${rawTps.toFixed(2)} TPS ± 5%` : ''

  log(
    level,
    `API response ${batchTag}← ${provider}${model ? ` (${model})` : ''} | ${successCount} ok, ${errorCount} errors${tokens}${timing}${tpsText}`,
    {
      provider,
      workspacePath,
      response: responsePayload,
      metadata: {
        event: 'api:response',
        batchId,
        successCount,
        errorCount,
        usage,
        durationMs,
        rawTps
      }
    }
  )
}

export function logApiError(
  provider: LogProvider,
  error: string,
  workspacePath: string | null,
  retryCount?: number,
  extra?: Record<string, unknown>
): void {
  log(
    'error',
    `API error — ${provider}: ${error}${retryCount !== undefined ? ` (retry ${retryCount})` : ''}`,
    {
      provider,
      workspacePath,
      metadata: { event: 'api:error', error, retryCount, ...extra }
    }
  )
}

// ---------- Query methods ----------

export function getSessionLogs(workspacePath?: string): LogEntry[] {
  if (workspacePath) {
    return sessionLogs.filter((e) => e.workspacePath === workspacePath || e.workspacePath === null)
  }
  return [...sessionLogs]
}

export function clearSessionLogs(): void {
  sessionLogs.length = 0
}

/** Clear only logs belonging to a specific workspace (in-memory + disk) */
export function clearSessionLogsForWorkspace(workspacePath: string): number {
  // Remove from in-memory array
  const before = sessionLogs.length
  for (let i = sessionLogs.length - 1; i >= 0; i--) {
    if (sessionLogs[i].workspacePath === workspacePath) {
      sessionLogs.splice(i, 1)
    }
  }
  const removed = before - sessionLogs.length

  // Rewrite today's JSONL file without this workspace's entries
  const sessionFile = getSessionLogFile()
  try {
    if (existsSync(sessionFile)) {
      const content = readFileSync(sessionFile, 'utf-8')
      const kept = content
        .split('\n')
        .filter(Boolean)
        .filter((line) => {
          try {
            return JSON.parse(line).workspacePath !== workspacePath
          } catch {
            return true
          }
        })
      writeFileSync(sessionFile, kept.length ? kept.join('\n') + '\n' : '', 'utf-8')
    }
  } catch {
    // Silent fail
  }

  return removed
}

export function getLogFiles(): { name: string; path: string; size: number }[] {
  const dir = getLogsDir()
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const fullPath = join(dir, f)
        const stat = require('fs').statSync(fullPath)
        return { name: f, path: fullPath, size: stat.size }
      })
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

export function getLogsFromFile(filePath: string): LogEntry[] {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean) as LogEntry[]
  } catch {
    return []
  }
}

export function getGlobalLogs(): LogEntry[] {
  const files = getLogFiles()
  const allLogs: LogEntry[] = []
  for (const file of files) {
    allLogs.push(...getLogsFromFile(file.path))
  }
  return allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function getLogsFolder(): string {
  return getLogsDir()
}

export function clearSessionLogFiles(): number {
  const today = new Date().toISOString().slice(0, 10)
  const sessionFile = join(getLogsDir(), `sutura-${today}.jsonl`)
  let cleared = 0
  try {
    if (existsSync(sessionFile)) {
      unlinkSync(sessionFile)
      cleared = 1
    }
  } catch {
    // Ignore
  }
  clearSessionLogs()
  return cleared
}
