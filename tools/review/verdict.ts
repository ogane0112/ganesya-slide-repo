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
  /** 段階の説明(低い順)。判定値は 1〜levels.length に換算する */
  levels: string[]
  /** high / low: 値の向き。both: ideal からのずれ(絶対値)で判定 */
  bad: 'high' | 'low' | 'both'
  ideal?: number
  caution: number
  warn: number
}
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice'
  /** 選択肢 → 説明 */
  choices: Record<string, string | null>
}
export type Question = NoulQuestion | ScoreQuestion | ChoiceQuestion

export interface ReviewConfig {
  model: string
  /** 同時に投げるリクエスト数 */
  concurrency: number
  /** 混雑エラー時の再試行回数 */
  retries: number
  failOn: FailOn
  skipOnTitleSlide: string[]
  questions: Record<string, Question>
}

/** Jevの答えを判定用にならしたもの(score は 1始まりに換算済み) */
export type Answer =
  | { type: 'noul'; probability: number }
  | { type: 'score'; value: number }
  | { type: 'choice'; choice: string; probability?: number }

/** 数値を閾値と比べる。bad が high なら大きいほど悪い、low なら小さいほど悪い */
function grade(x: number, bad: 'high' | 'low', caution: number, warn: number): Verdict {
  if (bad === 'high') return x >= warn ? 'warn' : x >= caution ? 'caution' : 'ok'
  return x <= warn ? 'warn' : x <= caution ? 'caution' : 'ok'
}

export function judge(q: Question, a: Answer): Verdict {
  if (q.type === 'noul' && a.type === 'noul') return grade(a.probability, q.bad, q.caution, q.warn)
  if (q.type === 'score' && a.type === 'score') {
    if (q.bad === 'both') return grade(Math.abs(a.value - (q.ideal ?? 0)), 'high', q.caution, q.warn)
    return grade(a.value, q.bad, q.caution, q.warn)
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

/** 答えを人が読める形にする(レポート用) */
export function describeAnswer(q: Question, a: Answer): string {
  if (a.type === 'noul') return `確率 ${a.probability.toFixed(2)}`
  if (a.type === 'score' && q.type === 'score') {
    const nearest = q.levels[Math.min(q.levels.length, Math.max(1, Math.round(a.value))) - 1]
    return `${a.value.toFixed(1)} / ${q.levels.length}(${nearest})`
  }
  if (a.type === 'choice') return `${a.choice}${a.probability !== undefined ? `(${a.probability.toFixed(2)})` : ''}`
  return ''
}

/** 設定の矛盾(閾値の向き・範囲外)を検出する */
export function validateReviewConfig(cfg: ReviewConfig): string[] {
  const errors: string[] = []
  const order = (id: string, bad: 'high' | 'low', caution: number, warn: number) => {
    if (bad === 'high' && warn < caution) errors.push(`${id}: bad: high なら warn ≥ caution`)
    if (bad === 'low' && warn > caution) errors.push(`${id}: bad: low なら warn ≤ caution`)
  }
  for (const [id, q] of Object.entries(cfg.questions)) {
    if (q.type === 'noul') {
      if ([q.caution, q.warn].some((v) => !(v >= 0 && v <= 1))) errors.push(`${id}: caution/warn は 0〜1`)
      else order(id, q.bad, q.caution, q.warn)
    } else if (q.type === 'score') {
      const n = q.levels?.length ?? 0
      if (n < 2 || n > 10) errors.push(`${id}: levels は2〜10個`)
      if (q.bad === 'both') {
        if (q.ideal === undefined || q.ideal < 1 || q.ideal > n) errors.push(`${id}: bad: both には 1〜${n} の ideal が必要`)
        order(id, 'high', q.caution, q.warn)
      } else {
        if ([q.caution, q.warn].some((v) => !(v >= 1 && v <= n))) errors.push(`${id}: caution/warn は 1〜${n}`)
        order(id, q.bad, q.caution, q.warn)
      }
    } else if (q.type === 'choice') {
      if (!q.choices || Object.keys(q.choices).length < 2) errors.push(`${id}: choices は2つ以上`)
    }
  }
  for (const id of cfg.skipOnTitleSlide) {
    if (!cfg.questions[id]) errors.push(`skipOnTitleSlide: ${id} は questions にない`)
  }
  return errors
}
