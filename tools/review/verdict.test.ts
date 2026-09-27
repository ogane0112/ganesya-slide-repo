import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadReviewConfig } from '../lib/config.ts'
import { judge, type Question, shouldFail, validateReviewConfig } from './verdict.ts'

const cfg = loadReviewConfig()
const q = (id: string) => cfg.questions[id] as Question

test('config/review.yml に矛盾がない', () => {
  assert.deepEqual(validateReviewConfig(cfg), [])
})

test('noul(bad: high): 確率が閾値を超えると注意→警告', () => {
  const j01 = { type: 'noul', bad: 'high', caution: 0.5, warn: 0.8, target: 'slide', text: '' } as const
  assert.equal(judge(j01, { type: 'noul', probability: 0.2 }), 'ok')
  assert.equal(judge(j01, { type: 'noul', probability: 0.5 }), 'caution')
  assert.equal(judge(j01, { type: 'noul', probability: 0.9 }), 'warn')
})

test('noul(bad: low): 確率が低いほど悪い', () => {
  const j03 = { type: 'noul', bad: 'low', caution: 0.5, warn: 0.3, target: 'slide', text: '' } as const
  assert.equal(judge(j03, { type: 'noul', probability: 0.9 }), 'ok')
  assert.equal(judge(j03, { type: 'noul', probability: 0.4 }), 'caution')
  assert.equal(judge(j03, { type: 'noul', probability: 0.1 }), 'warn')
})

test('score: 段階ごとに割り当て(J-02 は両端が悪い)', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((score) => judge(q('J-02'), { type: 'score', score })),
    ['warn', 'caution', 'ok', 'caution', 'warn'],
  )
})

test('確信度が低い答えは指摘にしない', () => {
  const j01 = { type: 'noul', bad: 'high', caution: 0.5, warn: 0.8, target: 'slide', text: '' } as const
  assert.equal(judge(j01, { type: 'noul', probability: 0.9, confidence: 0.2 }, 0.5), 'ok')
})

test('CI失敗: 全体は none、J-07 だけ警告で失敗', () => {
  assert.equal(shouldFail('warn', q('J-01'), cfg), false)
  assert.equal(shouldFail('caution', q('J-07'), cfg), false)
  assert.equal(shouldFail('warn', q('J-07'), cfg), true)
})

test('設定の矛盾を検出する', () => {
  const bad = {
    failOn: 'none',
    minConfidence: 0,
    questions: {
      X: { type: 'noul', bad: 'high', caution: 0.8, warn: 0.5, target: 'slide', text: '' },
      Y: { type: 'score', scale: [1, 5], caution: [2, 6], warn: [2], target: 'slide', text: '' },
    },
  } as const
  assert.equal(validateReviewConfig(bad as never).length, 3)
})
