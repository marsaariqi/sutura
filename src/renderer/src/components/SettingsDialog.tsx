import { useState, useEffect, useCallback } from 'react'
import { useAppStore, type ProviderKey } from '@/stores/app-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Key,
  Trash2,
  Cpu,
  FileX2,
  Globe,
  Server,
  RefreshCw,
  Terminal,
  RotateCcw
} from 'lucide-react'

const CLOUD_PROVIDERS: ProviderKey[] = ['gemini', 'deepseek', 'openai', 'anthropic']
const LOCAL_PROVIDERS: ProviderKey[] = ['ollama', 'llamacpp']

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama (Local)',
  llamacpp: 'llama.cpp (Server)'
}

export function SettingsDialog() {
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const settingsTab = useAppStore((s) => s.settingsTab)
  const aiProvider = useAppStore((s) => s.aiProvider)
  const setAiProvider = useAppStore((s) => s.setAiProvider)
  const aiModel = useAppStore((s) => s.aiModel)
  const setAiModel = useAppStore((s) => s.setAiModel)
  const sourceLanguage = useAppStore((s) => s.sourceLanguage)
  const setSourceLanguage = useAppStore((s) => s.setSourceLanguage)
  const targetLanguage = useAppStore((s) => s.targetLanguage)
  const setTargetLanguage = useAppStore((s) => s.setTargetLanguage)
  const batchSize = useAppStore((s) => s.batchSize)
  const setBatchSize = useAppStore((s) => s.setBatchSize)
  const temperature = useAppStore((s) => s.temperature)
  const setTemperature = useAppStore((s) => s.setTemperature)
  const bumpSettingsVersion = useAppStore((s) => s.bumpSettingsVersion)

  // dynamic sys prompt
  const systemPrompt = useAppStore((s) => s.systemPrompt)
  const setSystemPrompt = useAppStore((s) => s.setSystemPrompt)
  const [localPrompt, setLocalPrompt] = useState('')

  const translationScope = useAppStore((s) => s.translationScope)
  const setTranslationScope = useAppStore((s) => s.setTranslationScope)

  const isPromptDirty = localPrompt !== systemPrompt

  // API keys for cloud providers
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [hasKeys, setHasKeys] = useState<Record<string, boolean>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [validating, setValidating] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<Record<string, boolean | null>>({})
  const [saving, setSaving] = useState(false)
  const [rpm, setRpm] = useState(4)
  const [ignorePatterns, setIgnorePatterns] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  // App version and updates
  const [appVersion, setAppVersion] = useState<string>('1.0.0')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<{
    text: string
    type: 'success' | 'error' | 'info'
  } | null>(null)

  // Track the actual saved values in the database
  const [dbProvider, setDbProvider] = useState<ProviderKey>('gemini')
  const [dbModel, setDbModel] = useState<string>('')

  // 1. Check if Dropdowns changed
  const selectionChanged = aiProvider !== dbProvider || aiModel !== dbModel

  // 2. Check if the Key is valid
  // - If it's a Cloud provider: It must be 'dirty' (typed) AND validationResult must be 'true'
  // - OR: If it's not dirty, assume the existing saved key is fine
  const keyIsValidated = !isDirty || validationResult[aiProvider] === true

  // 3. Master Save Boolean
  const canSaveConfig = (selectionChanged || isDirty) && keyIsValidated && !saving

  // Local provider URLs
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [llamacppUrl, setLlamacppUrl] = useState('http://localhost:8080')

  // Dynamic model list
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const isLocal = LOCAL_PROVIDERS.includes(aiProvider)
  const isCloud = CLOUD_PROVIDERS.includes(aiProvider)

  const loadSettings = useCallback(async () => {
    const [settings, version] = await Promise.all([
      window.api.getAllSettings(),
      window.api.getVersion()
    ])

    if (version) setAppVersion(version)

    // Load has-key state for all cloud providers
    const keyState: Record<string, boolean> = {}
    const keyValues: Record<string, string> = {}
    for (const p of CLOUD_PROVIDERS) {
      keyState[p] = await window.api.hasApiKey(p)
      const kResult = await window.api.getApiKey(p)
      if (kResult.key) keyValues[p] = kResult.key
    }
    // Local providers are always "ready" (no key needed)
    for (const p of LOCAL_PROVIDERS) keyState[p] = true
    setHasKeys(keyState)
    setApiKeys(keyValues)

    if (settings.system_prompt) {
      setLocalPrompt(settings.system_prompt)
      setSystemPrompt(settings.system_prompt)
    }

    if (settings.ai_provider) {
      setAiProvider(settings.ai_provider as ProviderKey)
      setDbProvider(settings.ai_provider as ProviderKey)
    }
    if (settings.ai_model) {
      setAiModel(settings.ai_model)
      setDbModel(settings.ai_model)
    }
    if (settings.source_language) setSourceLanguage(settings.source_language)
    if (settings.target_language) setTargetLanguage(settings.target_language)
    if (settings.batch_size) setBatchSize(parseInt(settings.batch_size, 10))
    if (settings.temperature) setTemperature(parseFloat(settings.temperature))
    if (settings.rpm) setRpm(parseInt(settings.rpm, 10))
    if (settings.ignore_patterns !== undefined) setIgnorePatterns(settings.ignore_patterns)
    if (settings.ollama_base_url) setOllamaUrl(settings.ollama_base_url)
    if (settings.llamacpp_base_url) setLlamacppUrl(settings.llamacpp_base_url)
    if (settings.translation_scope)
      setTranslationScope(settings.translation_scope as 'all' | 'comment' | 'string_literal')
  }, [
    setAiProvider,
    setAiModel,
    setSourceLanguage,
    setTargetLanguage,
    setBatchSize,
    setTemperature,
    setSystemPrompt,
    setTranslationScope
  ])

  // Load models when provider changes
  const fetchModels = useCallback(
    async (provider: ProviderKey) => {
      setLoadingModels(true)
      try {
        const list = await window.api.listModels(provider)
        setModels(list)

        if (list.length > 0) {
          const currentModelIsValid = list.some((m) => m.id === aiModel)
          if (!aiModel || !currentModelIsValid) {
            const defaultModel = list[0].id
            setAiModel(defaultModel)
            setIsDirty(true)
            console.log('Locked in default model:', defaultModel)
          }
        }
      } catch (error) {
        console.error('Failed to fetch models:', error)
        setModels([])
      } finally {
        setLoadingModels(false)
      }
    },
    [aiModel, setAiModel]
  )

  useEffect(() => {
    if (settingsOpen) {
      loadSettings()
      setValidationResult({})
    }
  }, [settingsOpen, loadSettings])

  useEffect(() => {
    if (settingsOpen) {
      fetchModels(aiProvider)
    }
  }, [settingsOpen, aiProvider, fetchModels])

  async function handleValidate(provider: ProviderKey) {
    if (isCloud) {
      const key = apiKeys[provider] || ''
      if (!key.trim()) return
      setValidating(provider)
      try {
        const result = await window.api.validateApiKey(provider, key.trim())
        setValidationResult((prev) => ({ ...prev, [provider]: result.valid }))
      } catch {
        setValidationResult((prev) => ({ ...prev, [provider]: false }))
      } finally {
        setValidating(null)
      }
    } else {
      // Local: test connection
      setValidating(provider)
      try {
        const result = await window.api.testApiKey(provider)
        setValidationResult((prev) => ({ ...prev, [provider]: result.success }))
      } catch {
        setValidationResult((prev) => ({ ...prev, [provider]: false }))
      } finally {
        setValidating(null)
      }
    }
  }

  async function handleSaveKey(provider: ProviderKey) {
    setSaving(true)
    try {
      // Only save the key if it's the one it just validated
      if (isDirty && validationResult[provider] === true) {
        await window.api.storeApiKey(provider, apiKeys[provider])
        setHasKeys((prev) => ({ ...prev, [provider]: true }))
      }

      // Always lock in the dropdown settings
      await window.api.setSetting('ai_provider', provider)
      await window.api.setSetting('ai_model', aiModel)

      setDbProvider(provider)
      setDbModel(aiModel)

      // Sync Store
      useAppStore.getState().setAiProvider(provider)
      useAppStore.getState().setAiModel(aiModel)

      // Reset flags
      setIsDirty(false)
      bumpSettingsVersion()
    } finally {
      setSaving(false)
    }
  }

  async function handleRevokeKey(provider: ProviderKey) {
    try {
      await window.api.revokeApiKey(provider)
      setHasKeys((prev) => ({ ...prev, [provider]: false }))
      setApiKeys((prev) => ({ ...prev, [provider]: '' }))
      setValidationResult((prev) => ({ ...prev, [provider]: null }))
    } catch {
      // ignore
    }
  }

  const handleAutoSaveModel = useCallback(
    async (newModel: string, currentProvider: ProviderKey) => {
      if (!newModel) return

      if (currentProvider !== dbProvider) {
        console.log('Skipping auto-save: provider changed but not formally saved.')
        return
      }

      try {
        await window.api.setSetting('ai_model', newModel)

        setDbModel(newModel)
        useAppStore.getState().setAiModel(newModel)

        bumpSettingsVersion()

        console.log(`Auto-saved model: ${newModel} for ${currentProvider}`)
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    },
    [dbProvider, bumpSettingsVersion]
  )

  async function handleSaveSettings() {
    setSaving(true)
    try {
      const saveTasks = [
        window.api.setSetting('ai_provider', aiProvider),
        window.api.setSetting('ai_model', aiModel),
        window.api.setSetting('source_language', sourceLanguage),
        window.api.setSetting('target_language', targetLanguage),
        window.api.setSetting('batch_size', String(batchSize)),
        window.api.setSetting('temperature', String(temperature)),
        window.api.setSetting('rpm', String(rpm)),
        window.api.setSetting('ollama_base_url', ollamaUrl),
        window.api.setSetting('llamacpp_base_url', llamacppUrl),
        window.api.setSetting('ignore_patterns', ignorePatterns)
      ]

      // Persist translation scope as a normal setting
      saveTasks.push(window.api.setSetting('translation_scope', translationScope))

      // Only save the prompt if it actually changed
      if (isPromptDirty) {
        saveTasks.push(window.api.setSetting('system_prompt', localPrompt))
        setSystemPrompt(localPrompt) // Update the store
      }

      await Promise.all(saveTasks)

      setDbProvider(aiProvider)
      setDbModel(aiModel)

      bumpSettingsVersion()
      setSettingsOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleResetPrompt = () => {
    // Use the refined "Preserve Wrappers" prompt discussed
    const defaultPrompt = `You are a senior developer. Translate the provided list where "og" is the source text.
The 'Context' header specifies the type of content (COMMENT or STRING_LITERAL).
Return a JSON object with a single key "results" containing an array of objects, each with "id" and "tr" (the translation).

RULES:
1. PRESERVE WRAPPERS: If "og" starts/ends with quotes (', ", \`), "tr" MUST include the same matching quotes.
2. ESCAPING: Properly escape double quotes inside the JSON string as ".
3. STRING_LITERAL: If Context is STRING_LITERAL, be extremely precise. Do not add/remove spaces.
4. COMMENT: If Context is COMMENT, prioritize technical clarity.
5. NO REWRITING: Do NOT translate identifiers, variable names, or keywords.
6. DELIMITERS: Avoid internal apostrophes (') or quotes within "tr" unless they are part of the wrapper.
7. GLOSSARY: If a "Glossary" is provided, use the provided translations for those specific terms for reference and consistency.

EXAMPLE :
Context: These are STRING_LITERAL entries.
Target: English from Chinese
Glossary: {"查询": "Query"}
Payload: [{"id": 1, "og": ""查询成功""}] -> Output: {"results": [{"id": 1, "tr": ""Query Success""}]}`

    setLocalPrompt(defaultPrompt)
  }

  const handleCheckForUpdates = async () => {
    if (updateVersion) {
      // If update is already found, trigger download
      setDownloadingUpdate(true)
      setUpdateMessage({ text: 'Downloading update in background...', type: 'info' })
      try {
        const result = await window.api.downloadUpdate()
        if (!result.success) {
          setUpdateMessage({ text: result.error || 'Failed to start download.', type: 'error' })
          setDownloadingUpdate(false)
        }
      } catch {
        setUpdateMessage({ text: 'An unexpected error occurred.', type: 'error' })
        setDownloadingUpdate(false)
      }
      return
    }

    setCheckingUpdate(true)
    setUpdateMessage({ text: 'Checking for updates...', type: 'info' })
    try {
      const result = await window.api.checkForUpdates()
      if (!result.success) {
        setUpdateMessage({ text: result.error || 'Failed to check for updates.', type: 'error' })
      } else if (result.updateAvailable) {
        setUpdateVersion(result.version || 'new')
        setUpdateMessage({
          text: `Update available (${result.version}). Ready to download.`,
          type: 'success'
        })
      } else {
        setUpdateMessage({ text: 'Sutura is up to date.', type: 'success' })
      }
    } catch {
      setUpdateMessage({ text: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-w-xl h-[90vh] p-0 flex flex-col overflow-hidden gap-0">
        <div className="p-6 pb-4 shrink-0">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure AI provider, API keys, and translation settings.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Tabs
          value={settingsTab}
          onValueChange={(v) => setSettingsOpen(true, v)}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <div className="px-6 pb-4 shrink-0">
            <TabsList className="w-full">
              <TabsTrigger value="general" className="flex-1">
                General
              </TabsTrigger>
              <TabsTrigger value="ignore" className="flex-1">
                Ignore
              </TabsTrigger>
              <TabsTrigger value="license" className="flex-1">
                License
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            <div className="pb-6 min-h-full flex flex-col">
              <TabsContent value="general" className="mt-0 space-y-6 focus-visible:outline-none">
                {/* AI Provider */}
                <div className="space-y-2">
                  <Label>AI Provider</Label>
                  <Select
                    value={aiProvider}
                    onValueChange={(v) => {
                      setAiProvider(v as ProviderKey)
                      // setAiModel('')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Cloud
                      </div>
                      {CLOUD_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <Globe className="h-3 w-3" />
                            {PROVIDER_LABELS[p]}
                          </span>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t">
                        Local
                      </div>
                      {LOCAL_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <Server className="h-3 w-3" />
                            {PROVIDER_LABELS[p]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Model Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Model</Label>
                    {(isLocal || loadingModels) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        disabled={loadingModels}
                        onClick={() => fetchModels(aiProvider)}
                      >
                        <RefreshCw
                          className={`h-3 w-3 mr-1 ${loadingModels ? 'animate-spin' : ''}`}
                        />
                        Refresh
                      </Button>
                    )}
                  </div>
                  <Select
                    value={aiModel}
                    onValueChange={(v) => {
                      setAiModel(v)
                      handleAutoSaveModel(v, aiProvider)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingModels ? 'Loading...' : 'Select model'} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Small Tip at the bottom */}
                  <p className="text-[10px] text-muted-foreground italic px-1">
                    Tip: Changing the model is automatically saved if the API key is valid for this
                    provider.
                  </p>
                </div>

                {/* Active Model Info */}
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
                  <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{PROVIDER_LABELS[aiProvider]}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {aiModel || models[0]?.id || '—'}
                    </p>
                  </div>
                  {isLocal ? (
                    <span className="text-[10px] text-blue-400 flex items-center gap-1">
                      <Server className="h-3 w-3" /> Local
                    </span>
                  ) : hasKeys[aiProvider] ? (
                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  ) : (
                    <span className="text-[10px] text-orange-400 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> No Key
                    </span>
                  )}
                </div>

                <Separator />

                {/* Local Provider URL Config */}
                {aiProvider === 'ollama' && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5" />
                      Ollama Server URL
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={validating === 'ollama'}
                        onClick={() => handleValidate('ollama')}
                      >
                        {validating === 'ollama' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Test'
                        )}
                      </Button>
                    </div>
                    {validationResult.ollama !== undefined && validationResult.ollama !== null && (
                      <p
                        className={`text-xs flex items-center gap-1 ${validationResult.ollama ? 'text-green-400' : 'text-destructive'}`}
                      >
                        {validationResult.ollama ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Connected
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" /> Cannot connect
                          </>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Ollama fetches models via{' '}
                      <code className="text-[10px] bg-muted px-1 rounded">/api/tags</code>. No API
                      key required.
                    </p>
                  </div>
                )}

                {aiProvider === 'llamacpp' && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5" />
                      llama.cpp Server URL
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={llamacppUrl}
                        onChange={(e) => setLlamacppUrl(e.target.value)}
                        placeholder="http://localhost:8080"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={validating === 'llamacpp'}
                        onClick={() => handleValidate('llamacpp')}
                      >
                        {validating === 'llamacpp' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Test'
                        )}
                      </Button>
                    </div>
                    {validationResult.llamacpp !== undefined &&
                      validationResult.llamacpp !== null && (
                        <p
                          className={`text-xs flex items-center gap-1 ${validationResult.llamacpp ? 'text-green-400' : 'text-destructive'}`}
                        >
                          {validationResult.llamacpp ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Connected
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" /> Cannot connect
                            </>
                          )}
                        </p>
                      )}
                    <p className="text-xs text-muted-foreground">
                      Supports OpenAI-compatible{' '}
                      <code className="text-[10px] bg-muted px-1 rounded">/v1/models</code> and
                      native <code className="text-[10px] bg-muted px-1 rounded">/props</code>{' '}
                      endpoints.
                    </p>
                  </div>
                )}

                {/* Cloud Provider API Key */}
                {isCloud && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5" />
                      {PROVIDER_LABELS[aiProvider]} API Key
                      {hasKeys[aiProvider] && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          className="pr-10"
                          type={showKeys[aiProvider] ? 'text' : 'password'}
                          placeholder={
                            hasKeys[aiProvider]
                              ? '••••••••••••••••'
                              : `Enter ${PROVIDER_LABELS[aiProvider]} API key`
                          }
                          value={apiKeys[aiProvider] || ''}
                          onChange={(e) => {
                            setApiKeys((prev) => ({ ...prev, [aiProvider]: e.target.value }))
                            setIsDirty(true)
                            setValidationResult((prev) => ({ ...prev, [aiProvider]: null }))
                          }}
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground bg-background pl-1 mr-2 h-3/4"
                          onClick={() =>
                            setShowKeys((prev) => ({ ...prev, [aiProvider]: !prev[aiProvider] }))
                          }
                        >
                          {showKeys[aiProvider] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {/* TEST BUTTON */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !(apiKeys[aiProvider] || '').trim() || validating === aiProvider
                          }
                          onClick={() => handleValidate(aiProvider)}
                        >
                          {validating === aiProvider ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </Button>

                        {/* SAVE CONFIG BUTTON */}
                        <Button
                          size="sm"
                          // canSaveConfig is only true if (Changes exist) AND (Key is validated)
                          disabled={!canSaveConfig}
                          onClick={() => handleSaveKey(aiProvider)}
                        >
                          {saving ? <Loader2 className="animate-spin" /> : 'Save Config'}
                        </Button>
                      </div>
                    </div>
                    {validationResult[aiProvider] !== undefined &&
                      validationResult[aiProvider] !== null && (
                        <p
                          className={`text-xs flex items-center gap-1 ${validationResult[aiProvider] ? 'text-green-400' : 'text-destructive'}`}
                        >
                          {validationResult[aiProvider] ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Valid key
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" /> Invalid key
                            </>
                          )}
                        </p>
                      )}
                    {hasKeys[aiProvider] && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevokeKey(aiProvider)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <Separator />
                <div className="space-y-2">
                  <Label>Translation Scope</Label>
                  <Select
                    value={translationScope}
                    onValueChange={(v) =>
                      setTranslationScope(v as 'all' | 'comment' | 'string_literal')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All (Comments + Literal Strings)</SelectItem>
                      <SelectItem value="comment">Comments Only</SelectItem>
                      <SelectItem value="string_literal">String Literals Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Controls which node types are sent to the AI for translation.
                  </p>
                </div>

                {/* SYSTEM PROMPT */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5" />
                      System Prompt
                      {isPromptDirty && (
                        <span className="text-[10px] text-orange-400 font-medium ml-1">
                          (Unsaved)
                        </span>
                      )}
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={handleResetPrompt}
                    >
                      <RotateCcw className="mr-1 h-2.5 w-2.5" />
                      Reset to default
                    </Button>
                  </div>
                  <textarea
                    className={`w-full h-48 p-3 text-[11px] font-mono border rounded-md bg-background resize-none transition-colors ${isPromptDirty ? 'border-orange-400/50' : ''}`}
                    value={localPrompt}
                    onChange={(e) => setLocalPrompt(e.target.value)}
                    spellCheck={false}
                  />
                </div>

                {/* Source Language */}
                <div className="space-y-2">
                  <Label>Source Language</Label>
                  <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Chinese">Chinese (中文)</SelectItem>
                      <SelectItem value="Japanese">Japanese (日本語)</SelectItem>
                      <SelectItem value="Korean">Korean (한국어)</SelectItem>
                      <SelectItem value="Arabic">Arabic (العربية)</SelectItem>
                      <SelectItem value="Russian">Russian (Русский)</SelectItem>
                      <SelectItem value="Thai">Thai (ไทย)</SelectItem>
                      <SelectItem value="Hindi">Hindi (हिन्दी)</SelectItem>
                      <SelectItem value="Hebrew">Hebrew (עبريت)</SelectItem>
                      <SelectItem value="Vietnamese">Vietnamese</SelectItem>
                      <SelectItem value="Indonesian">Indonesian</SelectItem>
                      <SelectItem value="French">French (Français)</SelectItem>
                      <SelectItem value="Spanish">Spanish (Español)</SelectItem>
                      <SelectItem value="German">German (Deutsch)</SelectItem>
                      <SelectItem value="Portuguese">Portuguese (Português)</SelectItem>
                      <SelectItem value="Italian">Italian (Italiano)</SelectItem>
                      <SelectItem value="Turkish">Turkish (Türkçe)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The language to translate from. CJK/Arabic/Cyrillic scripts, only text
                    containing those characters will be extracted during scan.
                  </p>
                </div>

                {/* Target Language */}
                <div className="space-y-2">
                  <Label>Target Language</Label>
                  <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Chinese">Chinese (中文)</SelectItem>
                      <SelectItem value="Japanese">Japanese (日本語)</SelectItem>
                      <SelectItem value="Korean">Korean (한국어)</SelectItem>
                      <SelectItem value="Arabic">Arabic (العربية)</SelectItem>
                      <SelectItem value="Russian">Russian (Русский)</SelectItem>
                      <SelectItem value="Thai">Thai (ไทย)</SelectItem>
                      <SelectItem value="Hindi">Hindi (हिन्दी)</SelectItem>
                      <SelectItem value="Hebrew">Hebrew (עبريت)</SelectItem>
                      <SelectItem value="Vietnamese">Vietnamese</SelectItem>
                      <SelectItem value="Indonesian">Indonesian</SelectItem>
                      <SelectItem value="French">French (Français)</SelectItem>
                      <SelectItem value="Spanish">Spanish (Español)</SelectItem>
                      <SelectItem value="German">German (Deutsch)</SelectItem>
                      <SelectItem value="Portuguese">Portuguese (Português)</SelectItem>
                      <SelectItem value="Italian">Italian (Italiano)</SelectItem>
                      <SelectItem value="Turkish">Turkish (Türkçe)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The language to translate to.</p>
                </div>

                {/* Batch Size */}
                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={2000}
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 10)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of translation items per API request (1–2000). Larger batches are fine
                    for short strings.
                  </p>
                </div>

                {/* RPM (Requests Per Minute) */}
                <div className="space-y-2">
                  <Label>RPM (Requests Per Minute)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={rpm}
                    onChange={(e) => setRpm(parseInt(e.target.value, 10) || 4)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Burst-mode: fires this many batch requests in parallel, then waits 3s before the
                    next burst. Higher RPM = faster but may hit rate limits.
                  </p>
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-mono w-8 text-right">
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Controls comment translation creativity (0.0 = precise, 1.0 = creative). String
                    literals always use 0.0.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="ignore" className="mt-0 space-y-4 focus-visible:outline-none">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3">
                  <FileX2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">Ignore Patterns</h4>
                    <p className="text-xs text-muted-foreground">
                      Files and folders matching these patterns will be skipped during scanning.
                      Works like{' '}
                      <code className="text-[10px] bg-muted px-1 rounded">.gitignore</code> — one
                      pattern per line. Lines starting with{' '}
                      <code className="text-[10px] bg-muted px-1 rounded">#</code> are comments.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Patterns List</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        setIgnorePatterns(
                          '.git\nnode_modules\n.next\ndist\nout\nbuild\ntarget\n.gradle\n__pycache__\n.venv\nvendor\n.idea\n.vscode\n.DS_Store'
                        )
                      }}
                    >
                      <RotateCcw className="mr-1 h-2.5 w-2.5" />
                      Reset to Defaults
                    </Button>
                  </div>
                  <textarea
                    className="w-full h-64 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={ignorePatterns}
                    onChange={(e) => setIgnorePatterns(e.target.value)}
                    placeholder="# Folders to ignore&#10;node_modules&#10;.git&#10;dist&#10;build"
                    spellCheck={false}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Patterns are also merged with{' '}
                  <code className="text-[10px] bg-muted px-1 rounded">.translatorignore</code> in
                  your workspace root, if present.
                </p>
              </TabsContent>

              <TabsContent
                value="license"
                className="mt-0 focus-visible:outline-none flex-1 flex-col justify-between data-[state=active]:flex"
              >
                <div className="flex items-start gap-4 rounded-lg border bg-blue-500/5 border-blue-500/20 p-4">
                  <CheckCircle2 className="h-8 w-8 text-blue-500 mt-0.5 shrink-0" />
                  <div className="space-y-1 select-none">
                    <h4 className="text-md font-semibold">Sutura</h4>
                    <p className="text-xs text-muted-foreground">
                      Version:{' '}
                      <span className="text-foreground font-medium">{appVersion} (Release)</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      License Type: <span className="text-foreground">MIT License</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Sutura is open-source software. You are free to use, modify, and distribute
                      it.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-xs text-muted-foreground">Updates & Source Code</Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        className="w-full"
                        variant={updateVersion ? 'default' : 'outline'}
                        disabled={checkingUpdate || downloadingUpdate}
                        onClick={handleCheckForUpdates}
                      >
                        {checkingUpdate || downloadingUpdate ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {downloadingUpdate
                          ? 'Downloading...'
                          : checkingUpdate
                            ? 'Checking...'
                            : updateVersion
                              ? `Download Update (${updateVersion})`
                              : 'Check for Updates'}
                      </Button>
                      <Button
                        className="w-full"
                        onClick={() =>
                          window.api.openExternal('https://github.com/marsaariqi/sutura')
                        }
                      >
                        View on GitHub
                      </Button>
                    </div>
                    {updateMessage && (
                      <p
                        className={`text-xs text-center ${updateMessage.type === 'success' ? 'text-green-400' : updateMessage.type === 'error' ? 'text-red-400' : 'text-blue-400'}`}
                      >
                        {updateMessage.text}
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </div>

          {settingsTab !== 'license' && (
            <DialogFooter className="px-4 py-2 border-t bg-muted/20 shrink-0 sm:flex-row sm:justify-end sm:space-x-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save All Settings
              </Button>
            </DialogFooter>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
