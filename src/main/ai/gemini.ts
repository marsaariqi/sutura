import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  AIProvider,
  TranslationBatch,
  TranslationResult,
  UsageStats,
  buildPrompt,
  getSystemPrompt,
  parseTranslationResponse
} from './provider'

export const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'

export class GeminiProvider implements AIProvider {
  private apiKey: string
  private temperature: number
  private model: string

  constructor(apiKey: string, model?: string, temperature?: number) {
    this.apiKey = apiKey
    this.model = model || GEMINI_MODEL
    this.temperature = temperature ?? 0.3
  }

  async translate(batch: TranslationBatch): Promise<TranslationResult> {
    const genAI = new GoogleGenerativeAI(this.apiKey)
    const model = genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: this.temperature
      }
    })

    const prompt = buildPrompt(batch)
    const batchIds = batch.items.map((item) => item.id)

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: getSystemPrompt() }] }
    })

    const responseText = result.response.text()
    const parsed = parseTranslationResponse(responseText, batchIds)

    // Extract token usage from Gemini response
    const usageMetadata = result.response.usageMetadata
    if (usageMetadata) {
      const usage: UsageStats = {
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0,
        provider: 'gemini',
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
    const genAI = new GoogleGenerativeAI(this.apiKey)
    const activeModel = genAI.getGenerativeModel({
      model: modelId || this.model,
      generationConfig: {
        temperature: this.temperature
      }
    })

    const result = await activeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: options?.systemPrompt
        ? { role: 'system', parts: [{ text: options.systemPrompt }] }
        : undefined
    })

    const responseText = result.response.text()
    const usageMetadata = result.response.usageMetadata
    let usage: UsageStats | undefined

    if (usageMetadata) {
      usage = {
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0,
        provider: 'gemini',
        model: modelId || this.model
      }
    }

    return { text: responseText, usage }
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      // Use lightweight models.list endpoint instead of generateContent
      // This avoids wasting tokens and won't trigger content-related errors
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`
      )
      return res.ok
    } catch {
      return false
    }
  }
}
