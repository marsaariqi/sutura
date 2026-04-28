import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface TranslationEntry {
  id: number
  line_start: number
  col_start: number
  line_end: number
  col_end: number
  node_type: string
  original_text: string
  translated_text: string | null
  status: string
}

export function TranslationSummary({
  open,
  onOpenChange,
  fileId,
  fileStatus = 'pending'
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: number
  fileStatus?: string
}) {
  const isFileDone = fileStatus === 'done' || fileStatus === 'translated'
  const [translations, setTranslations] = useState<TranslationEntry[]>([])

  useEffect(() => {
    if (!open || !fileId) return

    async function load() {
      const trans = await window.api.getTranslations(fileId)
      setTranslations(trans)
    }

    load()
  }, [open, fileId])

  const handleToggleExclude = useCallback(async (translationId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'excluded' ? 'pending' : 'excluded'
    // Optimistic UI update
    setTranslations((prev) =>
      prev.map((t) => (t.id === translationId ? { ...t, status: newStatus } : t))
    )
    try {
      const result = await window.api.updateTranslationStatus(translationId, newStatus)
      if (!result.success) {
        // Rollback on failure
        setTranslations((prev) =>
          prev.map((t) => (t.id === translationId ? { ...t, status: currentStatus } : t))
        )
        console.error('Failed to update translation status:', result.error)
      }
    } catch (err) {
      // Rollback on error
      setTranslations((prev) =>
        prev.map((t) => (t.id === translationId ? { ...t, status: currentStatus } : t))
      )
      console.error('Error toggling exclusion:', err)
    }
  }, [])

  const doneCount = translations.filter((t) => t.status === 'done').length
  const pendingCount = translations.filter((t) => t.status === 'pending').length
  const errorCount = translations.filter((t) => t.status === 'error').length
  const excludedCount = translations.filter((t) => t.status === 'excluded').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Translation Summary</DialogTitle>
          <DialogDescription>
            {translations.length} segments — {doneCount} translated, {pendingCount} pending
            {errorCount > 0 && `, ${errorCount} errors`}
            {excludedCount > 0 && `, ${excludedCount} excluded`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-2">
          <div className="space-y-3 pb-4">
            {translations.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg border bg-card p-3 space-y-2 ${t.status === 'excluded' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      t.status === 'done'
                        ? 'default'
                        : t.status === 'error'
                          ? 'destructive'
                          : t.status === 'excluded'
                            ? 'outline'
                            : 'secondary'
                    }
                    className="text-[10px] px-1.5 py-0"
                  >
                    {t.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    #{t.id}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {t.node_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto mr-2">
                    Line {t.line_start}
                    {t.line_start !== t.line_end && `–${t.line_end}`}
                  </span>
                  {(t.status === 'pending' || t.status === 'excluded') && !isFileDone && (
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Label
                        htmlFor={`toggle-${t.id}`}
                        className="text-[10px] text-muted-foreground cursor-pointer select-none"
                      >
                        {t.status === 'excluded' ? 'Off' : 'On'}
                      </Label>
                      <Switch
                        id={`toggle-${t.id}`}
                        checked={t.status !== 'excluded'}
                        onCheckedChange={() => handleToggleExclude(t.id, t.status)}
                        className="h-4 w-7 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-muted-foreground/30 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                      />
                    </div>
                  )}
                </div>
                <div
                  className={`text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto ${t.status === 'excluded' ? 'line-through' : ''}`}
                >
                  {t.original_text}
                </div>
                {t.translated_text && (
                  <div className="text-xs font-mono bg-green-500/5 border border-green-500/20 rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto">
                    → {t.translated_text}
                  </div>
                )}
              </div>
            ))}
            {translations.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No translations found for this file.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
