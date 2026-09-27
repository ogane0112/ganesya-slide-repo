// Marp原稿をスライド単位に分割する(レイアウト検査の行番号付け、R-01のState化で使う)
export interface SlideSource {
  /** 1始まりのスライド番号 */
  no: number
  /** 原稿内の開始行(1始まり) */
  line: number
  body: string
}

const RULER = /^ {0,3}([-*_])( *\1){2,} *$/

/** frontmatterを除き、コードブロック外の水平線(---等)でスライドに分ける */
export function splitSlides(markdown: string): SlideSource[] {
  const lines = markdown.replace(/^﻿/, '').split(/\r?\n/)
  let i = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) i = end + 1
  }
  const slides: SlideSource[] = []
  let start = i
  let fence: string | null = null
  const push = (endExclusive: number) => {
    const body = lines.slice(start, endExclusive).join('\n')
    slides.push({ no: slides.length + 1, line: firstContentLine(lines, start, endExclusive), body })
  }
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})/)
    if (m) {
      if (!fence) fence = m[1]
      else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
      continue
    }
    // 直前が段落行だと setext見出し(h2)になるので区切りとみなさない
    if (!fence && RULER.test(lines[i]) && !(lines[i].trim().startsWith('-') && i > 0 && lines[i - 1].trim() && i - 1 >= start)) {
      push(i)
      start = i + 1
    }
  }
  push(lines.length)
  return slides
}

function firstContentLine(lines: string[], from: number, to: number): number {
  for (let j = from; j < to; j++) if (lines[j].trim()) return j + 1
  return from + 1
}
