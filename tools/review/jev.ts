// Jev(Vercel AI Gateway 経由)の呼び出し。AI SDK に触るのはこのファイルだけにする
// Jevは早期提供で仕様が変わりうるため、差し替えはここだけで済むようにする
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createGateway } from '@ai-sdk/gateway'
import {
  experimental_evaluate as evaluate,
  type Experimental_EvaluationModel as EvaluationModel,
  type Experimental_EvaluationQuestion as JevQuestion,
} from 'ai'
import type { Answer, Question } from './verdict.ts'

export type JevState = string | Record<string, unknown>

/** 1つのStateに複数の質問をまとめて投げ、質問IDごとの答えを返す(R-02) */
export type Evaluator = (state: JevState, questions: Record<string, Question>) => Promise<Record<string, Answer>>

export function hasJevCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

function toJevQuestion(q: Question): JevQuestion {
  switch (q.type) {
    case 'noul':
      return { type: 'boolean', instructions: q.text }
    case 'score':
      return { type: 'score', instructions: q.text, criteria: q.levels }
    case 'choice':
      return { type: 'choice', instructions: q.text, criteria: q.choices }
  }
}

/** model が文字列なら AI Gateway のモデルID。テストではモデルのオブジェクトを直接渡せる */
export function createJevEvaluator(model: string | Exclude<EvaluationModel, string>): Evaluator {
  const jev = typeof model === 'string' ? createGateway().evaluationModel(model) : model
  return async (state, questions) => {
    const jevQuestions = Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, toJevQuestion(q)]))
    const { answers } = await evaluate({ model: jev, state: state as never, questions: jevQuestions })
    const out: Record<string, Answer> = {}
    for (const [id, a] of Object.entries(answers)) {
      if (a.type === 'boolean') out[id] = { type: 'noul', probability: a.probability }
      // score は 0始まりの小数で返るので、設定と合わせて 1始まりにする
      else if (a.type === 'score') out[id] = { type: 'score', value: a.score + 1 }
      else out[id] = { type: 'choice', choice: a.choice, probability: a.probabilities?.[a.choice] }
    }
    return out
  }
}

/** 同じState・同じ質問なら前回の答えを使う(R-06)。質問文や閾値以外の定義が変わればキーも変わる */
export function withCache(inner: Evaluator, file: string, model: string): Evaluator & { hits: number; misses: number } {
  let cache: Record<string, Record<string, Answer>> = {}
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  const fn = Object.assign(
    async (state: JevState, questions: Record<string, Question>) => {
      const key = crypto
        .createHash('sha256')
        .update(JSON.stringify([model, state, Object.entries(questions).map(([id, q]) => [id, toJevQuestion(q)])]))
        .digest('hex')
      if (cache[key]) {
        fn.hits++
        return cache[key]
      }
      fn.misses++
      const answers = await inner(state, questions)
      cache[key] = answers
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(cache))
      return answers
    },
    { hits: 0, misses: 0 },
  )
  return fn
}
