import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

let db: Database.Database | null = null

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  return join(dbDir, 'sutura.db')
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath())
    db.pragma('journal_mode = WAL')
    // Turn off foreign keys during schema init/migration
    db.pragma('foreign_keys = OFF')
    initSchema(db)
    // Turn them back on after
    db.pragma('foreign_keys = ON')
  }
  return db
}

function initSchema(database: Database.Database): void {
  // --- MIGRATION: V1 (workspace_path) -> V2 (workspace_id) ---
  let needsMigration = false
  try {
    const columns = database.pragma('table_info(files)') as { name: string }[]
    needsMigration = columns.some((c) => c.name === 'workspace_path')
  } catch {
    // Table might not exist yet
  }

  if (needsMigration) {
    try {
      console.log('Migrating database from workspace_path to workspace_id...')
      database.transaction(() => {
        // 1. Ensure recent_workspaces exists
        database.exec(`
          CREATE TABLE IF NOT EXISTS recent_workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            last_opened TEXT NOT NULL DEFAULT (datetime('now')),
            file_count INTEGER NOT NULL DEFAULT 0,
            intact_count INTEGER NOT NULL DEFAULT 0,
            translated_count INTEGER NOT NULL DEFAULT 0
          );
        `)

        // 2. Populate recent_workspaces
        const workspaces = database
          .prepare('SELECT DISTINCT workspace_path FROM files WHERE workspace_path IS NOT NULL')
          .all() as { workspace_path: string }[]
        const insertWs = database.prepare(
          'INSERT OR IGNORE INTO recent_workspaces (path, name) VALUES (?, ?)'
        )
        for (const ws of workspaces) {
          if (ws.workspace_path) {
            const name = ws.workspace_path.split(/[\\\\/]/).pop() || ws.workspace_path
            insertWs.run(ws.workspace_path, name)
          }
        }

        try {
          const usageWorkspaces = database
            .prepare(
              'SELECT DISTINCT workspace_path FROM usage_stats WHERE workspace_path IS NOT NULL'
            )
            .all() as { workspace_path: string }[]
          for (const ws of usageWorkspaces) {
            if (ws.workspace_path) {
              const name = ws.workspace_path.split(/[\\\\/]/).pop() || ws.workspace_path
              insertWs.run(ws.workspace_path, name)
            }
          }
        } catch {
          // usage_stats might not exist yet
        }

        // 3. Migrate files
        database.exec(`
          CREATE TABLE files_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            UNIQUE(workspace_id, file_path),
            FOREIGN KEY (workspace_id) REFERENCES recent_workspaces(id) ON DELETE CASCADE
          );
        `)
        database.exec(`
          INSERT INTO files_new (id, workspace_id, file_path, status)
          SELECT f.id, rw.id, f.file_path, f.status
          FROM files f
          JOIN recent_workspaces rw ON f.workspace_path = rw.path;
        `)
        database.exec('DROP TABLE files;')
        database.exec('ALTER TABLE files_new RENAME TO files;')

        // 4. Migrate usage_stats
        try {
          database.exec(`
            CREATE TABLE usage_stats_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              workspace_id INTEGER NOT NULL,
              provider TEXT NOT NULL,
              model TEXT NOT NULL,
              input_tokens INTEGER NOT NULL DEFAULT 0,
              output_tokens INTEGER NOT NULL DEFAULT 0,
              total_tokens INTEGER NOT NULL DEFAULT 0,
              batch_count INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (workspace_id) REFERENCES recent_workspaces(id) ON DELETE CASCADE
            );
          `)
          database.exec(`
            INSERT INTO usage_stats_new (id, workspace_id, provider, model, input_tokens, output_tokens, total_tokens, batch_count, created_at)
            SELECT u.id, rw.id, u.provider, u.model, u.input_tokens, u.output_tokens, u.total_tokens, u.batch_count, u.created_at
            FROM usage_stats u
            JOIN recent_workspaces rw ON u.workspace_path = rw.path;
          `)
          database.exec('DROP TABLE usage_stats;')
          database.exec('ALTER TABLE usage_stats_new RENAME TO usage_stats;')
        } catch {
          // usage_stats might not exist or failed
        }
      })()
      console.log('Database migration successful.')
    } catch (e) {
      console.error('Database migration failed:', e)
    }
  }

  // --- END MIGRATION ---

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        last_opened TEXT NOT NULL DEFAULT (datetime('now')),
        file_count INTEGER NOT NULL DEFAULT 0,
        intact_count INTEGER NOT NULL DEFAULT 0,
        translated_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        UNIQUE(workspace_id, file_path),
        FOREIGN KEY (workspace_id) REFERENCES recent_workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        line_start INTEGER NOT NULL,
        col_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        col_end INTEGER NOT NULL,
        node_type TEXT NOT NULL CHECK(node_type IN ('COMMENT', 'STRING_LITERAL')),
        original_text TEXT NOT NULL,
        translated_text TEXT,
        source_lang TEXT,
        target_lang TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'error', 'excluded')),
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_backups (
        file_id INTEGER PRIMARY KEY,
        content BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS usage_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        batch_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (workspace_id) REFERENCES recent_workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS glossary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        term TEXT NOT NULL,
        occurrence_count INTEGER NOT NULL DEFAULT 0,
        translation TEXT,
        translation_source TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 0,
        UNIQUE(workspace_id, term),
        FOREIGN KEY (workspace_id) REFERENCES recent_workspaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
      CREATE INDEX IF NOT EXISTS idx_translations_file_id ON translations(file_id);
      CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(status);
      CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_stats(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_stats(provider);
      CREATE INDEX IF NOT EXISTS idx_glossary_workspace ON glossary(workspace_id);
    `)
  } catch (e) {
    console.error('Schema Init Error:', e)
    // If there is an existing DB with old schema causing foreign key issues or missing tables,
    // we'll just ignore for now as per instructions (or the user will delete the db file).
  }

  // Insert default settings if not present
  const insertDefault = database.prepare(
    'INSERT OR IGNORE INTO project_settings (key, value) VALUES (?, ?)'
  )
  const defaults: [string, string][] = [
    ['batch_size', '100'],
    ['source_language', 'Chinese'],
    ['target_language', 'English'],
    ['ai_provider', 'gemini'],
    ['context_template', ''],
    ['gemini_api_key_encrypted', ''],
    ['deepseek_api_key_encrypted', ''],
    ['openai_api_key_encrypted', ''],
    ['anthropic_api_key_encrypted', ''],
    ['ollama_base_url', 'http://localhost:11434'],
    ['llamacpp_base_url', 'http://localhost:8080'],
    ['ai_model', ''],
    ['temperature', '0.3'],
    ['rpm', '4'],
    [
      'system_prompt',
      `You are a senior developer. Translate the provided list where "og" is the source text.
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
    ],
    [
      'ignore_patterns',
      '.git\nnode_modules\n.next\ndist\nout\nbuild\ntarget\n.gradle\n__pycache__\n.venv\nvendor\n.idea\n.vscode\n.DS_Store'
    ],
    ['translation_scope', 'all']
  ]
  const insertMany = database.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      insertDefault.run(key, value)
    }
  })
  insertMany(defaults)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

// --- Recent Workspaces ---

export interface RecentWorkspace {
  id: number
  path: string
  name: string
  last_opened: string
  file_count: number
  intact_count: number
  translated_count: number
}

export function getOrInsertWorkspaceId(workspacePath: string): number {
  if (!workspacePath) return 0
  const database = getDb()
  const row = database
    .prepare('SELECT id FROM recent_workspaces WHERE path = ?')
    .get(workspacePath) as { id: number } | undefined
  if (row) return row.id

  const name = workspacePath.split(/[\\/]/).pop() || workspacePath
  const result = database
    .prepare(
      `INSERT INTO recent_workspaces (path, name, last_opened, file_count, intact_count, translated_count)
     VALUES (?, ?, datetime('now'), 0, 0, 0)`
    )
    .run(workspacePath, name)
  return result.lastInsertRowid as number
}

export function upsertRecentWorkspace(
  workspaceId: number,
  fileCount: number,
  intactCount: number,
  translatedCount: number
): void {
  const database = getDb()
  database
    .prepare(
      `UPDATE recent_workspaces SET
         last_opened = datetime('now'),
         file_count = ?,
         intact_count = ?,
         translated_count = ?
       WHERE id = ?`
    )
    .run(fileCount, intactCount, translatedCount, workspaceId)
}

export function getRecentWorkspaces(limit = 10): RecentWorkspace[] {
  const database = getDb()
  return database
    .prepare('SELECT * FROM recent_workspaces ORDER BY last_opened DESC LIMIT ?')
    .all(limit) as RecentWorkspace[]
}

export function removeRecentWorkspace(workspacePath: string): void {
  const database = getDb()
  database.prepare('DELETE FROM recent_workspaces WHERE path = ?').run(workspacePath)
  // files, translations, backups, usage_stats, glossary will cascade delete
}

// --- File operations ---

export function upsertFile(workspaceId: number, filePath: string, status = 'pending'): number {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT INTO files (workspace_id, file_path, status) VALUES (?, ?, ?)
    ON CONFLICT(workspace_id, file_path) DO UPDATE SET status = excluded.status
  `)
  const result = stmt.run(workspaceId, filePath, status)
  return result.lastInsertRowid as number
}

export function getFileById(
  fileId: number
): { id: number; file_path: string; status: string; workspace_id: number } | undefined {
  const database = getDb()
  return database.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as
    | { id: number; file_path: string; status: string; workspace_id: number }
    | undefined
}

export function getFileByPath(
  workspaceId: number,
  filePath: string
): { id: number; file_path: string; status: string } | undefined {
  const database = getDb()
  return database
    .prepare('SELECT * FROM files WHERE workspace_id = ? AND file_path = ?')
    .get(workspaceId, filePath) as { id: number; file_path: string; status: string } | undefined
}

export function getAllFiles(
  workspaceId?: number
): { id: number; file_path: string; status: string }[] {
  const database = getDb()
  if (workspaceId) {
    return database
      .prepare('SELECT * FROM files WHERE workspace_id = ? ORDER BY file_path')
      .all(workspaceId) as {
      id: number
      file_path: string
      status: string
    }[]
  }
  return database.prepare('SELECT * FROM files ORDER BY file_path').all() as {
    id: number
    file_path: string
    status: string
  }[]
}

export function updateFileStatus(fileId: number, status: string): void {
  const database = getDb()
  database.prepare('UPDATE files SET status = ? WHERE id = ?').run(status, fileId)
}

export function clearFiles(workspaceId?: number): void {
  const database = getDb()
  if (workspaceId) {
    database.prepare('DELETE FROM files WHERE workspace_id = ?').run(workspaceId)
  } else {
    database.exec('DELETE FROM files;')
  }
}

// --- Translation operations ---

export interface TranslationRow {
  id: number
  file_id: number
  line_start: number
  col_start: number
  line_end: number
  col_end: number
  node_type: 'COMMENT' | 'STRING_LITERAL'
  original_text: string
  translated_text: string | null
  source_lang?: string
  target_lang?: string
  status: 'pending' | 'done' | 'error' | 'excluded'
}

export function insertTranslation(
  t: Omit<TranslationRow, 'id' | 'translated_text' | 'status'>
): number {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT INTO translations (file_id, line_start, col_start, line_end, col_end, node_type, original_text, source_lang, target_lang, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `)
  const result = stmt.run(
    t.file_id,
    t.line_start,
    t.col_start,
    t.line_end,
    t.col_end,
    t.node_type,
    t.original_text,
    t.source_lang || null,
    t.target_lang || null
  )
  return result.lastInsertRowid as number
}

export function insertTranslationsBatch(
  translations: Omit<TranslationRow, 'id' | 'translated_text' | 'status'>[]
): void {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT INTO translations (file_id, line_start, col_start, line_end, col_end, node_type, original_text, source_lang, target_lang, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `)
  const insertMany = database.transaction(
    (items: Omit<TranslationRow, 'id' | 'translated_text' | 'status'>[]) => {
      for (const t of items) {
        stmt.run(
          t.file_id,
          t.line_start,
          t.col_start,
          t.line_end,
          t.col_end,
          t.node_type,
          t.original_text,
          t.source_lang || null,
          t.target_lang || null
        )
      }
    }
  )
  insertMany(translations)
}

export function getTranslationsByFileId(fileId: number): TranslationRow[] {
  const database = getDb()
  return database
    .prepare('SELECT * FROM translations WHERE file_id = ? ORDER BY line_start, col_start')
    .all(fileId) as TranslationRow[]
}

export function getPendingTranslations(
  limit: number,
  offset = 0,
  workspaceId?: number
): TranslationRow[] {
  const database = getDb()
  const targetLang = getSetting('target_language') || 'English'
  if (workspaceId) {
    return database
      .prepare(
        `SELECT t.* FROM translations t
         JOIN files f ON t.file_id = f.id
         WHERE (t.status IN ('pending', 'error') OR (t.status = 'done' AND IFNULL(t.target_lang, 'English') != ?)) AND f.workspace_id = ?
         ORDER BY t.id LIMIT ? OFFSET ?`
      )
      .all(targetLang, workspaceId, limit, offset) as TranslationRow[]
  }
  return database
    .prepare(
      `SELECT * FROM translations WHERE status IN ('pending', 'error') OR (status = 'done' AND IFNULL(target_lang, 'English') != ?) ORDER BY id LIMIT ? OFFSET ?`
    )
    .all(targetLang, limit, offset) as TranslationRow[]
}

export function getPendingTranslationsForFiles(
  fileIds: number[],
  limit: number,
  offset = 0
): TranslationRow[] {
  const database = getDb()
  const targetLang = getSetting('target_language') || 'English'
  if (fileIds.length === 0) return []
  const placeholders = fileIds.map(() => '?').join(',')
  return database
    .prepare(
      `SELECT * FROM translations WHERE (status IN ('pending', 'error') OR (status = 'done' AND IFNULL(target_lang, 'English') != ?)) AND file_id IN (${placeholders}) ORDER BY id LIMIT ? OFFSET ?`
    )
    .all(targetLang, ...fileIds, limit, offset) as TranslationRow[]
}

export function updateTranslationResult(
  id: number,
  translatedText: string,
  status: 'done' | 'error',
  sourceLang?: string,
  targetLang?: string
): void {
  const database = getDb()
  if (sourceLang !== undefined && targetLang !== undefined) {
    database
      .prepare(
        'UPDATE translations SET translated_text = ?, status = ?, source_lang = ?, target_lang = ? WHERE id = ?'
      )
      .run(translatedText, status, sourceLang, targetLang, id)
  } else {
    database
      .prepare('UPDATE translations SET translated_text = ?, status = ? WHERE id = ?')
      .run(translatedText, status, id)
  }
}

export function getFileIdFromTranslation(translationId: number): number | null {
  const database = getDb()
  const row = database
    .prepare('SELECT file_id FROM translations WHERE id = ?')
    .get(translationId) as { file_id: number } | undefined
  return row?.file_id ?? null
}

export function isFileFullyTranslated(fileId: number): boolean {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT COUNT(*) as pending FROM translations WHERE file_id = ? AND status = 'pending'`
    )
    .get(fileId) as { pending: number }
  return row.pending === 0
}

export function fileHasErrors(fileId: number): boolean {
  const database = getDb()
  const row = database
    .prepare(`SELECT COUNT(*) as errors FROM translations WHERE file_id = ? AND status = 'error'`)
    .get(fileId) as { errors: number }
  return row.errors > 0
}

export function markBatchError(ids: number[]): void {
  if (ids.length === 0) return
  const database = getDb()
  const placeholders = ids.map(() => '?').join(',')
  database
    .prepare(`UPDATE translations SET status = 'error' WHERE id IN (${placeholders})`)
    .run(...ids)
}

export function updateTranslationStatus(id: number, status: 'pending' | 'excluded'): void {
  const database = getDb()
  database.prepare('UPDATE translations SET status = ? WHERE id = ?').run(status, id)
}

export function getTranslationStats(workspaceId?: number): {
  total: number
  pending: number
  done: number
  error: number
  excluded: number
} {
  const database = getDb()
  const targetLang = getSetting('target_language') || 'English'
  if (workspaceId) {
    const row = database
      .prepare(
        `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN t.status = 'pending' OR (t.status = 'done' AND IFNULL(t.target_lang, 'English') != ?) THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN t.status = 'done' AND IFNULL(t.target_lang, 'English') = ? THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN t.status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN t.status = 'excluded' THEN 1 ELSE 0 END) as excluded
      FROM translations t
      JOIN files f ON t.file_id = f.id
      WHERE f.workspace_id = ?`
      )
      .get(targetLang, targetLang, workspaceId) as {
      total: number
      pending: number
      done: number
      error: number
      excluded: number
    }
    return {
      total: row?.total || 0,
      pending: row?.pending || 0,
      done: row?.done || 0,
      error: row?.error || 0,
      excluded: row?.excluded || 0
    }
  }
  const row = database
    .prepare(
      `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' OR (status = 'done' AND IFNULL(target_lang, 'English') != ?) THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'done' AND IFNULL(target_lang, 'English') = ? THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
      SUM(CASE WHEN status = 'excluded' THEN 1 ELSE 0 END) as excluded
    FROM translations`
    )
    .get(targetLang, targetLang) as {
    total: number
    pending: number
    done: number
    error: number
    excluded: number
  }
  return {
    total: row?.total || 0,
    pending: row?.pending || 0,
    done: row?.done || 0,
    error: row?.error || 0,
    excluded: row?.excluded || 0
  }
}

export function getTranslationStatsForFiles(fileIds: number[]): {
  total: number
  pending: number
  done: number
  error: number
  excluded: number
} {
  const database = getDb()
  const targetLang = getSetting('target_language') || 'English'
  if (fileIds.length === 0) {
    return { total: 0, pending: 0, done: 0, error: 0, excluded: 0 }
  }
  const placeholders = fileIds.map(() => '?').join(',')
  const row = database
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' OR (status = 'done' AND IFNULL(target_lang, 'English') != ?) THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'done' AND IFNULL(target_lang, 'English') = ? THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN status = 'excluded' THEN 1 ELSE 0 END) as excluded
      FROM translations
      WHERE file_id IN (${placeholders})`
    )
    .get(targetLang, targetLang, ...fileIds) as {
    total: number
    pending: number
    done: number
    error: number
    excluded: number
  }
  return {
    total: row?.total || 0,
    pending: row?.pending || 0,
    done: row?.done || 0,
    error: row?.error || 0,
    excluded: row?.excluded || 0
  }
}

export function getFilesWithSegmentStatus(
  status: 'error' | 'excluded' | 'pending' | 'done',
  workspaceId?: number
): { fileId: number; filePath: string; count: number }[] {
  const database = getDb()
  const targetLang = getSetting('target_language') || 'English'

  let statusCondition = 't.status = ?'
  let params: any[] = [status]

  if (status === 'pending') {
    statusCondition = `(t.status = 'pending' OR (t.status = 'done' AND IFNULL(t.target_lang, 'English') != ?))`
    params = [targetLang]
  } else if (status === 'done') {
    statusCondition = `(t.status = 'done' AND IFNULL(t.target_lang, 'English') = ?)`
    params = [targetLang]
  }

  if (workspaceId) {
    return database
      .prepare(
        `SELECT f.id as fileId, f.file_path as filePath, COUNT(*) as count
         FROM translations t
         JOIN files f ON t.file_id = f.id
         WHERE ${statusCondition} AND f.workspace_id = ?
         GROUP BY f.id
         ORDER BY count DESC`
      )
      .all(...params, workspaceId) as { fileId: number; filePath: string; count: number }[]
  }
  return database
    .prepare(
      `SELECT f.id as fileId, f.file_path as filePath, COUNT(*) as count
       FROM translations t
       JOIN files f ON t.file_id = f.id
       WHERE ${statusCondition}
       GROUP BY f.id
       ORDER BY count DESC`
    )
    .all(...params) as { fileId: number; filePath: string; count: number }[]
}

export function getNodeTypeStats(workspaceId?: number): { comments: number; strings: number } {
  const database = getDb()
  if (workspaceId) {
    const row = database
      .prepare(
        `SELECT
        SUM(CASE WHEN t.node_type = 'COMMENT' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN t.node_type = 'STRING_LITERAL' THEN 1 ELSE 0 END) as strings
      FROM translations t
      JOIN files f ON t.file_id = f.id
      WHERE f.workspace_id = ?`
      )
      .get(workspaceId) as { comments: number; strings: number }
    return { comments: row?.comments || 0, strings: row?.strings || 0 }
  }
  const row = database
    .prepare(
      `SELECT
      SUM(CASE WHEN node_type = 'COMMENT' THEN 1 ELSE 0 END) as comments,
      SUM(CASE WHEN node_type = 'STRING_LITERAL' THEN 1 ELSE 0 END) as strings
    FROM translations`
    )
    .get() as { comments: number; strings: number }
  return { comments: row?.comments || 0, strings: row?.strings || 0 }
}

export function getFileStats(workspaceId?: number): {
  total: number
  intact: number
  scanned: number
  translating: number
  translated: number
  done: number
  error: number
  pending: number
  unsupported: number
} {
  const database = getDb()
  const whereClause = workspaceId ? 'WHERE workspace_id = ?' : ''
  const query = `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'intact' THEN 1 ELSE 0 END) as intact,
      SUM(CASE WHEN status = 'scanned' THEN 1 ELSE 0 END) as scanned,
      SUM(CASE WHEN status = 'translating' THEN 1 ELSE 0 END) as translating,
      SUM(CASE WHEN status = 'translated' THEN 1 ELSE 0 END) as translated,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'unsupported' THEN 1 ELSE 0 END) as unsupported
    FROM files ${whereClause}`
  const row = (
    workspaceId ? database.prepare(query).get(workspaceId) : database.prepare(query).get()
  ) as {
    total: number
    intact: number
    scanned: number
    translating: number
    translated: number
    done: number
    error: number
    pending: number
    unsupported: number
  }
  return {
    total: row?.total || 0,
    intact: row?.intact || 0,
    scanned: row?.scanned || 0,
    translating: row?.translating || 0,
    translated: row?.translated || 0,
    done: row?.done || 0,
    error: row?.error || 0,
    pending: row?.pending || 0,
    unsupported: row?.unsupported || 0
  }
}

export function deleteTranslationsForFile(fileId: number): void {
  const database = getDb()
  database.prepare('DELETE FROM translations WHERE file_id = ?').run(fileId)
}

export function resetTranslationsForFile(fileId: number): void {
  const database = getDb()
  database
    .prepare(`UPDATE translations SET status = 'pending', translated_text = NULL WHERE file_id = ?`)
    .run(fileId)
}

// --- Settings operations ---

export function getSetting(key: string): string | undefined {
  const database = getDb()
  const row = database.prepare('SELECT value FROM project_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  const database = getDb()
  database
    .prepare('INSERT OR REPLACE INTO project_settings (key, value) VALUES (?, ?)')
    .run(key, value)
}

// --- Usage Stats ---

export interface UsageStatsRow {
  id: number
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  batch_count: number
  created_at: string
}

export function recordUsage(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  workspaceId: number
): void {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO usage_stats (workspace_id, provider, model, input_tokens, output_tokens, total_tokens)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(workspaceId, provider, model, inputTokens, outputTokens, totalTokens)
}

export function getUsageSummary(workspaceId?: number): {
  totalInput: number
  totalOutput: number
  totalTokens: number
  totalBatches: number
  byProvider: {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    batchCount: number
  }[]
} {
  const database = getDb()
  const whereClause = workspaceId !== undefined ? 'WHERE workspace_id = ?' : ''
  const params = workspaceId !== undefined ? [workspaceId] : []

  const totals = database
    .prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0) as total_input,
        COALESCE(SUM(output_tokens), 0) as total_output,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COUNT(*) as total_batches
       FROM usage_stats ${whereClause}`
    )
    .get(...params) as {
    total_input: number
    total_output: number
    total_tokens: number
    total_batches: number
  }

  const byProvider = database
    .prepare(
      `SELECT
        provider,
        model,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens,
        SUM(total_tokens) as totalTokens,
        COUNT(*) as batchCount
       FROM usage_stats ${whereClause}
       GROUP BY provider, model
       ORDER BY totalTokens DESC`
    )
    .all(...params) as {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    batchCount: number
  }[]

  return {
    totalInput: totals?.total_input || 0,
    totalOutput: totals?.total_output || 0,
    totalTokens: totals?.total_tokens || 0,
    totalBatches: totals?.total_batches || 0,
    byProvider
  }
}

// --- File Backups (for injection revert) ---

export function saveFileBackup(fileId: number, content: string): void {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO file_backups (file_id, content, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(file_id) DO UPDATE SET content = excluded.content, created_at = datetime('now')`
    )
    .run(fileId, Buffer.from(content, 'utf-8'))
}

export function getFileBackup(fileId: number): string | null {
  const database = getDb()
  const row = database.prepare('SELECT content FROM file_backups WHERE file_id = ?').get(fileId) as
    | { content: Buffer }
    | undefined
  if (!row) return null
  return row.content.toString('utf-8')
}

export function hasFileBackup(fileId: number): boolean {
  const database = getDb()
  const row = database.prepare('SELECT 1 FROM file_backups WHERE file_id = ?').get(fileId) as
    | { 1: number }
    | undefined
  return !!row
}

export function deleteFileBackup(fileId: number): void {
  const database = getDb()
  database.prepare('DELETE FROM file_backups WHERE file_id = ?').run(fileId)
}

// --- Workspace-scoped helpers ---

export function removeStaleFiles(workspaceId: number, currentPaths: string[]): number {
  if (!workspaceId) return 0
  const database = getDb()
  const existing = database
    .prepare('SELECT id, file_path FROM files WHERE workspace_id = ?')
    .all(workspaceId) as { id: number; file_path: string }[]

  const currentSet = new Set(currentPaths)
  const staleIds = existing.filter((f) => !currentSet.has(f.file_path)).map((f) => f.id)
  if (staleIds.length === 0) return 0

  const deleteStmt = database.prepare('DELETE FROM files WHERE id = ?')
  const deleteMany = database.transaction((ids: number[]) => {
    for (const id of ids) deleteStmt.run(id)
  })
  deleteMany(staleIds)
  return staleIds.length
}

// --- Glossary ---

export interface GlossaryRow {
  id: number
  workspace_id: number
  term: string
  occurrence_count: number
  translation: string | null
  translation_source: string | null
  is_enabled: number
}

export function getGlossaryTerms(workspaceId: number = 0): GlossaryRow[] {
  const database = getDb()
  return database
    .prepare('SELECT * FROM glossary WHERE workspace_id = ? ORDER BY occurrence_count DESC')
    .all(workspaceId) as GlossaryRow[]
}

export function updateGlossaryTerm(
  id: number,
  translation: string | null,
  translationSource: string | null,
  isEnabled: number
): void {
  const database = getDb()
  database
    .prepare(
      'UPDATE glossary SET translation = ?, translation_source = ?, is_enabled = ? WHERE id = ?'
    )
    .run(translation, translationSource, isEnabled, id)
}

export function toggleAllGlossaryTerms(workspaceId: number, isEnabled: number): void {
  if (!workspaceId && workspaceId !== 0) return
  const database = getDb()
  database
    .prepare('UPDATE glossary SET is_enabled = ? WHERE workspace_id = ?')
    .run(isEnabled, workspaceId)
}
