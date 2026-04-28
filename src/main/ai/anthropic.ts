import Anthropic from '@anthropic-ai/sdk'
import {
  AIProvider,
  TranslationBatch,
  TranslationResult,
  UsageStats,
  buildPrompt,
  getSystemPrompt,
  parseTranslationResponse
} from './provider'

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private temperature: number
  private model: string

  constructor(apiKey: string, model?: string, temperature?: number) {
    this.apiKey = apiKey
    this.model = model || 'claude-sonnet-4-20250514'
    this.temperature = temperature ?? 0.3
  }

  async translate(batch: TranslationBatch): Promise<TranslationResult> {
    const client = new Anthropic({ apiKey: this.apiKey })

    const prompt = buildPrompt(batch)
    const batchIds = batch.items.map((item) => item.id)

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 8192,
      temperature: this.temperature,
      system: [
        {
          type: 'text',
          text: getSystemPrompt(),
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [{ role: 'user', content: prompt }]
    })

    const responseText =
      response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('') || '{}'
    const parsed = parseTranslationResponse(responseText, batchIds)

    const usage: UsageStats = {
      inputTokens: response.usage.input_tokens || 0,
      outputTokens: response.usage.output_tokens || 0,
      totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
      provider: 'anthropic',
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
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: this.apiKey })

    const response = await client.messages.create({
      model: modelId || this.model,
      max_tokens: 4096,
      system: options?.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.temperature
    })

    const responseText =
      response.content[0].type === 'text' ? (response.content[0] as any).text : ''
    let usage: UsageStats | undefined

    if (response.usage) {
      usage = {
        inputTokens: response.usage.input_tokens || 0,
        outputTokens: response.usage.output_tokens || 0,
        totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        provider: 'anthropic',
        model: modelId || this.model
      }
    }

    return { text: responseText, usage }
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey: key })
      // Send a minimal request to verify the key
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
      return true
    } catch (err: unknown) {
      const error = err as { status?: number }
      // 401 = bad key, anything else (400, 429) means key is valid
      if (error.status === 401) return false
      // If the request was processed (even with an error), key is valid
      return error.status !== undefined && error.status !== 401
    }
  }
}
