/**
 * AI Provider abstraction layer.
 * All translation AI integrations implement this interface.
 */
import { getSetting } from '../database'

export type ProviderKey = 'gemini' | 'deepseek' | 'openai' | 'anthropic' | 'ollama' | 'llamacpp'

export interface ProviderModelInfo {
  id: string
  name: string
}

export const CLOUD_PROVIDERS: ProviderKey[] = ['gemini', 'deepseek', 'openai', 'anthropic']
export const LOCAL_PROVIDERS: ProviderKey[] = ['ollama', 'llamacpp']

/** Default models for each cloud provider */
export const DEFAULT_MODELS: Record<ProviderKey, ProviderModelInfo[]> = {
  gemini: [
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite (Preview)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3.2 Chat' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }
  ],
  openai: [
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
  ],
  ollama: [],
  llamacpp: []
}

/** Default base URLs for local providers */
export const LOCAL_DEFAULTS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  llamacpp: 'http://localhost:8080'
}

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama (Local)',
  llamacpp: 'llama.cpp (Server)'
}

export interface TranslationBatchItem {
  id: number
  nodeType: 'COMMENT' | 'STRING_LITERAL'
  originalText: string
}

export interface TranslationResultItem {
  id: number
  translatedText: string
}

export interface TranslationBatch {
  items: TranslationBatchItem[]
  targetLanguage: string
  sourceLanguage?: string
  nodeType?: string
  glossary?: Record<string, string>
}

export interface UsageStats {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  provider: string
  model: string
}

export interface TranslationResult {
  items: TranslationResultItem[]
  errors: { id: number; error: string }[]
  usage?: UsageStats
}

export interface GenerateResult {
  text: string
  usage?: UsageStats
}

export interface AIProvider {
  translate(batch: TranslationBatch): Promise<TranslationResult>
  generateContent(
    prompt: string,
    model?: string,
    options?: { systemPrompt?: string }
  ): Promise<GenerateResult>
  validateApiKey(key: string): Promise<boolean>
}

// const SYSTEM_PROMPT = `You are a senior developer. Translate all \`original_text\` values to the specified target language. Return the same JSON structure with \`translated_text\` filled in. If \`node_type\` is \`STRING_LITERAL\`, be extremely precise — this is functional code (loggers/alerts). If \`COMMENT\`, prioritize technical clarity. Do NOT translate code identifiers, variable names, function names, or programming keywords. Only translate human-readable text content.

// CRITICAL for STRING_LITERAL: Do NOT use apostrophes ('), double quotes ("), or backticks (\`) in translated text. These characters break code syntax (e.g. SQL COMMENT delimiters). Rephrase to avoid them. For example, use "power of yesterday" instead of "yesterday's power".

// Return a JSON object with a single key "results" containing an array of objects, each with "id" (number) and "translated_text" (string).`

export function buildPrompt(batch: TranslationBatch): string {
  // Map to shorter keys to save tokens
  const itemsSlim = batch.items.map((item) => ({
    id: item.id,
    og: item.originalText
  }))

  const fromLang = batch.sourceLanguage ? ` from ${batch.sourceLanguage}` : ''
  const typeInfo = batch.nodeType ? `Context: These are ${batch.nodeType} entries.\n` : ''

  const payload = JSON.stringify({ entries: itemsSlim })
  const glossaryInfo =
    batch.glossary && Object.keys(batch.glossary).length > 0
      ? `Glossary: ${JSON.stringify(batch.glossary)}\n`
      : ''

  return `${typeInfo}Target: ${batch.targetLanguage}${fromLang}\n${glossaryInfo}\nPayload: ${payload}`
}

// export function getSystemPrompt(): string {
//   return SYSTEM_PROMPT
// }

export function getSystemPrompt(): string {
  // Fetch from DB. If for some reason it's missing, use a fallback
  // so the app doesn't crash, but the DB default is the real master.
  const savedPrompt = getSetting('system_prompt')

  const fallback = `You are a senior developer. Translate human-readable text only. Return JSON { "results": [{ "id": number, "tr": string }] }`

  return savedPrompt || fallback
}

/**
 * Attempt to repair truncated JSON from AI responses.
 * The AI sometimes exceeds max output tokens, resulting in cut-off JSON.
 * This tries to extract as many complete items as possible.
 */
function repairTruncatedJson(raw: string): { results: { id: number; tr: string }[] } | null {
  const items: { id: number; tr: string }[] = []

  // Revised Regex: Matches "tr" OR "translated_text"
  // Group 1: id, Group 2: the translated content
  const entryRegex =
    /\{\s*"id"\s*:\s*(\d+)\s*,\s*"(?:tr|translated_text)"\s*:\s*("(?:[^"\\]|\\.)*")\s*\}/g
  const entryRegexAlt =
    /\{\s*"(?:tr|translated_text)"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"id"\s*:\s*(\d+)\s*\}/g

  let match: RegExpExecArray | null
  while ((match = entryRegex.exec(raw)) !== null) {
    try {
      const id = parseInt(match[1], 10)
      const text = JSON.parse(match[2])
      items.push({ id, tr: text })
    } catch {
      /* skip */
    }
  }
  while ((match = entryRegexAlt.exec(raw)) !== null) {
    try {
      const text = JSON.parse(match[1])
      const id = parseInt(match[2], 10)
      if (!items.some((item) => item.id === id)) {
        items.push({ id, tr: text })
      }
    } catch {
      /* skip */
    }
  }

  return items.length > 0 ? { results: items } : null
}

export function parseTranslationResponse(raw: string, batchIds: number[]): TranslationResult {
  const items: TranslationResultItem[] = []
  const errors: { id: number; error: string }[] = []

  let parsed: any = null

  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = repairTruncatedJson(raw)
  }

  if (parsed) {
    // Handle "results" wrapper or direct array
    const results = parsed.results || (Array.isArray(parsed) ? parsed : null)

    if (Array.isArray(results)) {
      const receivedIds = new Set<number>()
      for (const entry of results) {
        // Priority: 'tr' (new slim key), Fallback: 'translated_text' (old key)
        const translatedValue = entry.tr ?? entry.translated_text

        if (entry.id !== undefined && translatedValue !== undefined) {
          items.push({
            id: entry.id,
            translatedText: translatedValue // Maps back to our app's internal naming
          })
          receivedIds.add(entry.id)
        }
      }

      for (const id of batchIds) {
        if (!receivedIds.has(id)) {
          errors.push({ id, error: 'Missing from AI response' })
        }
      }
    } else {
      for (const id of batchIds) {
        errors.push({ id, error: 'Malformed JSON response structure' })
      }
    }
  } else {
    for (const id of batchIds) {
      errors.push({ id, error: `JSON parse error: could not parse or repair AI response` })
    }
  }

  return { items, errors }
}
