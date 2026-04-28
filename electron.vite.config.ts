import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: [
          'better-sqlite3',
          'electron-store',
          'nodejieba',
          'tree-sitter',
          'tree-sitter-javascript',
          'tree-sitter-typescript',
          'tree-sitter-java',
          'tree-sitter-go',
          'tree-sitter-python',
          'tree-sitter-c',
          'tree-sitter-cpp',
          'tree-sitter-rust',
          'tree-sitter-ruby',
          'tree-sitter-kotlin',
          'tree-sitter-groovy',
          'tree-sitter-php',
          'tree-sitter-c-sharp',
          'tree-sitter-swift',
          'tree-sitter-bash',
          'tree-sitter-lua',
          'tree-sitter-scala',
          'tree-sitter-haskell',
          'tree-sitter-r',
          'tree-sitter-html',
          'tree-sitter-css',
          'tree-sitter-scss',
          'tree-sitter-properties',
          'tree-sitter-json',
          'tree-sitter-vue',
          '@tree-sitter-grammars/tree-sitter-xml',
          '@tree-sitter-grammars/tree-sitter-yaml',
          '@tree-sitter-grammars/tree-sitter-toml',
          '@derekstride/tree-sitter-sql',
          'prettier',
          'prettier-plugin-java'
        ]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve(__dirname, './src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      exclude: ['monaco-editor']
    }
  }
})
