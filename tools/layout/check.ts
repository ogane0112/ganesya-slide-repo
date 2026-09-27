// レイアウト検査: Marp原稿を実際に描画し、はみ出し(L-01/L-02)とフォントサイズ(L-03)を検出、
// スライドごとのPNGとサムネイル一覧(L-07)を書き出す
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Marp } from '@marp-team/marp-core'
import type { Browser, Page } from 'playwright'
import type { LayoutConfig } from '../lib/config.ts'
import { ROOT } from '../lib/decks.ts'
import { type Finding, isFailure, type Level } from '../lib/report.ts'

export const LAYOUT_RULES: Record<string, Level> = { 'L-01': 'must', 'L-02': 'must', 'L-03': 'must' }

const SLIDE_W = 1280
const SLIDE_H = 720
const INPAGE_SCRIPT = path.join(import.meta.dirname, 'inpage.js')

export interface LayoutTarget {
  /** slides.md のパス */
  file: string
  /** レポート上のデッキ名(ROOTからの相対パス) */
  deck: string
}

export interface LayoutResult {
  findings: Finding[]
  slides: number
  /** 書き出したPNG(outDir指定時のみ) */
  images: string[]
  contactSheet?: string
}

/** Marp原稿をHTMLにする。自動縮小(script)は切り、はみ出しをそのまま測れるようにする */
export function renderDeckHtml(file: string): string {
  const marp = new Marp({ html: true, script: false })
  const themeDir = path.join(ROOT, 'themes')
  for (const f of fs.readdirSync(themeDir).filter((f) => f.endsWith('.css'))) {
    marp.themeSet.add(fs.readFileSync(path.join(themeDir, f), 'utf8'))
  }
  const { html, css } = marp.render(fs.readFileSync(file, 'utf8'))
  const base = pathToFileURL(path.dirname(path.resolve(file))).href
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}/">
<style>${css}
body{margin:0;background:#888}
/* 本番ではコードは自動縮小で枠内に収まるので、はみ出しは L-02 だけで数える */
section pre{overflow:hidden!important}
svg[data-marpit-svg]{display:block;width:${SLIDE_W}px;height:${SLIDE_H}px}</style></head>
<body>${html}</body></html>`
}

export async function checkLayout(
  target: LayoutTarget,
  browser: Browser,
  cfg: LayoutConfig,
  outDir?: string,
): Promise<LayoutResult> {
  // 画像の相対パスを解決するため、HTMLは一時ファイルに書いて file:// で開く
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-'))
  const htmlFile = path.join(tmp, 'deck.html')
  fs.writeFileSync(htmlFile, renderDeckHtml(target.file))

  const page = await browser.newPage({ viewport: { width: SLIDE_W, height: SLIDE_H } })
  try {
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
    // レイアウトを確定させてからWebフォントの読み込みを待つ
    await page.evaluate('void document.body.offsetHeight, document.fonts.ready.then(() => {})')
    await page.addScriptTag({ path: INPAGE_SCRIPT })
    const perSlide = (await page.evaluate(`window.__layoutCheck(${JSON.stringify(cfg)})`)) as {
      rule: string
      message: string
    }[][]

    const findings: Finding[] = perSlide.flatMap((issues, i) =>
      issues.map((it) => ({
        deck: target.deck,
        slide: i + 1,
        rule: it.rule,
        level: LAYOUT_RULES[it.rule] ?? 'should',
        message: it.message,
      })),
    )

    const result: LayoutResult = { findings, slides: perSlide.length, images: [] }
    if (outDir) {
      const shots = await screenshotSlides(page, path.join(outDir, 'slides'))
      result.images = shots
      const bad = new Set(findings.filter(isFailure).map((f) => f.slide))
      result.contactSheet = path.join(outDir, 'contact.png')
      await writeContactSheet(browser, shots, bad, cfg, result.contactSheet)
    }
    return result
  } finally {
    await page.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

async function screenshotSlides(page: Page, dir: string): Promise<string[]> {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (const [i, svg] of (await page.$$('svg[data-marpit-svg]')).entries()) {
    const file = path.join(dir, `slide-${String(i + 1).padStart(3, '0')}.png`)
    await svg.screenshot({ path: file })
    files.push(file)
  }
  return files
}

/** L-07: 全スライドのサムネイルを1枚に並べる。Must違反のスライドは赤枠 */
async function writeContactSheet(
  browser: Browser,
  shots: string[],
  bad: Set<number>,
  cfg: LayoutConfig,
  file: string,
): Promise<void> {
  const { columns, thumbWidth } = cfg.contactSheet
  const cells = shots
    .map((s, i) => {
      const src = `data:image/png;base64,${fs.readFileSync(s).toString('base64')}`
      return `<figure class="${bad.has(i + 1) ? 'bad' : ''}"><img src="${src}"><figcaption>${i + 1}</figcaption></figure>`
    })
    .join('')
  const width = columns * (thumbWidth + 16) + 16
  const page = await browser.newPage({ viewport: { width, height: 200 } })
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#e9efe3;font:14px sans-serif;width:${width - 32}px}
main{display:grid;grid-template-columns:repeat(${columns},${thumbWidth}px);gap:16px}
figure{margin:0;padding:4px;background:#fff;border:3px solid #fff;border-radius:6px}
figure.bad{border-color:#d33}
img{display:block;width:100%}
figcaption{text-align:center;color:#555;padding-top:2px}
figure.bad figcaption{color:#d33;font-weight:bold}
</style><main>${cells}</main>`)
    await page.screenshot({ path: file, fullPage: true })
  } finally {
    await page.close()
  }
}
