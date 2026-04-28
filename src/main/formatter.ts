import { readFileSync, writeFileSync } from 'fs'
import { extname } from 'path'
import { execSync } from 'child_process'

/**
 * Multi-Language Formatter Dispatcher.
 * Formats translated files using appropriate formatters per language.
 * Gracefully fails if formatter binary is missing.
 */

export async function formatFile(filePath: string): Promise<void> {
  const ext = extname(filePath).toLowerCase()

  try {
    switch (ext) {
      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
      case '.md':
      case '.json':
      case '.vue':
      case '.scss':
      case '.svg':
        await formatWithPrettier(filePath)
        break
      case '.java':
        await formatWithPrettierJava(filePath)
        break
      case '.go':
        formatWithGofmt(filePath)
        break
      case '.kt':
      case '.groovy':
        formatWithShellCli(filePath, ext)
        break
      case '.sql':
        await formatWithPrettierSql(filePath)
        break
      default:
        break
    }
  } catch (error) {
    console.warn(`Formatter warning for ${filePath}: ${(error as Error).message}`)
  }
}

async function formatWithPrettier(filePath: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prettier = require('prettier')
    const source = readFileSync(filePath, 'utf-8')
    const ext = extname(filePath).toLowerCase()

    const parserMap: Record<string, string> = {
      '.js': 'babel',
      '.jsx': 'babel',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.md': 'markdown',
      '.json': 'json',
      '.vue': 'vue',
      '.scss': 'scss',
      '.svg': 'html'
    }

    const result = await prettier.format(source, {
      parser: parserMap[ext] || 'babel',
      singleQuote: true,
      semi: false,
      printWidth: 100,
      trailingComma: 'none',
      vueIndentScriptAndStyle: true
    })
    writeFileSync(filePath, result, 'utf-8')
  } catch (error) {
    console.warn(`Prettier not available: ${(error as Error).message}`)
  }
}

async function formatWithPrettierJava(filePath: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prettier = require('prettier')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    let pluginJava = require('prettier-plugin-java')
    // Handle ESM/CJS interop (Prettier 3 might require the .default property)
    if (pluginJava.default) pluginJava = pluginJava.default

    const source = readFileSync(filePath, 'utf-8')

    const result = await prettier.format(source, {
      parser: 'java',
      plugins: [pluginJava],
      tabWidth: 4,
      printWidth: 120
    })
    writeFileSync(filePath, result, 'utf-8')
  } catch (error) {
    console.warn(`prettier-plugin-java not available: ${(error as Error).message}`)
  }
}

function formatWithGofmt(filePath: string): void {
  try {
    execSync(`gofmt -w "${filePath}"`, {
      timeout: 10000,
      stdio: 'pipe'
    })
  } catch {
    console.warn('gofmt not available')
  }
}

function formatWithShellCli(filePath: string, ext: string): void {
  try {
    if (ext === '.kt') {
      execSync(`ktlint -F "${filePath}"`, { timeout: 10000, stdio: 'pipe' })
    } else if (ext === '.groovy') {
      // Use npx to run the locally installed npm-groovy-lint
      execSync(`npx npm-groovy-lint --fix "${filePath}"`, {
        timeout: 30000,
        stdio: 'pipe'
      })
    }
  } catch (error) {
    console.warn(`Formatter failed for ${ext}: ${(error as Error).message}`)
  }
}

async function formatWithPrettierSql(filePath: string): Promise<void> {
  try {
    const prettier = require('prettier')
    const pluginSql = require('prettier-plugin-sql')
    const source = readFileSync(filePath, 'utf-8')

    const result = await prettier.format(source, {
      parser: 'sql', // This parser comes from the plugin
      plugins: [pluginSql],
      language: 'sql', // Optional: specify dialect if needed (e.g., 'postgresql')
      keywordCase: 'upper', // Standard SQL practice
      database: 'postgresql'
    })
    writeFileSync(filePath, result, 'utf-8')
  } catch (error) {
    console.warn(`prettier-plugin-sql not available: ${(error as Error).message}`)
  }
}
