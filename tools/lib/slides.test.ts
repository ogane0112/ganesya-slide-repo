import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitSlides } from './slides.ts'

test('frontmatterを除き、コードブロック内の --- では分割しない', () => {
  const md = ['---', 'marp: true', '---', '', '# A', '', '---', '', '# B', '', '```yaml', '---', 'a: 1', '```', '', '---', '# C'].join('\n')
  const slides = splitSlides(md)
  assert.deepEqual(
    slides.map((s) => [s.no, s.line]),
    [
      [1, 5],
      [2, 9],
      [3, 17],
    ],
  )
})
