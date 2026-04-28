import { getDb, getSetting } from './database'
import { logInfo, logSuccess, logError } from './logger'

export async function analyzeFrequency(
  minFrequency: number,
  scope: 'global' | 'workspace',
  workspaceId?: number
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodejieba = require('nodejieba')
  const db = getDb()
  const sourceLang = getSetting('glossary_source_language') || 'Chinese'
  const actualWorkspaceId = scope === 'global' ? 0 : workspaceId || 0

  logInfo(`Starting ${scope} glossary scan (min frequency: ${minFrequency})...`, {
    metadata: {
      event: 'glossary:scan_start',
      scope,
      minFrequency,
      workspaceId: actualWorkspaceId
    }
  })

  let rows: { original_text: string }[] = []

  // 1. Fetching rows
  if (scope === 'workspace' && actualWorkspaceId) {
    rows = db
      .prepare(
        `
      SELECT t.original_text 
      FROM translations t
      JOIN files f ON t.file_id = f.id
      WHERE (t.source_lang = ? OR t.source_lang IS NULL) AND f.workspace_id = ?
    `
      )
      .all(sourceLang, actualWorkspaceId) as { original_text: string }[]
  } else {
    rows = db
      .prepare(
        `
      SELECT original_text 
      FROM translations 
      WHERE source_lang = ? OR source_lang IS NULL
    `
      )
      .all(sourceLang) as { original_text: string }[]
  }

  const frequencyMap = new Map<string, number>()
  const isStrictCJK = /^[\u4e00-\u9fa5]+$/
  const isNumber = /^\d+$/

  // 2. CHUNKED PROCESSING (The Core Logic)
  const chunkSize = 10000
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)

    for (const row of chunk) {
      if (!row.original_text) continue

      if (sourceLang === 'Chinese') {
        const words = nodejieba.cutAll(row.original_text)
        for (const word of words) {
          const trimmed = word.trim()
          if (trimmed.length > 1 && isStrictCJK.test(trimmed)) {
            frequencyMap.set(trimmed, (frequencyMap.get(trimmed) || 0) + 1)
          }
        }
      } else {
        const words = row.original_text.split(/\W+/)
        for (const word of words) {
          const trimmed = word.trim()
          if (trimmed.length > 1 && !isNumber.test(trimmed)) {
            frequencyMap.set(trimmed, (frequencyMap.get(trimmed) || 0) + 1)
          }
        }
      }
    }

    await new Promise((resolve) => setImmediate(resolve))
  }

  // 3. DATABASE UPDATE (Transaction)
  try {
    const runTransaction = db.transaction(() => {
      // Reset counts to accurately reflect the current code state
      db.prepare('UPDATE glossary SET occurrence_count = 0 WHERE workspace_id = ?').run(
        actualWorkspaceId
      )

      const stmt = db.prepare(`
        INSERT INTO glossary (workspace_id, term, occurrence_count) 
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id, term) DO UPDATE SET occurrence_count = excluded.occurrence_count
      `)

      let inserted = 0
      for (const [term, count] of frequencyMap.entries()) {
        if (count >= minFrequency) {
          stmt.run(actualWorkspaceId, term, count)
          inserted++
        }
      }

      // Cleanup low-frequency or missing terms
      const deleted = db
        .prepare(
          `
        DELETE FROM glossary 
        WHERE workspace_id = ? AND occurrence_count < ?
      `
        )
        .run(actualWorkspaceId, minFrequency)

      return { inserted, deletedCount: deleted.changes }
    })

    const result = runTransaction()

    logSuccess(
      `Glossary scan complete. Preserved/Inserted ${result.inserted} terms. Cleaned up ${result.deletedCount} outdated terms.`,
      {
        metadata: {
          event: 'glossary:scan_done',
          scope,
          inserted: result.inserted,
          minFrequency,
          deleted: result.deletedCount
        }
      }
    )
  } catch (err) {
    logError(`Glossary scan error: ${(err as Error).message}`, {
      metadata: { event: 'glossary:scan_error', error: (err as Error).message }
    })
    throw err
  }

  return { success: true }
}
