// Jevの答え(確率・段階)を ok / caution(注意) / warn(警告) に振り分ける。閾値は config/review.yml
export type Verdict = 'ok' | 'caution' | 'warn'
export type FailOn = 'none' | 'warn' | 'caution'

interface QuestionBase {
  target: 'slide' | 'slide+deck' | 'deck'
  text: string
  failOn?: FailOn
}
export interface NoulQuestion extends QuestionBase {
  type: 'noul'
  /** high: 確率が高いほど悪い / low: 低いほど悪い */
  bad: 'high' | 'low'
  caution: number
  warn: number
}
export interface ScoreQuestion extends QuestionBase {
  type: 'score'
  scale: [number, number]
  caution: number[]
  warn: number[]
}
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice'
  choices: string[]
}
export type Question = NoulQuestion | ScoreQuestion | ChoiceQuestion

export interface ReviewConfig {
  failOn: FailOn
  minConfidence: number
  questions: Record<string, Question>
}

export type Answer =
  | { type: 'noul'; probability: number; confidence?: number }
  | { type: 'score'; score: number; confidence?: number }
  | { type: 'choice'; choice: string; confidence?: number }

export function judge(q: Question, a: Answer, minConfidence = 0): Verdict {
  if (a.confidence !== undefined && a.confidence < minConfidence) return 'ok'
  if (q.type === 'noul' && a.type === 'noul') {
    const p = a.probability
    if (q.bad === 'high') return p >= q.warn ? 'warn' : p >= q.caution ? 'caution' : 'ok'
    return p <= q.warn ? 'warn' : p <= q.caution ? 'caution' : 'ok'
  }
  if (q.type === 'score' && a.type === 'score') {
    return q.warn.includes(a.score) ? 'warn' : q.caution.includes(a.score) ? 'caution' : 'ok'
  }
  if (q.type === 'choice' && a.type === 'choice') return 'ok'
  throw new Error(`質問の型(${q.type})と答えの型(${a.type})が合わない`)
}

/** この判定でCIを失敗させるか(質問ごとの failOn が全体設定より優先) */
export function shouldFail(verdict: Verdict, q: Question, cfg: ReviewConfig): boolean {
  const failOn = q.failOn ?? cfg.failOn
  if (verdict === 'ok' || failOn === 'none') return false
  return failOn === 'caution' || verdict === 'warn'
}

/** 設定の矛盾(閾値の向き・範囲外の段階)を検出する */
export function validateReviewConfig(cfg: ReviewConfig): string[] {
  const errors: string[] = []
  for (const [id, q] of Object.entries(cfg.questions)) {
    if (q.type === 'noul') {
      if ([q.caution, q.warn].some((v) => !(v >= 0 && v <= 1))) errors.push(`${id}: caution/warn は 0〜1`)
      else if (q.bad === 'high' && q.warn < q.caution) errors.push(`${id}: bad: high なら warn ≥ caution`)
      else if (q.bad === 'low' && q.warn > q.caution) errors.push(`${id}: bad: low なら warn ≤ caution`)
    } else if (q.type === 'score') {
      const [lo, hi] = q.scale
      const out = [...q.caution, ...q.warn].filter((s) => s < lo || s > hi)
      if (out.length) errors.push(`${id}: 段階 ${out.join(',')} が scale [${lo}, ${hi}] の範囲外`)
      const both = q.caution.filter((s) => q.warn.includes(s))
      if (both.length) errors.push(`${id}: 段階 ${both.join(',')} が caution と warn の両方にある`)
    }
  }
  return errors
}
