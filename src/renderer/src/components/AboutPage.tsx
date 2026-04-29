import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import iconSrc from '../../../../resources/icon-128.png'
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  FileCode,
  ShieldCheck,
  GitCompare,
  Download,
  Braces,
  TreePine,
  Filter,
  Layers,
  Send,
  PenTool,
  CheckCircle2,
  Lock,
  Zap,
  ArrowRight,
  Info,
  Package,
  Rocket,
  Cpu,
  Globe,
  Database,
  Shield,
  Eye,
  Server,
  Puzzle,
  Box
} from 'lucide-react'

// ---------- Example code from example.txt ----------

const EXAMPLE_JAVA_CODE = `package com.example.app.strategy.impl;

import org.apache.commons.lang3.ArrayUtils;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 内部交易出库-领用类策略类
 *
 * @author example@example.com
 * @date 2025/08/26
 */

@Service
public class InsiderTradingOutUseInvStockStrategyImpl extends DefaultInvStockStrategyImpl implements InvStockStrategy {

    private final StockDocumentProcessRepository stockDocumentProcessRepository;

    public InsiderTradingOutUseInvStockStrategyImpl(StockDocumentSetupRepository stockDocumentSetupRepository, InvStockLineRepository invStockLineRepository, InvStockLotRepository invStockLotRepository, StockDocumentProcessRepository stockDocumentProcessRepository) {
        super(stockDocumentSetupRepository, invStockLineRepository, invStockLotRepository);
        this.stockDocumentProcessRepository = stockDocumentProcessRepository;
    }

    @Override
    public InvStockType[] invStockType() {
        return ArrayUtils.toArray(InvStockType.INSIDER_TRADING_OUT_USE);
    }

    @Override
    public InvStockSubmitDto buildSubmitObject(InvStockHeader header) {
        //获取库存事务处理类型
        StockDocumentSetup setup = this.obtainDbStockDocumentSetup(header);
        //调整为后续生成
        setup.setAutocreateDocFlag(0);
        // 获取所有行信息
        List<InvStockLine> lines = invStockLineRepository.list(header.getStockHeaderId(), null, null, null);
        header.setInvStockLines(lines);

        // 设置行的批次信息
        Map<Long, List<InvStockLot>> lotsOfLine = invStockLotRepository.selectLotsByHeader(BaseConstants.DEFAULT_TENANT_ID, header.getStockHeaderId()).stream().collect(Collectors.groupingBy(InvStockLot::getStockLineId));
        lines.forEach(line -> line.setInvStockLots(lotsOfLine.get(line.getStockLineId())));
        return InvStockSubmitDto.builder()
                .invStockHeader(header)
                .stockDocumentSetup(setup)
                .invStockSubmitType(InvStockType.INSIDER_TRADING_OUT_USE)
                .preCheckFlag(true)
                .build();
    }

    @Override
    public void postProcess(InvStockSubmitDto invStockSubmitDto) {
        InvStockHeader header = invStockSubmitDto.getInvStockHeader();
        StockDocumentSetup stockDocumentSetup = invStockSubmitDto.getStockDocumentSetup();
        //若需要后置生成自动单据，插入库存单据生成处理临时表
        StockDocumentProcess stockDocumentProcess = StockDocumentProcess.builder()
                .stockDocumentType(header.getStockDocumentType())
                .stockBusinessType(header.getStockBusinessType())
                .stockHeaderId(header.getStockHeaderId())
                .processStatus("N")
                .tenantId(header.getTenantId())
                .build();
        stockDocumentProcessRepository.insertSelective(stockDocumentProcess);
    }
}`

// ---------- Simulated AST extraction results ----------

const EXTRACTED_NODES = [
  {
    id: 1,
    lineStart: 12,
    colStart: 0,
    lineEnd: 15,
    colEnd: 3,
    nodeType: 'COMMENT',
    text: '/**\n * 内部交易出库-领用类策略类\n *\n * @author example@example.com\n * @date 2025/08/26\n */'
  },
  {
    id: 2,
    lineStart: 34,
    colStart: 8,
    lineEnd: 34,
    colEnd: 24,
    nodeType: 'COMMENT',
    text: '//获取库存事务处理类型'
  },
  {
    id: 3,
    lineStart: 36,
    colStart: 8,
    lineEnd: 36,
    colEnd: 22,
    nodeType: 'COMMENT',
    text: '//调整为后续生成'
  },
  {
    id: 4,
    lineStart: 38,
    colStart: 8,
    lineEnd: 38,
    colEnd: 22,
    nodeType: 'COMMENT',
    text: '// 获取所有行信息'
  },
  {
    id: 5,
    lineStart: 42,
    colStart: 8,
    lineEnd: 42,
    colEnd: 23,
    nodeType: 'COMMENT',
    text: '// 设置行的批次信息'
  },
  {
    id: 6,
    lineStart: 57,
    colStart: 8,
    lineEnd: 57,
    colEnd: 37,
    nodeType: 'COMMENT',
    text: '//若需要后置生成自动单据，插入库存单据生成处理临时表'
  },
  {
    id: 7,
    lineStart: 62,
    colStart: 32,
    lineEnd: 62,
    colEnd: 35,
    nodeType: 'STRING_LITERAL',
    text: '"N"'
  }
]

// ---------- Simulated batch payload ----------

const SIMULATED_BATCH_PAYLOAD = {
  model: 'gemini-3.1-flash-lite-preview',
  temperature: 0.3,
  targetLanguage: 'English',
  sourceLanguage: 'Chinese',
  nodeType: 'COMMENT',
  glossary: {
    出库: 'Outbound',
    领用: 'Requisition'
  },
  batch: {
    entries: [
      {
        id: 1,
        og: '/**\n * 内部交易出库-领用类策略类\n *\n * @author example@example.com\n * @date 2025/08/26\n */'
      },
      { id: 2, og: '//获取库存事务处理类型' },
      { id: 3, og: '//调整为后续生成' },
      { id: 4, og: '// 获取所有行信息' },
      { id: 5, og: '// 设置行的批次信息' },
      {
        id: 6,
        og: '//若需要后置生成自动单据，插入库存单据生成处理临时表'
      }
    ]
  },
  _note: 'STRING_LITERAL "N" excluded — single character, no meaningful translation'
}

// ---------- Simulated AI response ----------

const SIMULATED_AI_RESPONSE = {
  results: [
    {
      id: 1,
      tr: '/**\n * Internal Transaction Outbound - Requisition Strategy Class\n *\n * @author example@example.com\n * @date 2025/08/26\n */'
    },
    { id: 2, tr: '// Get inventory transaction processing type' },
    { id: 3, tr: '// Adjust for subsequent generation' },
    { id: 4, tr: '// Get all line information' },
    { id: 5, tr: '// Set batch information for lines' },
    {
      id: 6,
      tr: '// If post-generation of automatic documents is needed, insert into stock document process temp table'
    }
  ],
  usage: {
    inputTokens: 342,
    outputTokens: 187,
    totalTokens: 529,
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-preview'
  }
}

// ---------- Translated code ----------

const TRANSLATED_JAVA_CODE = `package com.example.app.strategy.impl;

import org.apache.commons.lang3.ArrayUtils;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Internal Transaction Outbound - Requisition Strategy Class
 *
 * @author example@example.com
 * @date 2025/08/26
 */

@Service
public class InsiderTradingOutUseInvStockStrategyImpl extends DefaultInvStockStrategyImpl implements InvStockStrategy {

    private final StockDocumentProcessRepository stockDocumentProcessRepository;

    public InsiderTradingOutUseInvStockStrategyImpl(StockDocumentSetupRepository stockDocumentSetupRepository, InvStockLineRepository invStockLineRepository, InvStockLotRepository invStockLotRepository, StockDocumentProcessRepository stockDocumentProcessRepository) {
        super(stockDocumentSetupRepository, invStockLineRepository, invStockLotRepository);
        this.stockDocumentProcessRepository = stockDocumentProcessRepository;
    }

    @Override
    public InvStockType[] invStockType() {
        return ArrayUtils.toArray(InvStockType.INSIDER_TRADING_OUT_USE);
    }

    @Override
    public InvStockSubmitDto buildSubmitObject(InvStockHeader header) {
        // Get inventory transaction processing type
        StockDocumentSetup setup = this.obtainDbStockDocumentSetup(header);
        // Adjust for subsequent generation
        setup.setAutocreateDocFlag(0);
        // Get all line information
        List<InvStockLine> lines = invStockLineRepository.list(header.getStockHeaderId(), null, null, null);
        header.setInvStockLines(lines);

        // Set batch information for lines
        Map<Long, List<InvStockLot>> lotsOfLine = invStockLotRepository.selectLotsByHeader(BaseConstants.DEFAULT_TENANT_ID, header.getStockHeaderId()).stream().collect(Collectors.groupingBy(InvStockLot::getStockLineId));
        lines.forEach(line -> line.setInvStockLots(lotsOfLine.get(line.getStockLineId())));
        return InvStockSubmitDto.builder()
                .invStockHeader(header)
                .stockDocumentSetup(setup)
                .invStockSubmitType(InvStockType.INSIDER_TRADING_OUT_USE)
                .preCheckFlag(true)
                .build();
    }

    @Override
    public void postProcess(InvStockSubmitDto invStockSubmitDto) {
        InvStockHeader header = invStockSubmitDto.getInvStockHeader();
        StockDocumentSetup stockDocumentSetup = invStockSubmitDto.getStockDocumentSetup();
        // If post-generation of automatic documents is needed, insert into stock document process temp table
        StockDocumentProcess stockDocumentProcess = StockDocumentProcess.builder()
                .stockDocumentType(header.getStockDocumentType())
                .stockBusinessType(header.getStockBusinessType())
                .stockHeaderId(header.getStockHeaderId())
                .processStatus("N")
                .tenantId(header.getTenantId())
                .build();
        stockDocumentProcessRepository.insertSelective(stockDocumentProcess);
    }
}`

// ---------- Java Syntax Tokenizer ----------

const JAVA_KEYWORDS = new Set([
  'package',
  'import',
  'public',
  'private',
  'protected',
  'class',
  'interface',
  'extends',
  'implements',
  'static',
  'final',
  'abstract',
  'void',
  'int',
  'long',
  'boolean',
  'char',
  'byte',
  'short',
  'float',
  'double',
  'return',
  'new',
  'this',
  'super',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'throws',
  'null',
  'true',
  'false',
  'instanceof',
  'synchronized',
  'volatile',
  'transient',
  'enum',
  'default',
  'var'
])

type TokenType =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'annotation'
  | 'type'
  | 'number'
  | 'method'
  | 'plain'

const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: 'text-purple-400',
  string: 'text-orange-300',
  comment: 'text-emerald-400',
  annotation: 'text-yellow-300',
  type: 'text-cyan-300',
  number: 'text-blue-300',
  method: 'text-yellow-200',
  plain: ''
}

function tokenizeJava(code: string): { type: TokenType; text: string }[][] {
  const lines = code.split('\n')
  const result: { type: TokenType; text: string }[][] = []
  let inBlockComment = false

  for (const line of lines) {
    const tokens: { type: TokenType; text: string }[] = []
    let i = 0

    while (i < line.length) {
      if (inBlockComment) {
        const endIdx = line.indexOf('*/', i)
        if (endIdx !== -1) {
          tokens.push({ type: 'comment', text: line.slice(i, endIdx + 2) })
          i = endIdx + 2
          inBlockComment = false
        } else {
          tokens.push({ type: 'comment', text: line.slice(i) })
          i = line.length
        }
        continue
      }

      // Line comment
      if (line[i] === '/' && line[i + 1] === '/') {
        tokens.push({ type: 'comment', text: line.slice(i) })
        i = line.length
        continue
      }

      // Block comment start
      if (line[i] === '/' && line[i + 1] === '*') {
        const endIdx = line.indexOf('*/', i + 2)
        if (endIdx !== -1) {
          tokens.push({ type: 'comment', text: line.slice(i, endIdx + 2) })
          i = endIdx + 2
        } else {
          tokens.push({ type: 'comment', text: line.slice(i) })
          i = line.length
          inBlockComment = true
        }
        continue
      }

      // String literal
      if (line[i] === '"') {
        let j = i + 1
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\') j++
          j++
        }
        tokens.push({ type: 'string', text: line.slice(i, j + 1) })
        i = j + 1
        continue
      }

      // Char literal
      if (line[i] === "'") {
        let j = i + 1
        while (j < line.length && line[j] !== "'") {
          if (line[j] === '\\') j++
          j++
        }
        tokens.push({ type: 'string', text: line.slice(i, j + 1) })
        i = j + 1
        continue
      }

      // Annotation
      if (line[i] === '@') {
        let j = i + 1
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++
        tokens.push({ type: 'annotation', text: line.slice(i, j) })
        i = j
        continue
      }

      // Number
      if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_$]/.test(line[i - 1]))) {
        let j = i
        while (j < line.length && /[0-9.xXlLfFdD_]/.test(line[j])) j++
        tokens.push({ type: 'number', text: line.slice(i, j) })
        i = j
        continue
      }

      // Word
      if (/[a-zA-Z_$]/.test(line[i])) {
        let j = i
        while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++
        const word = line.slice(i, j)
        if (JAVA_KEYWORDS.has(word)) {
          tokens.push({ type: 'keyword', text: word })
        } else if (/^[A-Z]/.test(word)) {
          tokens.push({ type: 'type', text: word })
        } else if (j < line.length && line[j] === '(') {
          tokens.push({ type: 'method', text: word })
        } else {
          tokens.push({ type: 'plain', text: word })
        }
        i = j
        continue
      }

      tokens.push({ type: 'plain', text: line[i] })
      i++
    }

    result.push(tokens)
  }

  return result
}

// ---------- Collapsible Section Component ----------

function Section({
  step,
  title,
  icon,
  children,
  defaultOpen = false,
  accentColor = 'text-muted-foreground'
}: {
  step: number
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  accentColor?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div
          className={`flex items-center justify-center h-6 w-6 rounded-full border text-[11px] font-mono font-bold shrink-0 ${accentColor} border-current/30`}
        >
          {step}
        </div>
        <div className={`shrink-0 ${accentColor}`}>{icon}</div>
        <span className="text-sm font-medium text-foreground flex-1">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

// ---------- Code Block Component ----------

function CodeBlock({
  code,
  language,
  title,
  maxHeight = '300px',
  highlights,
  syntaxHighlight
}: {
  code: string
  language?: string
  title?: string
  maxHeight?: string
  highlights?: number[]
  syntaxHighlight?: 'java'
}) {
  const lines = code.split('\n')
  const tokenizedLines = useMemo(
    () => (syntaxHighlight === 'java' ? tokenizeJava(code) : null),
    [code, syntaxHighlight]
  )

  return (
    <div className="rounded-md border border-zinc-700/50 overflow-hidden">
      {title && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700/50">
          <FileCode className="h-3 w-3 text-zinc-500" />
          <span className="text-[10px] font-mono text-zinc-400">{title}</span>
          {language && (
            <Badge
              variant="outline"
              className="ml-auto text-[9px] px-1 py-0 text-zinc-500 border-zinc-700"
            >
              {language}
            </Badge>
          )}
        </div>
      )}
      <div className="overflow-auto ops-terminal-scroll bg-zinc-950" style={{ maxHeight }}>
        <pre className="p-3 text-[11px] font-mono leading-4.5 text-zinc-300">
          {lines.map((line, i) => {
            const isHighlighted = highlights?.includes(i + 1)
            return (
              <div
                key={i}
                className={`flex ${isHighlighted ? 'bg-emerald-500/15 -mx-3 px-3' : ''}`}
              >
                <span className="text-zinc-600 w-8 shrink-0 text-right pr-3 select-none">
                  {i + 1}
                </span>
                {tokenizedLines ? (
                  <span>
                    {tokenizedLines[i].length === 0
                      ? ' '
                      : tokenizedLines[i].map((token, j) => (
                          <span key={j} className={TOKEN_CLASSES[token.type]}>
                            {token.text}
                          </span>
                        ))}
                  </span>
                ) : (
                  <span className={isHighlighted ? 'text-emerald-300' : ''}>{line || ' '}</span>
                )}
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}

// ---------- JSON Block Component ----------

function JsonBlock({
  data,
  title,
  color = 'text-emerald-300'
}: {
  data: unknown
  title?: string
  color?: string
}) {
  return (
    <div className="rounded-md border border-zinc-700/50 overflow-hidden">
      {title && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700/50">
          <Braces className="h-3 w-3 text-zinc-500" />
          <span className="text-[10px] font-mono text-zinc-400">{title}</span>
        </div>
      )}
      <pre
        className={`p-3 text-[11px] font-mono leading-4.5 ${color} overflow-auto max-h-75 ops-terminal-scroll bg-zinc-950`}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

// ---------- Info Card Component ----------

function InfoCard({
  icon,
  title,
  children,
  accent = 'border-border'
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className={`bg-card/50 rounded-lg p-4 border ${accent} space-y-2`}>
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-mono font-medium text-foreground">{title}</h4>
      </div>
      <div className="text-[12px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
}

// ---------- Main Component ----------

export function AboutPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2 shrink-0">
        <Info className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-semibold font-mono tracking-tight">How Sutura Works</h2>
        <Badge
          variant="outline"
          className="ml-2 text-[9px] px-1.5 py-0 font-mono text-muted-foreground"
        >
          Technical White Paper
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {/* Hero */}
          <div className="text-center space-y-3 pb-4">
            <div className="flex justify-center mb-6">
              <img src={iconSrc} alt="Sutura Logo" className="w-24 h-24 drop-shadow-md select-none pointer-events-none" />
            </div>
            <h1 className="text-2xl font-bold font-mono tracking-tight select-none">
              <span className="font-semibold text-3xl">Sutura</span>{' '}
              <span className="text-muted-foreground">&mdash; Translation Engine</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              A precision code translation tool that uses AST (Abstract Syntax Tree)-level parsing
              to extract only human-readable text from source code, translates it via AI, and
              injects the results back &mdash; all without touching a single line of your logic.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Badge className="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                Zero-Leak Policy
              </Badge>
              <Badge className="bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-mono">
                Local-First Parsing
              </Badge>
              <Badge className="bg-purple-500/5 text-purple-600 dark:text-purple-400 border-purple-500/30 text-[10px] font-mono">
                44 Extensions
              </Badge>
            </div>
          </div>

          <Separator />

          {/* The Pipeline Visualization */}
          <div className="flex items-center justify-center gap-1 py-3 overflow-x-auto">
            {[
              {
                label: 'Init',
                color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/40'
              },
              {
                label: 'Parse',
                color:
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
              },
              {
                label: 'Filter',
                color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40'
              },
              {
                label: 'Glossary',
                color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/40'
              },
              {
                label: 'Batch',
                color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/40'
              },
              {
                label: 'AI',
                color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/40'
              },
              {
                label: 'Inject',
                color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/40'
              },
              {
                label: 'Diff',
                color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/40'
              },
              {
                label: 'Commit',
                color:
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
              }
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono px-2 py-0.5 ${step.color}`}
                >
                  {step.label}
                </Badge>
                {i < 8 && <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
              </div>
            ))}
          </div>

          <Separator />

          {/* Step-by-Step Breakdown */}
          <div className="space-y-3">
            {/* Step 1: Initialization */}
            <Section
              step={1}
              title="Initialization — Workspace Discovery"
              icon={<FolderTree className="h-4 w-4" />}
              defaultOpen={true}
              accentColor="text-blue-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                When you select a workspace folder, Sutura recursively traverses the directory tree,
                collecting all files while respecting your ignore patterns (
                <code className="text-foreground/80">.git</code>,{' '}
                <code className="text-foreground/80">node_modules</code>,{' '}
                <code className="text-foreground/80">dist</code>, etc.). Each file is classified by
                extension against a whitelist of 44 supported extensions.
              </p>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-50">
                  <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                    Supported Extensions
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {[
                      '.java',
                      '.ts',
                      '.tsx',
                      '.js',
                      '.jsx',
                      '.vue',
                      '.py',
                      '.go',
                      '.rs',
                      '.kt',
                      '.c',
                      '.cpp',
                      '.sql',
                      '.h',
                      '.hpp',
                      '.cs',
                      '.rb',
                      '.php',
                      '.swift',
                      '.lua',
                      '.scala',
                      '.html',
                      '.htm',
                      '.css',
                      '.scss',
                      '.sh',
                      '.bash',
                      '.groovy',
                      '.r',
                      '.hs',
                      '.md',
                      '.json',
                      '.jsonc',
                      '.xml',
                      '.svg',
                      '.xsl',
                      '.xslt',
                      '.plist',
                      '.fxml',
                      '.xhtml',
                      '.yml',
                      '.yaml',
                      '.toml',
                      '.properties'
                    ].map((ext) => (
                      <Badge
                        key={ext}
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground"
                      >
                        {ext}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-muted/40 rounded-md p-3 border">
                <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  <span className="text-blue-700 dark:text-blue-400">Workspace Path</span> &rarr;
                  Recursive file collection &rarr;{' '}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Extension classification
                  </span>{' '}
                  &rarr; Database insertion &rarr; File tree auto-populated in UI
                </p>
              </div>
            </Section>

            {/* Step 2: AST Extraction */}
            <Section
              step={2}
              title="AST Extraction — Native Tree-sitter Parsing"
              icon={<TreePine className="h-4 w-4" />}
              defaultOpen={true}
              accentColor="text-emerald-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Each supported file is parsed using{' '}
                <strong className="text-foreground">Native Tree-sitter</strong> &mdash; a real
                C-compiled parser running directly in the Electron main process. The AST is walked
                recursively, extracting only two node types:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-md p-3 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                      COMMENT
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <code className="text-foreground/70">comment</code>,{' '}
                    <code className="text-foreground/70">line_comment</code>,{' '}
                    <code className="text-foreground/70">block_comment</code>,{' '}
                    <code className="text-foreground/70">javadoc_comment</code>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Temp: 0.3 (contextual)
                  </p>
                </div>
                <div className="bg-muted/40 rounded-md p-3 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-mono">
                      STRING_LITERAL
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <code className="text-foreground/70">string</code>,{' '}
                    <code className="text-foreground/70">string_literal</code>,{' '}
                    <code className="text-foreground/70">template_string</code>,{' '}
                    <code className="text-foreground/70">raw_string_literal</code>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Temp: 0.0 (deterministic)
                  </p>
                </div>
              </div>

              <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Example: Java Source File
              </h4>
              <CodeBlock
                code={EXAMPLE_JAVA_CODE}
                language="Java"
                title="InsiderTradingOutUseInvStockStrategyImpl.java"
                maxHeight="260px"
                highlights={[10, 11, 12, 13, 14, 15, 34, 36, 38, 42, 57, 62]}
                syntaxHighlight="java"
              />

              <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Extracted AST Nodes &mdash; {EXTRACTED_NODES.length} targets identified
              </h4>
              <JsonBlock
                data={EXTRACTED_NODES}
                title="extractNodes() → ExtractedNode[]"
                color="text-emerald-300"
              />
            </Section>

            {/* Step 3: Precision Filtering */}
            <Section
              step={3}
              title="Precision Filtering — Source Language Detection"
              icon={<Filter className="h-4 w-4" />}
              accentColor="text-amber-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                After extraction, nodes are filtered based on the configured{' '}
                <strong className="text-foreground">source language</strong>. If you set the source
                to "Chinese", Sutura will skip any COMMENT or STRING_LITERAL that doesn't contain
                Chinese characters &mdash; preventing unnecessary API calls for already-English
                text.
              </p>
              <div className="bg-muted/40 rounded-md p-3 border space-y-2">
                <p className="text-[11px] font-mono text-muted-foreground">
                  <span className="text-amber-700 dark:text-amber-400">
                    filterNodesBySourceLanguage()
                  </span>{' '}
                  &rarr; Regex-based detection per node
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    7 nodes extracted &rarr; 6 contain Chinese &rarr;{' '}
                  </span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono">
                    6 nodes queued
                  </Badge>
                  <Badge className="bg-secondary text-muted-foreground border-border text-[10px] font-mono">
                    1 skipped ("N")
                  </Badge>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Non-target languages are completely skipped to minimize token waste. If a file
                contains zero translatable nodes after filtering, it's marked as{' '}
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                  intact
                </Badge>{' '}
                and excluded from the translation queue.
              </p>
            </Section>

            {/* Step 4: Glossary Integration */}
            <Section
              step={4}
              title="Glossary Integration — Contextual Terminology"
              icon={<Database className="h-4 w-4" />}
              accentColor="text-indigo-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Before sending nodes to the AI, Sutura scans for project-specific terminology using
                a native C++ Chinese tokenizer (
                <code className="text-foreground/80">nodejieba</code>). Verified glossary terms
                found within the pending segments are injected directly into the AI prompt, ensuring
                localized terminology remains strictly consistent across the entire codebase.
              </p>
              <div className="bg-muted/40 rounded-md p-3 border border-indigo-500/20">
                <p className="text-[11px] font-mono text-muted-foreground">
                  <span className="text-indigo-700 dark:text-indigo-400">
                    nodejieba.cutAll(original_text)
                  </span>{' '}
                  &rarr; Term matched in DB &rarr; Appended to AI Prompt Context
                </p>
              </div>
            </Section>

            {/* Step 5: Payload Batching */}
            <Section
              step={5}
              title="Payload Batching — Burst-Mode Architecture"
              icon={<Layers className="h-4 w-4" />}
              accentColor="text-purple-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Translatable nodes are grouped into batches of configurable size (default: 10 items
                per batch). The TaskRunner uses a{' '}
                <strong className="text-foreground">burst-mode algorithm</strong>:
              </p>
              <div className="bg-muted/40 rounded-md p-3 border space-y-2">
                <div className="text-[11px] font-mono text-muted-foreground space-y-1">
                  <p>
                    <span className="text-purple-700 dark:text-purple-400">1.</span> Fetch{' '}
                    <code className="text-foreground/80">RPM &times; batchSize</code> pending items
                  </p>
                  <p>
                    <span className="text-purple-700 dark:text-purple-400">2.</span> Split into{' '}
                    <code className="text-foreground/80">batchSize</code> chunks
                  </p>
                  <p>
                    <span className="text-purple-700 dark:text-purple-400">3.</span> Fire up to{' '}
                    <code className="text-foreground/80">RPM</code> batches{' '}
                    <span className="text-emerald-700 dark:text-emerald-400">in parallel</span>{' '}
                    (burst)
                  </p>
                  <p>
                    <span className="text-purple-700 dark:text-purple-400">4.</span> Await all
                    promises
                  </p>
                  <p>
                    <span className="text-purple-700 dark:text-purple-400">5.</span> Apply{' '}
                    <span className="text-orange-700 dark:text-orange-400">60-second cooldown</span>
                    , then repeat
                  </p>
                </div>
              </div>

              <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Simulated API Batch Payload
              </h4>
              <JsonBlock
                data={SIMULATED_BATCH_PAYLOAD}
                title="TranslationBatch → AI Provider"
                color="text-purple-300"
              />
            </Section>

            {/* Step 6: AI Suture */}
            <Section
              step={6}
              title="AI Suture — Zero-Leak Segment Transmission"
              icon={<Send className="h-4 w-4" />}
              accentColor="text-cyan-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                <strong className="text-cyan-700 dark:text-cyan-400">
                  Only the extracted text segments
                </strong>{' '}
                are sent to the AI provider. No file paths, no code structure, no variable names, no
                logic. The AI receives a flat JSON array of{' '}
                <code className="text-foreground/80">{'{ id, og }'}</code> items alongside the node
                type, with instructions to translate the human-readable text and return a matching
                array of <code className="text-foreground/80">{'{ id, tr }'}</code>.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">
                    What IS sent
                  </h4>
                  <div className="bg-muted/40 rounded-md p-3 border border-emerald-500/20 text-[11px] font-mono text-muted-foreground space-y-1">
                    <p>
                      <CheckCircle2 className="inline h-3 w-3 text-emerald-500 mr-1" />
                      Comment text content
                    </p>
                    <p>
                      <CheckCircle2 className="inline h-3 w-3 text-emerald-500 mr-1" />
                      String literal values
                    </p>
                    <p>
                      <CheckCircle2 className="inline h-3 w-3 text-emerald-500 mr-1" />
                      Node type labels
                    </p>
                    <p>
                      <CheckCircle2 className="inline h-3 w-3 text-emerald-500 mr-1" />
                      Target/source language
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono text-red-700 dark:text-red-400 uppercase tracking-wider">
                    What is NEVER sent
                  </h4>
                  <div className="bg-muted/40 rounded-md p-3 border border-red-500/20 text-[11px] font-mono text-muted-foreground space-y-1">
                    <p>
                      <Lock className="inline h-3 w-3 text-red-500 mr-1" />
                      File paths or project structure
                    </p>
                    <p>
                      <Lock className="inline h-3 w-3 text-red-500 mr-1" />
                      Code logic or functions
                    </p>
                    <p>
                      <Lock className="inline h-3 w-3 text-red-500 mr-1" />
                      Variable/class names
                    </p>
                    <p>
                      <Lock className="inline h-3 w-3 text-red-500 mr-1" />
                      API keys (scrubbed)
                    </p>
                  </div>
                </div>
              </div>

              <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                AI Response &mdash; Translated Segments
              </h4>
              <JsonBlock
                data={SIMULATED_AI_RESPONSE}
                title="AI Provider → TranslationResult"
                color="text-cyan-300"
              />
            </Section>

            {/* Step 7: Virtual Injection */}
            <Section
              step={7}
              title="Virtual Injection — Memory-Resident Buffer"
              icon={<PenTool className="h-4 w-4" />}
              accentColor="text-orange-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Translations are injected into a{' '}
                <strong className="text-foreground">Virtual Buffer</strong> &mdash; a
                memory-resident copy of the original file. The disk file remains{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  completely untouched
                </strong>{' '}
                until you explicitly commit. The injection uses the AST node positions (line:col
                start/end) for surgical text replacement.
              </p>
              <div className="bg-muted/40 rounded-md p-3 border border-orange-500/20">
                <p className="text-[11px] font-mono text-muted-foreground">
                  <span className="text-orange-700 dark:text-orange-400">
                    injectTranslationsVirtual(source, translations)
                  </span>{' '}
                  &rarr; Replaces each node at exact line:col position &rarr; Returns modified
                  string &rarr; Stored in Zustand{' '}
                  <code className="text-foreground/80">virtualBuffers Map</code>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                <div className="bg-muted/40 rounded-md p-2.5 border text-center">
                  <Zap className="h-5 w-5 text-orange-500 mx-auto mb-1" />
                  <p className="text-foreground/70">Original on disk</p>
                  <p className="text-[10px] text-muted-foreground/60">Unchanged</p>
                </div>
                <div className="bg-muted/40 rounded-md p-2.5 border text-center">
                  <PenTool className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                  <p className="text-foreground/70">Virtual buffer</p>
                  <p className="text-[10px] text-muted-foreground/60">Modified in RAM</p>
                </div>
              </div>
            </Section>

            {/* Step 8: Diff Comparison */}
            <Section
              step={8}
              title="Diff Comparison — Side-by-Side Review"
              icon={<GitCompare className="h-4 w-4" />}
              accentColor="text-pink-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                The Monaco diff editor displays the original file alongside the virtual buffer,
                highlighting every change. You can toggle between source view and diff view to
                inspect individual translations before committing.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h4 className="text-[10px] font-mono text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">
                    Original (Chinese)
                  </h4>
                  <div className="bg-card rounded-md p-3 border text-[10px] font-mono text-red-700 dark:text-red-300/80 space-y-0.5 overflow-auto max-h-30 ops-terminal-scroll">
                    <p>//获取库存事务处理类型</p>
                    <p>//调整为后续生成</p>
                    <p>// 获取所有行信息</p>
                    <p>// 设置行的批次信息</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                    Translated (English)
                  </h4>
                  <div className="bg-card rounded-md p-3 border text-[10px] font-mono text-emerald-700 dark:text-emerald-300/80 space-y-0.5 overflow-auto max-h-30 ops-terminal-scroll">
                    <p>// Get inventory transaction processing type</p>
                    <p>// Adjust for subsequent generation</p>
                    <p>// Get all line information</p>
                    <p>// Set batch information for lines</p>
                  </div>
                </div>
              </div>
            </Section>

            {/* Step 9: Commit */}
            <Section
              step={9}
              title="Commit — Disk Write with Backup"
              icon={<Download className="h-4 w-4" />}
              accentColor="text-emerald-500"
            >
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                The manual commit writes the virtual buffer content to disk. Before overwriting,
                Sutura saves a backup of the original file in the database. You can revert any
                committed injection to restore the original.
              </p>
              <div className="bg-muted/40 rounded-md p-3 border text-[11px] font-mono text-muted-foreground space-y-1">
                <p>
                  <span className="text-emerald-700 dark:text-emerald-400">1.</span> Read current
                  file &rarr; Save to <code className="text-foreground/80">file_backups</code> table
                </p>
                <p>
                  <span className="text-emerald-700 dark:text-emerald-400">2.</span> Write virtual
                  buffer content to disk
                </p>
                <p>
                  <span className="text-emerald-700 dark:text-emerald-400">3.</span> Update file
                  status &rarr;{' '}
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  >
                    done
                  </Badge>
                </p>
                <p>
                  <span className="text-emerald-700 dark:text-emerald-400">4.</span> Clear virtual
                  buffer from memory
                </p>
              </div>

              <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Final Result &mdash; Translated Java File
              </h4>
              <CodeBlock
                code={TRANSLATED_JAVA_CODE}
                language="Java"
                title="InsiderTradingOutUseInvStockStrategyImpl.java (translated)"
                maxHeight="260px"
                highlights={[10, 11, 12, 13, 14, 15, 34, 36, 38, 42, 57]}
                syntaxHighlight="java"
              />
            </Section>
          </div>

          <Separator />

          {/* Technology Stack Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-500" />
              <h3 className="text-base font-semibold font-mono">Technology Stack</h3>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Every library in Sutura was chosen for a specific architectural reason. Here's why
              each dependency exists:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoCard
                icon={<TreePine className="h-4 w-4 text-emerald-500" />}
                title="Tree-sitter (Native C)"
                accent="border-emerald-500/20"
              >
                <p>
                  Native C-compiled parsers running directly in the Electron main process &mdash;
                  not WASM. This gives{' '}
                  <strong className="text-foreground">10-50x faster parsing</strong> than
                  browser-based alternatives. Each language grammar (Java, TypeScript, Python, etc.)
                  is a pre-compiled native addon, enabling real-time AST extraction on files of any
                  size without blocking the UI thread.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Cpu className="h-4 w-4 text-blue-500" />}
                title="Electron"
                accent="border-blue-500/20"
              >
                <p>
                  Desktop runtime required for native Node.js addons (Tree-sitter, better-sqlite3),
                  direct filesystem access, and OS-level keychain integration via{' '}
                  <code className="text-foreground/80">safeStorage</code>. A web app cannot compile
                  C parsers or access local files without a server &mdash; Electron eliminates that
                  entire layer.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Zap className="h-4 w-4 text-yellow-500" />}
                title="React + Zustand"
                accent="border-yellow-500/20"
              >
                <p>
                  React handles the component tree; Zustand provides a minimal, boilerplate-free
                  global store. The <code className="text-foreground/80">virtualBuffers</code> Map,
                  queue status, file tree, and active selections all live in a single Zustand store
                  &mdash; no Redux, no Context hell, no providers wrapping providers.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Database className="h-4 w-4 text-orange-500" />}
                title="better-sqlite3"
                accent="border-orange-500/20"
              >
                <p>
                  Synchronous, native SQLite bindings for Node.js. Stores file metadata, translation
                  segments, backups, usage statistics, and settings in a single local{' '}
                  <code className="text-foreground/80">.db</code> file. No network database, no
                  async query overhead &mdash; reads/writes complete in microseconds, perfect for
                  the responsive UI pattern Sutura needs.
                </p>
              </InfoCard>

              <InfoCard
                icon={<GitCompare className="h-4 w-4 text-pink-500" />}
                title="Monaco Editor"
                accent="border-pink-500/20"
              >
                <p>
                  The same editor engine that powers VS Code, bundled locally (no CDN). Provides
                  syntax highlighting for 30+ languages and a built-in diff editor for the Virtual
                  Injection preview. Monaco's inline diff view is what makes the side-by-side
                  original-vs-translated comparison possible.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Globe className="h-4 w-4 text-cyan-500" />}
                title="Tailwind CSS v4 + Radix UI"
                accent="border-cyan-500/20"
              >
                <p>
                  Tailwind v4 with OKLCh color tokens provides consistent dark/light theming via CSS
                  variables. Radix UI headless primitives (Dialog, Select, ScrollArea, Tooltip)
                  provide accessible, keyboard-navigable components with zero styling opinions
                  &mdash; all visual design is controlled through Tailwind classes.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Eye className="h-4 w-4 text-indigo-500" />}
                title="react-resizable-panels"
                accent="border-indigo-500/20"
              >
                <p>
                  Provides the resizable sidebar/editor split layout. Users can drag the divider to
                  resize the file tree panel or collapse it entirely. The library handles all the
                  resize math, min/max constraints, and persistence &mdash; zero custom resize logic
                  needed.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Server className="h-4 w-4 text-red-500" />}
                title="Google Generative AI + OpenAI SDK"
                accent="border-red-500/20"
              >
                <p>
                  Dual-provider architecture:{' '}
                  <code className="text-foreground/80">@google/generative-ai</code> for Gemini
                  models and <code className="text-foreground/80">openai</code> SDK for DeepSeek
                  (OpenAI-compatible API). The provider abstraction layer lets users switch between
                  AI backends without any code changes &mdash; just swap the API key in settings.
                </p>
              </InfoCard>
            </div>
          </div>

          <Separator />

          {/* Local LLM Advantage Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-blue-500" />
              <h3 className="text-base font-semibold font-mono">Local LLM Advantage</h3>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Sutura supports{' '}
              <strong className="text-foreground">100% offline surgical sutures</strong> through
              dual local LLM integration: <strong className="text-foreground">Ollama</strong> for
              ease-of-use and <strong className="text-foreground">llama.cpp</strong> for peak
              performance. Your code and translations never leave your machine.
            </p>

            <div className="grid grid-cols-1 gap-3">
              <InfoCard
                icon={<Server className="h-4 w-4 text-blue-500" />}
                title="llama.cpp (Server) — Peak Performance"
                accent="border-blue-500/20"
              >
                <p>
                  llama.cpp provides{' '}
                  <strong className="text-foreground">maximum inference throughput</strong> with
                  minimal overhead. It exposes an OpenAI-compatible{' '}
                  <code className="text-foreground/80">/v1/chat/completions</code> endpoint,
                  allowing Sutura's TaskRunner to use the same unified API adapter used for cloud
                  providers. Additionally, the native{' '}
                  <code className="text-foreground/80">/props</code> endpoint is probed for model
                  discovery. Ideal for developers with dedicated GPU hardware who want the fastest
                  possible translation pipeline with zero cloud dependency.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Box className="h-4 w-4 text-indigo-500" />}
                title="Ollama — Ease-of-Use"
                accent="border-indigo-500/20"
              >
                <p>
                  Ollama offers a{' '}
                  <strong className="text-foreground">one-command model management</strong>{' '}
                  experience. Models are fetched dynamically via{' '}
                  <code className="text-foreground/80">/api/tags</code> and listed in the Settings
                  model dropdown. No manual GGUF file management needed. Simply run{' '}
                  <code className="text-foreground/80">ollama pull llama3</code> and select it in
                  Sutura. Ollama wraps llama.cpp internally and provides an OpenAI-compatible{' '}
                  <code className="text-foreground/80">/v1</code> API layer. Best for developers who
                  want a zero-friction local AI setup.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Shield className="h-4 w-4 text-emerald-500" />}
                title="Zero Network Traffic"
                accent="border-emerald-500/20"
              >
                <p>
                  When using local providers,{' '}
                  <strong className="text-foreground">no data leaves your machine</strong>. All
                  requests go to <code className="text-foreground/80">localhost</code>. Your source
                  code, comments, string literals, and translations stay entirely within your
                  system. This provides the highest possible privacy guarantee — even segment-only
                  transmission becomes unnecessary because the &ldquo;provider&rdquo; is your own
                  hardware.
                </p>
              </InfoCard>
            </div>
          </div>

          <Separator />

          {/* Security Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <h3 className="text-base font-semibold font-mono">Security &amp; Privacy</h3>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Sutura is designed with a defense-in-depth security model. Every layer &mdash; from
              parsing to logging &mdash; enforces strict data isolation.
            </p>

            <div className="grid grid-cols-1 gap-3">
              <InfoCard
                icon={<Shield className="h-4 w-4 text-emerald-500" />}
                title="Local-First Architecture"
                accent="border-emerald-500/20"
              >
                <p>
                  All file parsing, AST extraction, and node identification happens{' '}
                  <strong className="text-foreground">entirely on your machine</strong> via native
                  Tree-sitter bindings compiled for your platform. The entire workspace file tree,
                  database, and backup system are local. No source code is ever transmitted to any
                  server. The only network traffic is the translation API calls containing isolated
                  text segments.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Send className="h-4 w-4 text-cyan-500" />}
                title="Segment-Only Transmission (Zero-Leak Policy)"
                accent="border-cyan-500/20"
              >
                <p>
                  The AI provider receives <strong className="text-foreground">only</strong>{' '}
                  isolated text segments &mdash; comment bodies and string literal values.
                  Specifically: a JSON array of{' '}
                  <code className="text-foreground/80">{'{ id, node_type, original_text }'}</code>{' '}
                  objects. No filenames, no file paths, no project structure, no surrounding code,
                  no class names, no function signatures. Even if the AI provider were compromised,
                  the attacker would receive nothing but a list of human-readable text snippets with
                  zero context about your codebase.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Lock className="h-4 w-4 text-amber-500" />}
                title="API Key Encryption"
                accent="border-amber-500/20"
              >
                <p>
                  API keys are encrypted using Electron's{' '}
                  <code className="text-foreground/80">safeStorage</code> module, which integrates
                  with the operating system's native keychain (Windows DPAPI, macOS Keychain, Linux
                  libsecret). Keys are{' '}
                  <strong className="text-foreground">never stored in plaintext</strong> &mdash; not
                  in config files, not in the database, not in environment variables. They're
                  decrypted in-memory only when needed for an API call and never logged.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Eye className="h-4 w-4 text-red-500" />}
                title="Log Sanitization"
                accent="border-red-500/20"
              >
                <p>
                  Every log entry passes through a sanitization pipeline before persistence. Regex
                  patterns actively scrub: <code className="text-foreground/80">AIza*</code> (Google
                  API keys), <code className="text-foreground/80">sk-*</code> (OpenAI-style keys),{' '}
                  <code className="text-foreground/80">key=</code> query parameters, and{' '}
                  <code className="text-foreground/80">Authorization</code> headers. Even if you
                  accidentally paste an API key in a translatable comment, it will be redacted from
                  all logs and never sent to the AI provider as a meaningful translation target.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Database className="h-4 w-4 text-orange-500" />}
                title="Reversible Operations &amp; Backup System"
                accent="border-orange-500/20"
              >
                <p>
                  Every disk write is backed by an automatic backup stored in the local SQLite
                  database. The original file content is captured{' '}
                  <strong className="text-foreground">before</strong> any injection, and stored with
                  full path and timestamp. You can revert any committed translation to restore the
                  original file at any time. Virtual injections are held entirely in RAM (Zustand
                  store) and are discarded without writing to disk unless you explicitly commit.
                </p>
              </InfoCard>
            </div>
          </div>

          <Separator />

          {/* Future Roadmap Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-purple-500" />
              <h3 className="text-base font-semibold font-mono">Future Roadmap</h3>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Planned improvements and features under consideration for future releases:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoCard
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                title="Local LLM Support"
                accent="border-emerald-500/20"
              >
                <p>
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px] px-1.5 py-0 mr-1.5">
                    Shipped
                  </Badge>
                  Full integration with <strong className="text-foreground">Ollama</strong> and{' '}
                  <strong className="text-foreground">llama.cpp</strong>. Run translation models
                  entirely on your machine &mdash; zero API calls, zero network traffic, complete
                  air-gap capability.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Puzzle className="h-4 w-4 text-indigo-500" />}
                title="Custom Grammar Support"
                accent="border-indigo-500/20"
              >
                <p>
                  Allow users to load custom Tree-sitter grammars for proprietary or niche languages
                  not in the default 30+ set. Drop a compiled{' '}
                  <code className="text-foreground/80">.node</code> file into a grammars folder and
                  Sutura picks it up automatically.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Database className="h-4 w-4 text-emerald-500" />}
                title="Translation Memory"
                accent="border-emerald-500/20"
              >
                <p>
                  A persistent cache of previously translated segments. If the same comment appears
                  in multiple files (common in large codebases), Sutura reuses the cached
                  translation instead of making another API call &mdash; saving tokens and ensuring
                  consistency.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Layers className="h-4 w-4 text-cyan-500" />}
                title="Parallel Workspace Processing"
                accent="border-cyan-500/20"
              >
                <p>
                  Open and translate multiple workspace folders simultaneously with independent
                  queues, progress bars, and cooldown timers. Each workspace gets its own isolated
                  translation pipeline.
                </p>
              </InfoCard>

              <InfoCard
                icon={<Globe className="h-4 w-4 text-amber-500" />}
                title="Multi-Target Language"
                accent="border-amber-500/20"
              >
                <p>
                  Translate to multiple target languages in a single pass. Generate English,
                  Japanese, and Korean versions of your comments simultaneously, stored as separate
                  translation variants in the database.
                </p>
              </InfoCard>

              <InfoCard
                icon={<FileCode className="h-4 w-4 text-pink-500" />}
                title="Plugin System"
                accent="border-pink-500/20"
              >
                <p>
                  Extensible plugin architecture for custom post-processing hooks, translation
                  validators, and output formatters. Integrate with your team's style guide or
                  terminology glossary automatically.
                </p>
              </InfoCard>
            </div>
          </div>

          <Separator />

          {/* Version Info */}
          <div className="text-center py-4">
            <p className="text-[11px] font-mono text-muted-foreground">
              Sutura &mdash; Precision Code Translation Engine
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
              Native Tree-sitter &bull; Gemini / DeepSeek / OpenAI / Anthropic / Ollama / llama.cpp
              &bull; Electron + React + Zustand
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/40 mt-2">
              Released under the MIT License.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
