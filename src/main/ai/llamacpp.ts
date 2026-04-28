import OpenAI from 'openai'
import {
  AIProvider,
  TranslationBatch,
  TranslationResult,
  UsageStats,
  ProviderModelInfo,
  buildPrompt,
  getSystemPrompt,
  parseTranslationResponse
} from './provider'

export class LlamaCppProvider implements AIProvider {
  private baseUrl: string
  private temperature: number
  private model: string

  constructor(baseUrl?: string, model?: string, temperature?: number) {
    this.baseUrl = (baseUrl || 'http://localhost:8080').replace(/\/+$/, '')
    this.model = model || 'default'
    this.temperature = temperature ?? 0.3
  }

  async translate(batch: TranslationBatch): Promise<TranslationResult> {
    const client = new OpenAI({
      apiKey: 'llamacpp',
      baseURL: `${this.baseUrl}/v1`
    })

    const prompt = buildPrompt(batch)
    const batchIds = batch.items.map((item) => item.id)

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: this.temperature
    })

    const responseText = response.choices[0]?.message?.content || '{}'
    const parsed = parseTranslationResponse(responseText, batchIds)

    const usage: UsageStats = {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      provider: 'llamacpp',
      model: this.model
    }
    parsed.usage = usage

    return parsed
  }

  async generateContent(
    prompt: string,
    _modelId?: string,
    options?: { systemPrompt?: string }
  ): Promise<{ text: string; usage?: UsageStats }> {
    const messages: any[] = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: this.temperature,
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`llama.cpp generateContent failed: ${response.statusText}`)
    }

    const data = await response.json()
    const responseText = data.choices[0]?.message?.content || ''
    let usage: UsageStats | undefined

    if (data.usage) {
      usage = {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
        provider: 'llamacpp',
        model: 'default'
      }
    }

    return { text: responseText, usage }
  }

  async validateApiKey(): Promise<boolean> {
    // llama.cpp has no API key — just check server is reachable
    return LlamaCppProvider.checkConnection(this.baseUrl)
  }

  /** Check if the llama.cpp server is reachable via /v1/models or /props */
  static async checkConnection(baseUrl: string): Promise<boolean> {
    const url = baseUrl.replace(/\/+$/, '')
    try {
      // Try OpenAI-compatible endpoint first
      const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) return true
    } catch {
      // fall through
    }
    try {
      // Try native /props endpoint
      const res = await fetch(`${url}/props`, { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  }

  /** Fetch available models from llama.cpp server */
  static async fetchModels(baseUrl: string): Promise<ProviderModelInfo[]> {
    const url = baseUrl.replace(/\/+$/, '')

    // Try OpenAI-compatible /v1/models
    try {
      const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = (await res.json()) as { data?: { id: string }[] }
        if (data.data && data.data.length > 0) {
          return data.data.map((m) => ({ id: m.id, name: m.id }))
        }
      }
    } catch {
      // fall through
    }

    // Try native /props endpoint
    try {
      const res = await fetch(`${url}/props`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = (await res.json()) as { default_generation_settings?: { model?: string } }
        const modelName = data.default_generation_settings?.model || 'default'
        return [{ id: modelName, name: modelName }]
      }
    } catch {
      // fall through
    }

    return [{ id: 'default', name: 'Default Model' }]
  }
}
