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

export const DEEPSEEK_MODEL = 'deepseek-v4-flash'

export class DeepSeekProvider implements AIProvider {
  private apiKey: string
  private temperature: number
  private model: string

  constructor(apiKey: string, model?: string, temperature?: number) {
    this.apiKey = apiKey
    this.model = model || DEEPSEEK_MODEL
    this.temperature = temperature ?? 0.3
  }

  async translate(batch: TranslationBatch): Promise<TranslationResult> {
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.deepseek.com'
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
    // console.log('res: ', responseText)
    const parsed = parseTranslationResponse(responseText, batchIds)

    // Extract token usage from DeepSeek (OpenAI-compatible) response
    if (response.usage) {
      const usage: UsageStats = {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
        provider: 'deepseek',
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
      apiKey: this.apiKey,
      baseURL: 'https://api.deepseek.com'
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
        provider: 'deepseek',
        model: modelId || this.model
      }
    }

    return { text: responseText, usage }
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://api.deepseek.com'
      })
      // Use a minimal call to verify the key works
      await client.models.list()
      return true
    } catch {
      return false
    }
  }
}
