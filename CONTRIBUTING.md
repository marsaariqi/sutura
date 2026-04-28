# Contributing to Sutura

First off, thank you for considering contributing to Sutura! It's people like you that make Sutura such a powerful and precise tool for the open-source community.

## Architecture Overview

Before diving into the code, we highly recommend reading the [Architecture Documentation](docs/ARCHITECTURE.md). Sutura relies heavily on AST parsing (`tree-sitter`), a localized Chinese tokenizer (`nodejieba`), and strict byte-range buffer injections. Understanding the data flow from extraction to AI batching to injection is crucial for making safe changes.

## How Can I Contribute?

### Reporting Bugs

- **Check existing issues:** Ensure the bug was not already reported by searching on GitHub under Issues.
- **Use a clear title:** Identify the problem quickly.
- **Provide reproducibility:** Describe the exact steps which reproduce the problem. Include snippets of the source code that caused the issue, the language being parsed, and your current Sutura settings (e.g., AI Provider, RPM, Batch Size).

### Suggesting Enhancements

- **Be descriptive:** Use a clear and descriptive title.
- **Provide context:** Explain a step-by-step description of the suggested enhancement and why it would be useful to the broader user base.
- **Consider the architecture:** If suggesting a new feature, consider how it interacts with the native `tree-sitter` parsers or the asynchronous SQLite `WAL` database.

### Pull Requests

1. **Fork the repo** and create your feature branch from `main`.
2. **Setup your environment**: Ensure your development environment matches the exact requirements listed in the README (Node `v24.14.1`, npm `v11.12.1`, plus native C++ build tools).
3. **Make your changes**: Write your code. If adding a new feature or fixing a complex parser bug, test thoroughly across multiple file types.
4. **Verify stability**: Run `npm run lint` and `npm run typecheck`. We enforce strict TypeScript compilation across both the main process and the React renderer.
5. **Commit**: Use descriptive commit messages.
6. **Submit your PR**: Push to your fork and submit a pull request to `main`. Describe the changes thoroughly.

## Development Setup

Please refer to the `README.md` for exact terminal commands to install dependencies using the `--ignore-scripts` flag and how to manually rebuild the native modules for your architecture.

Thank you for helping us build the ultimate surgical codebase translator!
