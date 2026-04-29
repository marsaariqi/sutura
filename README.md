<p align="center">
  <img src="resources/icon-256.png" width="128" alt="Sutura Logo">
</p>

<h1 align="center">
Sutura
</h1>

**Sutura** is a sophisticated Electron-based desktop application designed for **Surgical Codebase Translation & AST-based String Injection**. It intelligently scans entire codebases, extracts translatable text (like comments and string literals) using precise Abstract Syntax Tree (AST) parsing, translates them using various AI providers, and seamlessly injects the translations back into the source code without breaking the formatting or logic.

---

## Supported Extensions

Sutura supports 44 file extensions across various languages and formats:

- **Web**: `.html`, `.htm`, `.css`, `.scss`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`
- **Languages**: `.java`, `.go`, `.py`, `.kt`, `.rs`, `.rb`, `.php`, `.cs`, `.swift`, `.lua`, `.scala`, `.hs`, `.r`, `.c`, `.cpp`, `.h`, `.hpp`, `.sql`, `.sh`, `.bash`, `.groovy`
- **Data/Config**: `.json`, `.jsonc`, `.xml`, `.svg`, `.xsl`, `.xslt`, `.plist`, `.fxml`, `.xhtml`, `.yml`, `.yaml`, `.toml`, `.properties`
- **Documentation**: `.md`

---

## The Main Logic

Sutura is built on four core technical pillars that allow it to safely translate massive codebases where regular expression tools fail:

### 1. AST Parsing (`tree-sitter`)

Instead of relying on brittle regex matching, Sutura converts your source code into a fully typed Abstract Syntax Tree using native `tree-sitter` grammars. It walks the tree to locate specifically targeted nodes (like `COMMENT` and `STRING_LITERAL`). It even features embedded language parsing—for instance, pulling `<script>` tags out of Vue/HTML files to parse them securely as TypeScript before extracting their strings.

### 2. Token Optimization & Batch Orchestration

Translating thousands of strings individually is extremely slow and wastes AI tokens. Sutura's `TaskRunner` groups pending segments by their `node_type`, chunks them into token-optimized JSON arrays (e.g., 100 items per request), and fires them concurrently at the selected AI Provider (Gemini, OpenAI, Anthropic, DeepSeek, Ollama, etc.). It strictly enforces a user-defined RPM (Requests Per Minute) limit to prevent HTTP 429 rate-limiting errors.

### 3. Suture Injection System

This is where the magic happens. When injecting translated text back into the source file, string replacement is dangerous. Instead, Sutura converts the file into a UTF-8 memory `Buffer`. It maps the exact `line_start` and `col_start` provided by the AST to precise byte-range offsets, splicing the translation directly into the binary array. This ensures the surrounding logic, tabs, and indentation remain completely untouched.

### 4. Codebase Glossary Scanner

To maintain translation consistency, Sutura includes an AST-aware Glossary scanner. It chunks thousands of untranslated rows from the SQLite database and uses a C++ Chinese tokenizer (`nodejieba`) to map terminology frequency across the entire workspace. These terms are aggregated and injected into the AI context prompt to ensure localized consistency.

---

## Technical Specifications

- **Main Process**: Node.js backend orchestrating `better-sqlite3`, `tree-sitter`, and AI Provider API calls.
- **Renderer Process**: React 19 frontend utilizing Tailwind CSS v4, Radix UI, and Zustand for state management.
- **Process Bridge**: Context-isolated Preload scripts passing typed IPC events.
- **State Management**: Asynchronous WAL-enabled `better-sqlite3` database.

For a comprehensive deep dive into the database schema, process flows, and system pipelines, please see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Project Setup

### Environment Requirements

Sutura was developed and verified against the following toolchain. Because of the heavy reliance on native C++ Node modules (`tree-sitter`, `better-sqlite3`, `nodejieba`), matching these environments will yield the best results:

- **Node.js**: `v24.14.1`
- **npm**: `v11.12.1`

### Native Build Prerequisites

Before installing dependencies, you **must** have native build tools installed on your system so Node-Gyp can compile the C++ dependencies:

- **Windows**: Microsoft Build Tools (Visual Studio Build Tools with the **Desktop development with C++** workload) and Python.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`) and Python.
- **Linux**: Build essentials (`make`, `gcc`, `g++`) and Python.

### Installation

Due to the native dependencies and complex peer dependency requirements within the Electron-Vite ecosystem, run the following steps exactly as shown:

```bash
# 1. Install dependencies, bypassing scripts to prevent premature node-gyp failures
$ npm install --ignore-scripts --legacy-peer-deps

# 2. Patch and rebuild the tree-sitter grammars (Ensures C++20 compatibility)
$ npm run rebuild:native

# 3. Rebuild standard native modules (Electron integration) and generate UI icons
$ npm run postinstall
```

### Development

Start the application in development mode with hot-reloading enabled across both the Main and Renderer processes:

```bash
$ npm run dev
```

### Building for Production

To compile the application into a redistributable executable:

```bash
# For Windows (.exe)
$ npm run build:win

# For macOS (.dmg)
$ npm run build:mac

# For Linux (.AppImage / .deb)
$ npm run build:linux
```

_Note: The standard `build` scripts automatically trigger the `rebuild:native` hook to ensure the compiled binary uses the correct Electron Node headers._

---

## Roadmap / TODO

- [ ] **Sass Support**: Implement manual integration for [tree-sitter-sass](https://github.com/bajrangCoder/tree-sitter-sass).
- [ ] **Custom Grammar Support**: Allow users to load custom Tree-sitter grammars (`.node` files) dynamically.
- [ ] **Translation Memory**: Persistent cache of previously translated segments to save tokens and ensure consistency.
- [ ] **Parallel Workspace Processing**: Open and translate multiple workspace folders simultaneously.
- [ ] **Multi-Target Language**: Translate to multiple languages in a single pass (e.g., English, Japanese, and Korean).
- [ ] **Plugin System**: Extensible architecture for custom post-processing hooks and terminology validators.

---

## Credits & Shoutouts

A huge shoutout to the developers who maintain specialized Tree-sitter grammars and tools that make Sutura possible. Since the official Tree-sitter grammars don't cover everything, these community efforts are vital:

- [nodejieba](https://github.com/yanyiwu/nodejieba) — Excellent C++ Chinese segmentation for glossary scanning.
- [@derekstride/tree-sitter-sql](https://github.com/derekstride/tree-sitter-sql) — Robust SQL parsing.
- [tree-sitter-vue](https://github.com/ikatyang/tree-sitter-vue) — Support for Vue Single File Components.
- [tree-sitter-grammars](https://github.com/tree-sitter-grammars) — For the collective work on XML, YAML, and TOML support.

---

## Contributing

We welcome contributions from the community! Please read our [Contributing Guidelines](CONTRIBUTING.md) to understand our architecture, development workflow, and how to submit a pull request.

---

## License

This project is licensed under the **MIT License**. You are free to use, modify, distribute, and build upon this software in both open-source and commercial environments.
