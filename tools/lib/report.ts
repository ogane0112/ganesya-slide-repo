// 検査結果(レイアウト検査・Jev精査)をまとめるレポート
// 指摘は Finding に統一し、デッキ→スライド番号の順に並べてMarkdownとJSONで書き出す
import fs from 'node:fs'
import path from 'node:path'

/** must の指摘が1件でもあれば終了コード1(CIで失敗させる) */
export type Level = 'must' | 'should' | 'could'

export interface Finding {
  /** デッキのフォルダ(ROOTからの相対パス) */
  deck: string
  /** スライド番号(1始まり)。デッキ全体への指摘は 0 */
  slide: number
  /** 要件ID(例: L-01, J-02) */
  rule: string
  level: Level
  message: string
}

export interface DeckResult {
  deck: string
  title: string
  slides: number
  /** レポートからの相対パス(サムネイル一覧) */
  contactSheet?: string
}

export interface Report {
  generatedAt: string
  decks: DeckResult[]
  findings: Finding[]
}

const LEVEL_LABEL: Record<Level, string> = { must: '❌ Must', should: '⚠️ Should', could: '💭 Could' }

export function hasMustViolation(report: Report): boolean {
  return report.findings.some((f) => f.level === 'must')
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = ['# 検査レポート', '', `生成: ${report.generatedAt}`, '']
  const must = report.findings.filter((f) => f.level === 'must').length
  const other = report.findings.length - must
  lines.push(
    must ? `**NG**: Must違反 ${must}件 / その他 ${other}件` : `**OK**: Must違反なし(その他 ${other}件)`,
    '',
    '| デッキ | 枚数 | Must | その他 |',
    '| --- | --- | --- | --- |',
  )
  for (const d of report.decks) {
    const fs_ = report.findings.filter((f) => f.deck === d.deck)
    const m = fs_.filter((f) => f.level === 'must').length
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
        lines.push(`| ${f.slide || '全体'} | ${f.rule} | ${LEVEL_LABEL[f.level]} | ${escapeCell(f.message)} |`)
      }
    } else {
      lines.push('指摘なし')
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
