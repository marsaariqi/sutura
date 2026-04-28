# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-27

### Added

- **Initial open-source release of Sutura.**
- AST Parsing using `tree-sitter` for precise extraction of translatable nodes (`COMMENT` and `STRING_LITERAL`).
- Support for over 45+ file extensions including embedded language parsing for Vue/HTML components.
- Advanced Token Optimization and Batch Orchestration engine (`TaskRunner`) featuring burst-mode parallelism and RPM limits.
- Buffer-based Suture Injection System for accurate byte-range text replacements without modifying surrounding logic or formatting.
- Native C++ Chinese tokenizer (`nodejieba`) for project-wide Terminology Glossary scanning and frequency mapping.
- Integration with major AI providers: Google Gemini, OpenAI, Anthropic, DeepSeek.
- Local LLM support via Ollama and llama.cpp for complete offline, air-gapped translation.
- Comprehensive UI built with React, Tailwind CSS v4, and Zustand featuring Side-by-Side Monaco diff comparison.
- SQLite-backed state management for persisting translations, usage statistics, settings, and file backups for reversibility.
- GitHub Actions automated release pipeline for Windows installer builds.
