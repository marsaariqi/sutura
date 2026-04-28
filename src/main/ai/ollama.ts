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

export class OllamaProvider implements AIProvider {
  private baseUrl: string
  private temperature: number
  private model: string

  constructor(baseUrl?: string, model?: string, temperature?: number) {
    this.baseUrl = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '')
    this.model = model || 'llama3'
    this.temperature = temperature ?? 0.3
  }

  async translate(batch: TranslationBatch): Promise<TranslationResult> {
    const client = new OpenAI({
      apiKey: 'ollama',
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
      provider: 'ollama',
      model: this.model
    }
    parsed.usage = usage

    return parsed
  }

  async generateContent(
    prompt: string,
    modelId?: string,
    options?: { systemPrompt?: string }
  ): Promise<{ text: string; usage?: UsageStats }> {
    const client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${this.baseUrl}/v1`
    })

    const messages: any[] = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await client.chat.completions.create({
      model: modelId || this.model,
      messages,
      temperature: this.temperature
    })

    const responseText = response.choices[0]?.message?.content || ''
    let usage: UsageStats | undefined

    if (response.usage) {
      usage = {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
        provider: 'ollama',
        model: modelId || this.model
      }
    }

    return { text: responseText, usage }
  }

  async validateApiKey(): Promise<boolean> {
    // Ollama has no API key — just check server is reachable
    return OllamaProvider.checkConnection(this.baseUrl)
  }

  /** Check if the Ollama server is reachable */
  static async checkConnection(baseUrl: string): Promise<boolean> {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  }

  /** Fetch available models from Ollama server */
  static async fetchModels(baseUrl: string): Promise<ProviderModelInfo[]> {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = (await res.json()) as { models?: { name: string; modified_at?: string }[] }
      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name
      }))
    } catch {
      return []
    }
  }
}
