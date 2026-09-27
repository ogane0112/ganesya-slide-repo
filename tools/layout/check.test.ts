// レイアウト検査の回帰テスト: fixtures/ng は各スライドに1種類ずつ違反を仕込んである
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { Browser } from 'playwright'
import { launchBrowser } from '../lib/browser.ts'
import { loadLayoutConfig } from '../lib/config.ts'
import { checkLayout } from './check.ts'

const fixture = (name: string) => ({ file: path.join(import.meta.dirname, 'fixtures', name, 'slides.md'), deck: name })
const cfg = loadLayoutConfig()
let browser: Browser

before(async () => {
  browser = await launchBrowser()
})
after(async () => {
  await browser?.close()
})

test('問題のないデッキは指摘なし', async () => {
  const res = await checkLayout(fixture('ok'), browser, cfg)
  assert.equal(res.slides, 6)
  assert.deepEqual(res.findings, [])
})

test('違反を仕込んだスライドだけを正しい要件IDで検出する', async () => {
  const res = await checkLayout(fixture('ng'), browser, cfg)
  assert.equal(res.slides, 5)
  const bySlide = (no: number) => [...new Set(res.findings.filter((f) => f.slide === no).map((f) => f.rule))]
  assert.deepEqual(bySlide(1), [])
  assert.deepEqual(bySlide(2), ['L-01'])
  assert.deepEqual(bySlide(3), ['L-02'])
  assert.deepEqual(bySlide(4), ['L-03'])
  assert.deepEqual(bySlide(5), ['L-01'])
  assert.ok(res.findings.every((f) => f.level === 'must'))
})
