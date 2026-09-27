// Jev精査: デッキをスライドに分けてState化し(R-01)、質問をまとめて投げ(R-02)、
// 答えを OK / 注意 / 警告 に振り分けて Finding にする(R-03)
import fs from 'node:fs'
import type { Finding } from '../lib/report.ts'
import { splitSlides } from '../lib/slides.ts'
import type { Evaluator } from './jev.ts'
import { type Answer, describeAnswer, judge, type Question, type ReviewConfig, shouldFail } from './verdict.ts'

export interface ReviewTarget {
  file: string
  deck: string
  meta: Record<string, unknown>
}

export interface ReviewResult {
  findings: Finding[]
  /** 指摘のあったスライドの原文(R-04: レポートに載せてClaude Codeとの対話で直す) */
  sources: Record<number, string>
  /** J-05 の役割分類(R-07 用) */
  roles: Record<number, string>
}

const CONCURRENCY = 4

/** Marpのディレクティブ(<!-- _class: title --> 等)は判定のノイズなので外す。発表者ノートは残す */
function stripDirectives(md: string): string {
  return md
    .replace(/<!--\s*_?[\w-]+\s*:[^>]*?-->\s*\n?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function headingOf(md: string): string {
  return md.match(/^#{1,6}\s+(.+)$/m)?.[1].trim() ?? '(見出しなし)'
}

export async function reviewDeck(target: ReviewTarget, cfg: ReviewConfig, evaluate: Evaluator): Promise<ReviewResult> {
  const slides = splitSlides(fs.readFileSync(target.file, 'utf8'))
  const headings = slides.map((s) => headingOf(s.body))
  const deckInfo = {
    title: String(target.meta.title ?? ''),
    category: String(target.meta.category ?? ''),
    tags: Array.isArray(target.meta.tags) ? target.meta.tags : [],
    headings,
  }
  const entries = Object.entries(cfg.questions)
  const slideQuestions = entries.filter(([, q]) => q.target !== 'deck')
  const deckQuestions = Object.fromEntries(entries.filter(([, q]) => q.target === 'deck'))

  const findings: Finding[] = []
  const sources: Record<number, string> = {}
  const roles: Record<number, string> = {}
  const record = (slide: number, id: string, q: Question, a: Answer | undefined) => {
    if (!a) return
    if (a.type === 'choice') roles[slide] = a.choice
    const verdict = judge(q, a)
    if (verdict === 'ok') return
    findings.push({
      deck: target.deck,
      slide,
      rule: id,
      level: verdict,
      message: `${q.text} → ${describeAnswer(q, a)}`,
      fail: shouldFail(verdict, q, cfg) || undefined,
    })
  }

  // スライドごとに1リクエスト(並列数は控えめに)
  const queue = [...slides]
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const isTitle = /<!--\s*_class:\s*[^>]*\btitle\b/.test(s.body)
      const qs = Object.fromEntries(slideQuestions.filter(([id]) => !(isTitle && cfg.skipOnTitleSlide.includes(id))))
      if (!Object.keys(qs).length) continue
      const state = { deck: deckInfo, slide: { number: s.no, total: slides.length, markdown: stripDirectives(s.body) } }
      const answers = await evaluate(state, qs)
      const before = findings.length
      for (const [id, q] of Object.entries(qs)) record(s.no, id, q, answers[id])
      if (findings.length > before) sources[s.no] = s.body.trim()
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slides.length) }, worker))

  // デッキ全体への質問(J-06)は見出しの一覧をStateにして1リクエスト
  if (Object.keys(deckQuestions).length) {
    const answers = await evaluate(deckInfo, deckQuestions)
    for (const [id, q] of Object.entries(deckQuestions)) record(0, id, q, answers[id])
  }
  return { findings, sources, roles }
}
