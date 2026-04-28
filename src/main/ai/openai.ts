import OpenAI from 'openai'
import {
  AIProvider,
  TranslationBatch,
  TranslationResult,
  UsageStats,
  buildPrompt,
  getSystemPrompt,
  parseTranslationResponse
} from './provider'

export class OpenAIProvider implements AIProvider {
  private apiKey: string
  private temperature: number
  private model: string

  constructor(apiKey: string, model?: string, temperature?: number) {
    this.apiKey = apiKey
    this.model = model || 'gpt-4.1-nano'
    this.temperature = temperature ?? 0.3
  }

  async translate(batch: TranslationBatch): Promise<TranslationResult> {
    const client = new OpenAI({ apiKey: this.apiKey })

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

    if (response.usage) {
      const usage: UsageStats = {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
        provider: 'openai',
        model: this.model
      }
      parsed.usage = usage
    }

    return parsed
  }

  async generateContent(
    prompt: string,
    modelId?: string,
    options?: { systemPrompt?: string }
  ): Promise<{ text: string; usage?: UsageStats }> {
    const client = new OpenAI({
      apiKey: this.apiKey
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
        provider: 'openai',
        model: modelId || this.model
      }
    }

    return { text: responseText, usage }
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey: key })
      await client.models.list()
      return true
    } catch {
      return false
    }
  }
}
