import { readFileSync, writeFileSync } from 'fs'
import { TranslationRow } from './database'
import { formatFile } from './formatter'
import { saveFileBackup } from './database'

/**
 * Surgical Injection Logic (Buffer-Based).
 *
 * Reads a file as a Buffer, maps line/col positions to byte offsets,
 * and replaces original text with translated text using Buffer.concat().
 * Handles multi-byte UTF-8 characters correctly.
 */

interface Replacement {
  byteStart: number
  byteEnd: number
  newText: string
}

/**
 * Convert line:col position to byte offset in a UTF-8 buffer.
 * Lines are 1-based, columns are 0-based byte offsets
 * (tree-sitter columns are UTF-8 byte offsets from the start of the line).
 */
function positionToByteOffset(source: string, line: number, col: number): number {
  const lines = source.split('\n')
  let offset = 0

  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += Buffer.byteLength(lines[i], 'utf-8') + 1 // +1 for newline
  }

  // col is already a byte offset from the start of the line (tree-sitter uses UTF-8 bytes)
  offset += col

  return offset
}

/**
 * Search for the exact original_text near the expected byte position in the buffer.
 * Returns the byte offset where the text was found, or -1 if not found.
 * This handles cases where tree-sitter column offsets may be character-based
 * rather than byte-based (e.g. with multi-byte UTF-8 characters).
 */
function findTextNearPosition(buffer: Buffer, original: string, expectedOffset: number): number {
  const searchBuf = Buffer.from(original, 'utf-8')
  const searchLen = searchBuf.length

  // First: exact match at expected position
  if (
    expectedOffset >= 0 &&
    expectedOffset + searchLen <= buffer.length &&
    buffer.subarray(expectedOffset, expectedOffset + searchLen).equals(searchBuf)
  ) {
    return expectedOffset
  }

  // Determine a reasonable search window based on how many multi-byte chars
  // might be in the line before this position (each can shift by up to 2 bytes)
  const windowSize = Math.max(200, expectedOffset)
  const searchStart = Math.max(0, expectedOffset - windowSize)
  const searchEnd = Math.min(buffer.length, expectedOffset + windowSize)

  // Search forward from searchStart
  for (let i = searchStart; i <= searchEnd - searchLen; i++) {
    if (buffer[i] === searchBuf[0] && buffer.subarray(i, i + searchLen).equals(searchBuf)) {
      return i
    }
  }

  return -1
}

/**
 * Build replacement list from translations.
 * Verifies that original_text still exists at the expected position.
 * If the text isn't found at the computed byte offset (e.g. due to column
 * encoding differences with multi-byte chars), searches nearby.
 */
function buildReplacements(source: string, translations: TranslationRow[]): Replacement[] {
  const doneTranslations = translations.filter((t) => t.status === 'done' && t.translated_text)
  if (doneTranslations.length === 0) return []

  const buffer = Buffer.from(source, 'utf-8')

  return doneTranslations
    .map((t) => {
      const expectedOffset = positionToByteOffset(source, t.line_start, t.col_start)
      const originalByteLen = Buffer.byteLength(t.original_text, 'utf-8')

      // Try exact match first, then search nearby if multi-byte offset mismatch
      const byteStart = findTextNearPosition(buffer, t.original_text, expectedOffset)
      if (byteStart === -1) {
        // Text not found anywhere near expected position — already translated or file changed
        return null
      }
      const byteEnd = byteStart + originalByteLen

      return {
        byteStart,
        byteEnd,
        newText: t.translated_text!
      }
    })
    .filter((r): r is Replacement => r !== null)
}

/**
 * Apply replacements to a buffer and return the result buffer.
 */
function applyReplacements(buffer: Buffer, replacements: Replacement[]): Buffer {
  // Sort by byte offset descending to replace from end to start
  // (so earlier offsets remain valid)
  const sorted = [...replacements].sort((a, b) => b.byteStart - a.byteStart)

  let result = buffer
  for (const rep of sorted) {
    const before = result.subarray(0, rep.byteStart)
    const after = result.subarray(rep.byteEnd)
    const newContent = Buffer.from(rep.newText, 'utf-8')
    result = Buffer.concat([before, newContent, after])
  }

  return result
}

/**
 * Virtual injection: apply translations to source string and return
 * the modified content WITHOUT writing to disk.
 */
export function injectTranslationsVirtual(
  source: string,
  translations: TranslationRow[]
): string | null {
  const replacements = buildReplacements(source, translations)
  if (replacements.length === 0) return null

  const buffer = Buffer.from(source, 'utf-8')
  const result = applyReplacements(buffer, replacements)
  return result.toString('utf-8')
}

/**
 * Apply translations to a file using buffer-based surgical replacement.
 * Translations must be for the same file and have status 'done'.
 * If fileId is provided, saves a backup before writing (for revert).
 */
export async function injectTranslations(
  filePath: string,
  translations: TranslationRow[],
  fileId?: number
): Promise<void> {
  const source = readFileSync(filePath, 'utf-8')
  const replacements = buildReplacements(source, translations)
  if (replacements.length === 0) return

  // Save backup before writing (for revert)
  if (fileId !== undefined) {
    saveFileBackup(fileId, source)
  }

  const buffer = Buffer.from(source, 'utf-8')
  const result = applyReplacements(buffer, replacements)

  writeFileSync(filePath, result)

  // Run formatter dispatcher
  await formatFile(filePath)
}
