import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadReviewConfig } from '../lib/config.ts'
import { describeAnswer, judge, type Question, shouldFail, validateReviewConfig } from './verdict.ts'

const cfg = loadReviewConfig()
const q = (id: string) => cfg.questions[id] as Question
const noul = (probability: number) => ({ type: 'noul', probability }) as const
const score = (value: number) => ({ type: 'score', value }) as const

test('config/review.yml に矛盾がない', () => {
  assert.deepEqual(validateReviewConfig(cfg), [])
})

test('noul(bad: high): 確率が閾値を超えると注意→警告', () => {
  const j01 = { type: 'noul', bad: 'high', caution: 0.5, warn: 0.8, target: 'slide', text: '' } as const
  assert.deepEqual([0.2, 0.5, 0.9].map((p) => judge(j01, noul(p))), ['ok', 'caution', 'warn'])
})

test('noul(bad: low): 確率が低いほど悪い', () => {
  const j03 = { type: 'noul', bad: 'low', caution: 0.5, warn: 0.3, target: 'slide', text: '' } as const
  assert.deepEqual([0.9, 0.4, 0.1].map((p) => judge(j03, noul(p))), ['ok', 'caution', 'warn'])
})

test('score(bad: both): J-02 は理想(3)からのずれで判定', () => {
  assert.deepEqual(
    [1, 1.8, 2.5, 3, 3.6, 4, 4.6].map((v) => judge(q('J-02'), score(v))),
    ['warn', 'caution', 'ok', 'ok', 'ok', 'caution', 'warn'],
  )
})

test('score(bad: low): J-04 は低いほど悪い', () => {
  assert.deepEqual([1.5, 2.8, 4.2].map((v) => judge(q('J-04'), score(v))), ['warn', 'caution', 'ok'])
})

test('CI失敗: 全体は none、J-07 だけ警告で失敗', () => {
  assert.equal(shouldFail('warn', q('J-01'), cfg), false)
  assert.equal(shouldFail('caution', q('J-07'), cfg), false)
  assert.equal(shouldFail('warn', q('J-07'), cfg), true)
})

test('答えの表示: score は最も近い段階の説明を添える', () => {
  assert.equal(describeAnswer(q('J-02'), score(4.6)), '4.6 / 5(多すぎる)')
  assert.equal(describeAnswer(q('J-01'), noul(0.834)), '確率 0.83')
})

test('設定の矛盾を検出する', () => {
  const bad = {
    ...cfg,
    skipOnTitleSlide: ['J-99'],
    questions: {
      X: { type: 'noul', bad: 'high', caution: 0.8, warn: 0.5, target: 'slide', text: '' },
      Y: { type: 'score', levels: ['a', 'b', 'c'], bad: 'low', caution: 4, warn: 1, target: 'slide', text: '' },
      Z: { type: 'score', levels: ['a', 'b', 'c'], bad: 'both', caution: 1, warn: 1.5, target: 'slide', text: '' },
    },
  }
  assert.deepEqual(validateReviewConfig(bad as never).length, 4)
})
