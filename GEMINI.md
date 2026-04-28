# Sutura

## Project Overview

**Sutura** is a sophisticated Electron-based desktop application designed for **Surgical Codebase Translation & AST-based String Injection**. It intelligently scans entire codebases, extracts translatable text (like comments and string literals) using precise Abstract Syntax Tree (AST) parsing, translates them using various AI providers, and seamlessly injects the translations back into the source code without breaking the formatting or logic.

## System Architecture

The application strictly follows the standard `electron-vite` structure with robust process isolation:

- **Main Process (`src/main/`)**: The backend of the application. It handles heavy lifting such as SQLite database interactions, file system manipulation, AST parsing (`tree-sitter`), and orchestrating API calls to AI providers.
- **Renderer Process (`src/renderer/`)**: The frontend UI built with React 19, Tailwind CSS v4, and Radix UI. It maintains application state using Zustand and interacts with the main process exclusively via typed IPC channels.
- **Preload Script (`src/preload/`)**: A secure bridge (`contextBridge`) exposing a strongly-typed `api` object for the renderer to securely invoke main-process handlers.

---

## Core Logic & Workflows

### 1. AST Parsing (`src/main/parser.ts`)

Sutura uses native `tree-sitter` to parse code into an AST rather than relying on brittle regular expressions.

- **Extraction**: It walks the AST to find nodes categorized as `COMMENT` or `STRING_LITERAL`.
- **Language Filtering**: Extracted nodes are filtered using Unicode script patterns (e.g., detecting Chinese, Japanese, Korean characters) to avoid translating code identifiers, English text, or URL paths unnecessarily.
- **Mixed String Literals**: For large string literals (e.g., SQL queries containing source language sub-strings), Sutura splits the strings to isolate only the translatable segments.
- **Fallback**: If a native `tree-sitter` grammar isn't available for a specific file, it gracefully falls back to a basic regex-based extraction to maintain high coverage.

### 2. Orchestration & Translation (`src/main/task-runner.ts`)

The translation queue is managed by `TaskRunner`, which batches pending translations and routes them to AI providers.

- **AI Providers**: Supports a rich ecosystem of providers including Gemini, DeepSeek, OpenAI, Anthropic, Ollama, and llama.cpp.
- **Batching & Rate Limiting**: The runner aggregates translations into batches based on node type (`COMMENT` vs `STRING_LITERAL`), applies rate limiting (RPM settings), handles 429 backoff gracefully, and monitors tokens used per burst.
- **Prompt Engineering**: The application dynamically builds structured JSON prompts to ensure the AI translates while strictly preserving wrappers (quotes, backticks) and escaping sequences.

### 3. Surgical Injection (`src/main/injector.ts`)

Once translations are complete, Sutura safely replaces the original text in the source code.

- **Buffer-Based Byte Replacement**: Instead of regex replace, it converts the file to a UTF-8 `Buffer`, mapping 1-based line and tree-sitter column byte-offsets precisely.
- **Validation**: It verifies that the `original_text` still exists at the expected byte offset before writing, accommodating multi-byte UTF-8 character shifts dynamically.
- **Virtual Injection & Backups**: Users can preview changes "virtually" in the UI before committing them to disk. Sutura always creates a backup (`file_backups`) in SQLite before overwriting, allowing for instantaneous reversions.

### 4. Database & State Management

- **SQLite (`src/main/database.ts`)**: Uses `better-sqlite3` to persist the state of the workspace. Key tables include `files` (pending, translated, error states), `translations` (the extracted strings), `project_settings`, and `usage_stats` (token tracking).
- **Zustand (`src/renderer/src/stores/app-store.ts`)**: Global frontend state tracks workspace paths, selected files, virtual buffers, queue progress, and live logging feeds without complex prop-drilling.
- **Electron Store (`electron-store`)**: Cross-session persistent settings (e.g., last used provider, last workspace path) are saved locally alongside the DB.

---

## Building and Running

### Prerequisites

- Node.js installed.
- Ensure native build tools (Python, Visual Studio build tools / Xcode command line tools) are available since `tree-sitter` and `better-sqlite3` are native Node modules.

### Development

Start the application in development mode with hot-reloading:

```bash
npm install
npm run dev
```

### Build Commands

- **Windows:** `npm run build:win`
- **macOS:** `npm run build:mac`
- **Linux:** `npm run build:linux`

_Note: Native modules require rebuilding against Electron's Node headers. This is handled automatically via the `rebuild:native` script during standard builds._

## Development Conventions

- **Language**: Strict TypeScript across both Node.js main process and React renderer.
- **Styling**: Tailwind CSS combined with Radix UI components (accessible primitives).
- **Linting/Formatting**: Run `npm run lint` and `npm run format`. It is highly recommended to enable format-on-save for Prettier.
- **Security**: API keys are handled entirely in the main process, using `safe-storage` where possible, and are never exposed dynamically back to the renderer unencrypted.
