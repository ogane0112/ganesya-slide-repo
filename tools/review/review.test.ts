// Jevを呼ばずに精査の流れを確かめる: AI SDK には偽の評価モデルを渡す
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Experimental_EvaluationModelV4 as ModelV4 } from '@ai-sdk/provider'
import { loadReviewConfig } from '../lib/config.ts'
import { createJevEvaluator, withCache } from './jev.ts'
import { reviewDeck } from './review.ts'

const cfg = loadReviewConfig()
const deckFile = path.join(import.meta.dirname, '..', 'layout', 'fixtures', 'ok', 'slides.md')

type Call = { state: unknown; questions: Record<string, { type: string }> }

/** スライド2だけ「誤りの可能性が高い」「情報量が多すぎ」と答える偽モデル */
function fakeModel(calls: Call[]): ModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'fake',
    modelId: 'fake-jev',
    supportedQuestionTypes: ['boolean', 'score', 'choice'],
    async doEvaluate({ state, questions }) {
      calls.push({ state, questions: questions as Call['questions'] })
      const slideNo = (state as { slide?: { number: number } }).slide?.number
      const answers: Record<string, unknown> = {}
      for (const [id, q] of Object.entries(questions)) {
        if (q.type === 'boolean') answers[id] = { type: 'boolean', probability: id === 'J-01' && slideNo === 2 ? 0.9 : id === 'J-03' ? 0.95 : 0.05 }
        if (q.type === 'score') answers[id] = { type: 'score', score: id === 'J-02' && slideNo === 2 ? 3.8 : id === 'J-02' ? 2 : 4 }
        if (q.type === 'choice') answers[id] = { type: 'choice', choice: slideNo === 6 ? 'まとめ' : '説明' }
      }
      return { answers, warnings: [] } as never
    },
  }
}

test('スライドごとに質問をまとめて1リクエストにし、注意・警告だけ指摘に残す', async () => {
  const calls: Call[] = []
  const res = await reviewDeck({ file: deckFile, deck: 'ok', meta: { title: 'テスト' } }, cfg, createJevEvaluator(fakeModel(calls)))

  // 6スライド + デッキ全体(J-06)の7リクエスト。タイトルスライドでは J-02/J-03/J-04 を聞かない
  assert.equal(calls.length, 7)
  assert.deepEqual(Object.keys(calls[0].questions).sort(), ['J-01', 'J-05', 'J-07'])
  assert.equal(calls.filter((c) => 'J-06' in c.questions).length, 1)
  // Noul は AI SDK では boolean 型
  assert.equal(calls[1].questions['J-01'].type, 'boolean')

  assert.deepEqual(
    res.findings.map((f) => [f.slide, f.rule, f.level]),
    [
      [2, 'J-01', 'warn'],
      [2, 'J-02', 'warn'],
    ],
  )
  assert.match(res.findings[1].message, /4\.8 \/ 5/)
  assert.deepEqual(Object.keys(res.sources), ['2'])
  assert.match(res.sources[2], /ざっくり言うと/)
  assert.equal(res.roles[6], 'まとめ')
})

test('キャッシュ: 同じStateと質問なら2回目は呼ばない', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jev-')), 'cache.json')
  const calls: Call[] = []
  const target = { file: deckFile, deck: 'ok', meta: {} }
  const first = withCache(createJevEvaluator(fakeModel(calls)), file, 'fake')
  await reviewDeck(target, cfg, first)
  const second = withCache(createJevEvaluator(fakeModel(calls)), file, 'fake')
  await reviewDeck(target, cfg, second)
  assert.equal(first.misses, 7)
  assert.equal(second.hits, 7)
  assert.equal(calls.length, 7)
})
