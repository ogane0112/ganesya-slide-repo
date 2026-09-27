// スライドを1枚ずつPNGに書き出し、はみ出し(L-01/L-02)を簡易チェックする試作
// 使い方: node tools/layout/snapshot.mjs <slides.md> <出力ディレクトリ>
import fs from 'node:fs'
import path from 'node:path'
import { Marp } from '@marp-team/marp-core'
import { chromium } from 'playwright'

const [, , mdPath, outDir = 'dist/preview'] = process.argv
const themeDir = path.resolve('themes')

const marp = new Marp({ html: true })
for (const f of fs.readdirSync(themeDir).filter((f) => f.endsWith('.css'))) {
  marp.themeSet.add(fs.readFileSync(path.join(themeDir, f), 'utf8'))
}
const { html, css } = marp.render(fs.readFileSync(mdPath, 'utf8'))

fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.setContent(
  `<!doctype html><meta charset="utf-8"><style>${css} body{margin:0} svg[data-marpit-svg]{display:block;width:1280px;height:720px}</style>${html}`,
  { waitUntil: 'load' },
)
await page.evaluate(() => document.fonts.ready)

const svgs = await page.$$('svg[data-marpit-svg]')
const problems = []
for (const [i, svg] of svgs.entries()) {
  const no = String(i + 1).padStart(3, '0')
  await svg.screenshot({ path: path.join(outDir, `slide-${no}.png`) })
  const issues = await svg.evaluate((el) => {
    const sec = el.querySelector('section')
    const out = []
    if (sec.scrollHeight > sec.clientHeight + 1) out.push('L-01 縦にはみ出し')
    for (const pre of sec.querySelectorAll('pre')) {
      if (pre.scrollWidth > pre.clientWidth + 1) out.push('L-02 コードが横にはみ出し')
    }
    return out
  })
  if (issues.length) problems.push(`slide ${i + 1}: ${issues.join(', ')}`)
}
await browser.close()

console.log(problems.length ? problems.join('\n') : `OK: ${svgs.length}枚 はみ出しなし`)
process.exit(problems.length ? 1 : 0)
