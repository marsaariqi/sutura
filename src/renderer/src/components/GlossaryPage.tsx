import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Loader2,
  LucideBookA,
  RefreshCw,
  Zap
} from 'lucide-react'

interface GlossaryTerm {
  id: number
  workspace_id: number
  term: string
  occurrence_count: number
  translation: string | null
  translation_source: string | null
  is_enabled: number
}

const SUPPORTED_TARGETS = [
  'English'
  // 'Indonesian',
  // 'Japanese',
  // 'Korean',
  // 'Spanish',
  // 'French',
  // 'German',
  // 'Russian',
  // 'Portuguese',
  // 'Italian',
  // 'Dutch',
  // 'Arabic',
  // 'Turkish'
]

import { useAppStore } from '@/stores/app-store'

export function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const focusValueRef = useRef<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{
    key: keyof GlossaryTerm | 'duplication'
    direction: 'asc' | 'desc'
  } | null>(null)
  const glossaryMinFreq = useAppStore((s) => s.glossaryMinFreq)
  const setGlossaryMinFreq = useAppStore((s) => s.setGlossaryMinFreq)
  const [scope, setScope] = useState<'workspace' | 'global'>('workspace')
  const [glossaryUsage, setGlossaryUsage] = useState<string>('none')

  // Language states
  const [sourceLang, setSourceLang] = useState<string>('Chinese')
  const [targetLang, setTargetLang] = useState<string>('English')

  const isGlossaryScanning = useAppStore((s) => s.isGlossaryScanning)
  const setGlossaryScanning = useAppStore((s) => s.setGlossaryScanning)
  const isGlossaryTranslating = useAppStore((s) => s.isGlossaryTranslating)
  const setGlossaryTranslating = useAppStore((s) => s.setGlossaryTranslating)
  const glossaryProgress = useAppStore((s) => s.glossaryProgress)
  const setGlossaryProgress = useAppStore((s) => s.setGlossaryProgress)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = window.api.onGlossaryProgress((stats) => {
      setGlossaryProgress(stats)
    })
    return () => unsub()
  }, [])

  const prevTranslating = useRef(isGlossaryTranslating)
  useEffect(() => {
    if (prevTranslating.current && !isGlossaryTranslating) {
      // Translation just finished
      fetchTerms(scope)
    }
    prevTranslating.current = isGlossaryTranslating
  }, [isGlossaryTranslating, scope])

  useEffect(() => {
    const unsub = window.api.onGlossaryProgress((stats) => {
      setGlossaryProgress(stats)
    })
    return () => unsub()
  }, [])

  const fetchTerms = async (currentScope: 'workspace' | 'global') => {
    try {
      const res = await window.api.getGlossaryTerms(currentScope)
      if (res.success) {
        setTerms(res.terms)
        if (res.terms && res.terms.length > 0) {
          const lowestCount = res.terms[res.terms.length - 1].occurrence_count
          setGlossaryMinFreq(lowestCount)
        } else {
          setGlossaryMinFreq(5)
        }
      } else {
        setError(res.error || 'Failed to fetch terms')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const fetchSettings = async () => {
    try {
      const usage = await window.api.getSetting('glossary_usage')
      if (usage) setGlossaryUsage(usage)

      const sLang = await window.api.getSetting('glossary_source_language')
      if (sLang) setSourceLang(sLang)

      const tLang = await window.api.getSetting('glossary_target_language')
      if (tLang) setTargetLang(tLang)
    } catch (err) {
      console.error('Failed to get glossary settings', err)
    }
  }

  useEffect(() => {
    fetchTerms(scope)
    fetchSettings()
  }, [scope])

  const handleScan = async () => {
    setGlossaryScanning(true)
    setError(null)
    try {
      const res = await window.api.analyzeFrequency(glossaryMinFreq, scope)
      if (res.success) {
        await fetchTerms(scope)
      } else {
        setError(res.error || 'Failed to scan frequency')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGlossaryScanning(false)
    }
  }

  const handleTranslateAI = async () => {
    setGlossaryTranslating(true)
    setGlossaryProgress({ totalItems: 0, completedItems: 0, errorItems: 0 })
    setError(null)
    try {
      const res = await window.api.translateGlossaryWithAI(scope)
      if (res.success) {
        await fetchTerms(scope)
      } else {
        setError(res.error || 'Failed to translate with AI')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGlossaryTranslating(false)
    }
  }

  const handleUpdateTerm = async (
    id: number,
    translation: string | null,
    translationSource: string | null,
    isEnabled: number
  ) => {
    // Optimistic update
    setTerms((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, translation, translation_source: translationSource, is_enabled: isEnabled }
          : t
      )
    )
    try {
      await window.api.updateGlossaryTerm(id, translation, translationSource, isEnabled)
    } catch (err) {
      setError((err as Error).message)
      // Revert on error
      fetchTerms(scope)
    }
  }

  const handleTranslationChange = (id: number, val: string, initialVal: string | null) => {
    const term = terms.find((t) => t.id === id)
    if (term) {
      const normalizedNew = val.trim() === '' ? null : val
      const normalizedOld = (initialVal || '').trim() === '' ? null : initialVal

      // Only update if the value actually changed from when we focused
      if (normalizedNew !== normalizedOld) {
        const newSource = normalizedNew ? 'user' : null
        handleUpdateTerm(id, normalizedNew, newSource, term.is_enabled)
      }
    }
  }

  const handleToggleEnable = (id: number, checked: boolean) => {
    const term = terms.find((t) => t.id === id)
    if (term) {
      handleUpdateTerm(id, term.translation, term.translation_source, checked ? 0 : 1)
    }
  }

  const handleToggleAll = async (checked: boolean) => {
    // Optimistic update
    setTerms((prev) => prev.map((t) => ({ ...t, is_enabled: checked ? 0 : 1 })))
    try {
      await window.api.toggleAllGlossaryTerms(checked, scope)
    } catch (err) {
      setError((err as Error).message)
      fetchTerms(scope)
    }
  }

  const handleUsageChange = async (val: string) => {
    setGlossaryUsage(val)
    await window.api.setSetting('glossary_usage', val)
  }

  const handleSourceLangChange = async (val: string) => {
    setSourceLang(val)
    await window.api.setSetting('glossary_source_language', val)
  }

  const handleTargetLangChange = async (val: string) => {
    setTargetLang(val)
    await window.api.setSetting('glossary_target_language', val)
  }

  const translationFrequencies = useMemo(() => {
    const counts: Record<string, number> = {}
    terms.forEach((t) => {
      if (t.translation) {
        const key = t.translation.toLowerCase().trim()
        counts[key] = (counts[key] || 0) + 1
      }
    })
    return counts
  }, [terms])

  const handleSort = (key: keyof GlossaryTerm | 'duplication') => {
    if (sortConfig && sortConfig.key === key) {
      // Toggle to DESC if currently ASC, or CLEAR if already DESC (or if it's duplication which is DESC only)
      if (key === 'duplication' || sortConfig.direction === 'desc') {
        setSortConfig(null)
      } else {
        setSortConfig({ key, direction: 'desc' })
      }
      return
    }

    // Default directions: duplication and count should start with DESC
    const direction = key === 'duplication' || key === 'occurrence_count' ? 'desc' : 'asc'
    setSortConfig({ key, direction })
  }

  const sortedTerms = useMemo(() => {
    if (!sortConfig) return terms

    return [...terms].sort((a, b) => {
      if (sortConfig.key === 'duplication') {
        const aKey = a.translation?.toLowerCase().trim() || ''
        const bKey = b.translation?.toLowerCase().trim() || ''
        const aCount = aKey ? translationFrequencies[aKey] || 0 : 0
        const bCount = bKey ? translationFrequencies[bKey] || 0 : 0

        if (aCount !== bCount) {
          return sortConfig.direction === 'asc' ? aCount - bCount : bCount - aCount
        }
        // If counts same, sort by translation alphabetically
        return aKey.localeCompare(bKey)
      }

      const aValue = a[sortConfig.key as keyof GlossaryTerm]
      const bValue = b[sortConfig.key as keyof GlossaryTerm]

      if (aValue === null) return 1
      if (bValue === null) return -1

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const res = aValue.toLowerCase().localeCompare(bValue.toLowerCase())
        return sortConfig.direction === 'asc' ? res : -res
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [terms, sortConfig, translationFrequencies])

  const allEnabled = terms.length > 0 && terms.every((t) => t.is_enabled === 0)
  const someEnabled = terms.some((t) => t.is_enabled === 0)

  const pendingTranslationCount = useMemo(() => {
    return terms.filter((t) => t.is_enabled === 0 && !t.translation).length
  }, [terms])

  const SortIndicator = ({ column }: { column: keyof GlossaryTerm | 'duplication' }) => {
    if (!sortConfig || sortConfig.key !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    )
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <header className="flex flex-col gap-4 border-b px-6 py-4 shrink-0 bg-card/50">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Glossary Discovery</h2>
            <p className="text-sm text-muted-foreground">
              Scan your codebase for frequent terms and define standardized translations to improve
              AI consistency.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Active Glossary:
              </Label>
              <Select value={glossaryUsage} onValueChange={handleUsageChange}>
                <SelectTrigger className="w-45 h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Disabled)</SelectItem>
                  <SelectItem value="workspace">Current Workspace</SelectItem>
                  <SelectItem value="global">Global Shared</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 opacity-80 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Source:
                </Label>
                <Select value={sourceLang} onValueChange={handleSourceLangChange}>
                  <SelectTrigger className="w-22.5 h-6 text-xs">
                    <SelectValue placeholder="Chinese" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Chinese">Chinese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Target:
                </Label>
                <Select value={targetLang} onValueChange={handleTargetLangChange}>
                  <SelectTrigger className="w-22.5 h-6 text-xs">
                    <SelectValue placeholder="English" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_TARGETS.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
      </header>

      <div className="px-6 pt-4 border-b shrink-0 bg-background">
        {isGlossaryTranslating && glossaryProgress.totalItems > 0 && (
          <div className="mb-4 space-y-2 p-3 border rounded-lg bg-card/50">
            <div className="flex justify-between text-xs font-medium">
              <span>AI Translation in progress...</span>
              <span>
                {glossaryProgress.completedItems + glossaryProgress.errorItems} /{' '}
                {glossaryProgress.totalItems}
              </span>
            </div>
            <Progress
              value={
                (Math.min(
                  glossaryProgress.completedItems + glossaryProgress.errorItems,
                  glossaryProgress.totalItems
                ) /
                  glossaryProgress.totalItems) *
                100
              }
              className="h-2"
            />
          </div>
        )}
        <Tabs
          value={scope}
          onValueChange={(val) => setScope(val as 'workspace' | 'global')}
          className="w-full"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TabsList>
                <TabsTrigger value="workspace">Current Workspace</TabsTrigger>
                <TabsTrigger value="global">Global Dictionary</TabsTrigger>
              </TabsList>
              <Button
                size="sm"
                variant="ghost"
                className={`h-9 w-9 p-0 ${sortConfig?.key === 'duplication' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                onClick={() => handleSort('duplication')}
                title="Sort by Duplicates"
                disabled={isGlossaryScanning || isGlossaryTranslating || terms.length === 0}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="min-freq" className="text-xs">
                  Min Freq
                </Label>
                <Input
                  id="min-freq"
                  type="number"
                  value={glossaryMinFreq}
                  onChange={(e) => setGlossaryMinFreq(parseInt(e.target.value) || 1)}
                  className="w-16 h-8 text-sm"
                  min={1}
                  disabled={isGlossaryScanning || isGlossaryTranslating}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleScan}
                disabled={isGlossaryScanning || isGlossaryTranslating}
              >
                {isGlossaryScanning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Scan {scope === 'workspace' ? 'Workspace' : 'Global'}
              </Button>
              <Button
                size="sm"
                onClick={handleTranslateAI}
                disabled={
                  isGlossaryTranslating || isGlossaryScanning || pendingTranslationCount === 0
                }
              >
                {isGlossaryTranslating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Translate with AI {pendingTranslationCount > 0 && `(${pendingTranslationCount})`}
              </Button>
            </div>
          </div>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 pt-0 relative mt-2">
        {terms.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm flex-col gap-2">
            <LucideBookA className="h-10 w-10 opacity-20" />
            <p>No {scope} glossary terms found. Scan your codebase to discover frequent terms.</p>
          </div>
        ) : (
          <div className="rounded-md border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="bg-background border-b sticky top-0 z-50 shadow-sm">
                <tr>
                  <th
                    className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('term')}
                  >
                    <div className="flex items-center">
                      Term
                      <SortIndicator column="term" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 font-medium w-24 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('occurrence_count')}
                  >
                    <div className="flex items-center">
                      Count
                      <SortIndicator column="occurrence_count" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 font-medium min-w-50 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('translation')}
                  >
                    <div className="flex items-center">
                      Translation
                      <SortIndicator column="translation" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 font-medium w-24 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('translation_source')}
                  >
                    <div className="flex items-center">
                      Source
                      <SortIndicator column="translation_source" />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium w-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div
                        className="flex items-center cursor-pointer hover:text-primary transition-colors mb-1"
                        onClick={() => handleSort('is_enabled')}
                      >
                        Enabled
                        <SortIndicator column="is_enabled" />
                      </div>
                      <Switch
                        checked={allEnabled}
                        onCheckedChange={handleToggleAll}
                        disabled={isGlossaryTranslating || isGlossaryScanning}
                        data-state={
                          !allEnabled && someEnabled
                            ? 'indeterminate'
                            : allEnabled
                              ? 'checked'
                              : 'unchecked'
                        }
                        className={!allEnabled && someEnabled ? 'bg-primary/50' : ''}
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedTerms.map((t) => {
                  const tKey = t.translation?.toLowerCase().trim() || ''
                  const isDuplicate = tKey ? (translationFrequencies[tKey] || 0) > 1 : false

                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors hover:bg-muted/50 ${isDuplicate ? 'bg-amber-500/5 hover:bg-amber-500/10' : ''}`}
                    >
                      <td className="px-4 py-2 font-mono break-all">{t.term}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.occurrence_count}</td>
                      <td className="px-4 py-2 relative">
                        <div className="flex items-center gap-2">
                          <Input
                            value={t.translation || ''}
                            disabled={isGlossaryTranslating || isGlossaryScanning}
                            onFocus={(e) => {
                              focusValueRef.current = e.target.value
                            }}
                            onChange={(e) => {
                              setTerms((prev) =>
                                prev.map((p) =>
                                  p.id === t.id ? { ...p, translation: e.target.value } : p
                                )
                              )
                            }}
                            onBlur={(e) =>
                              handleTranslationChange(t.id, e.target.value, focusValueRef.current)
                            }
                            placeholder="Enter translation..."
                            className="h-8 w-full"
                          />
                          {isDuplicate && (
                            <div
                              title="Duplicate translation found"
                              className="shrink-0 text-amber-500/60"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {t.translation_source && (
                          <Badge
                            variant={t.translation_source === 'AI' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {t.translation_source}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center align-middle">
                        <Switch
                          checked={t.is_enabled === 0}
                          onCheckedChange={(checked) => handleToggleEnable(t.id, checked)}
                          disabled={isGlossaryTranslating || isGlossaryScanning}
                        />
                      </td>{' '}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
