// 検査結果(レイアウト検査・Jev精査)をまとめるレポート
// 指摘は Finding に統一し、デッキ→スライド番号の順に並べてMarkdownとJSONで書き出す
import fs from 'node:fs'
import path from 'node:path'

/**
 * must / should / could: レイアウト検査などの要件の優先度
 * warn / caution: Jev精査の判定(警告 / 注意)。OKは指摘に残さない
 */
export type Level = 'must' | 'should' | 'could' | 'warn' | 'caution'

export interface Finding {
  /** デッキのフォルダ(ROOTからの相対パス) */
  deck: string
  /** スライド番号(1始まり)。デッキ全体への指摘は 0 */
  slide: number
  /** 要件ID(例: L-01, J-02) */
  rule: string
  level: Level
  message: string
  /** true ならCIを失敗させる(must は常に失敗。Jev精査は config/review.yml の failOn で決まる) */
  fail?: boolean
}

export interface DeckResult {
  deck: string
  title: string
  slides: number
  /** レポートからの相対パス(サムネイル一覧) */
  contactSheet?: string
  /** Jev精査で指摘のあったスライドの原文(スライド番号 → Markdown) */
  sources?: Record<number, string>
}

export interface Report {
  generatedAt: string
  decks: DeckResult[]
  findings: Finding[]
  /** 精査をスキップした理由など、レポート冒頭に出す注記 */
  notes?: string[]
}

const LEVEL_LABEL: Record<Level, string> = {
  must: '❌ Must',
  should: '⚠️ Should',
  could: '💭 Could',
  warn: '🔴 警告',
  caution: '🟡 注意',
}

export const isFailure = (f: Finding): boolean => f.level === 'must' || f.fail === true

/** CIを失敗させる指摘が1件でもあれば終了コード1 */
export function hasFailure(report: Report): boolean {
  return report.findings.some(isFailure)
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = ['# 検査レポート', '', `生成: ${report.generatedAt}`, '']
  const fail = report.findings.filter(isFailure).length
  const other = report.findings.length - fail
  lines.push(
    fail ? `**NG**: 要対応 ${fail}件 / その他 ${other}件` : `**OK**: 要対応なし(その他 ${other}件)`,
    '',
    ...(report.notes ?? []).map((n) => `> ${n}\n`),
    '| デッキ | 枚数 | 要対応 | その他 |',
    '| --- | --- | --- | --- |',
  )
  for (const d of report.decks) {
    const fs_ = report.findings.filter((f) => f.deck === d.deck)
    const m = fs_.filter(isFailure).length
    lines.push(`| ${d.title}<br>\`${d.deck}\` | ${d.slides} | ${m} | ${fs_.length - m} |`)
  }

  for (const d of report.decks) {
    lines.push('', `## ${d.title}`, '', `\`${d.deck}\``, '')
    const items = report.findings
      .filter((f) => f.deck === d.deck)
      .sort((a, b) => a.slide - b.slide || a.rule.localeCompare(b.rule))
    if (items.length) {
      lines.push('| スライド | 要件 | 区分 | 内容 |', '| --- | --- | --- | --- |')
      for (const f of items) {
        const label = `${LEVEL_LABEL[f.level]}${f.fail && f.level !== 'must' ? '(要対応)' : ''}`
        lines.push(`| ${f.slide || '全体'} | ${f.rule} | ${label} | ${escapeCell(f.message)} |`)
      }
    } else {
      lines.push('指摘なし')
    }
    const sources = Object.entries(d.sources ?? {})
    if (sources.length) {
      lines.push('', '### 指摘スライドの原文', '', 'Claude Code に「スライドNを直して」と頼むときの材料にする。')
      for (const [no, md] of sources) {
        lines.push('', `<details><summary>スライド ${no}</summary>`, '', '````markdown', md, '````', '', '</details>')
      }
    }
    if (d.contactSheet) lines.push('', `![サムネイル一覧](${d.contactSheet})`)
  }
  return `${lines.join('\n')}\n`
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

export function writeReport(report: Report, outDir: string): { md: string; json: string } {
  fs.mkdirSync(outDir, { recursive: true })
  const md = path.join(outDir, 'report.md')
  const json = path.join(outDir, 'report.json')
  fs.writeFileSync(md, renderMarkdown(report))
  fs.writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`)
  return { md, json }
}
