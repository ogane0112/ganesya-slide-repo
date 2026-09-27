// スライド管理CLI
//   new <slug> [--category 学習|まとめ|講座] [--title タイトル]  雛形から新規デッキを作る(M-03)
//   build [デッキのパス...] [--format html,pdf,pptx]            HTML/PDF/PPTXを dist/ に一括出力(M-05)
//   validate                                                   全デッキのfrontmatterを検査(M-02)
//   check [デッキのパス...] [--out reports] [--no-images] [--no-layout] [--no-review]
//                                                              レイアウト検査(L-xx)+Jev精査(J-xx)→統合レポート。要対応で exit 1
//   list                                                       デッキの一覧を表示
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { marpCli } from '@marp-team/marp-cli'
import { checkLayout } from './layout/check.ts'
import { findBrowserPath, launchBrowser } from './lib/browser.ts'
import { loadLayoutConfig, loadReviewConfig } from './lib/config.ts'
import { CATEGORIES, type Category, type Deck, findDecks, ROOT, validateMeta } from './lib/decks.ts'
import { type DeckResult, type Finding, hasFailure, isFailure, renderMarkdown, type Report, writeReport } from './lib/report.ts'
import { splitSlides } from './lib/slides.ts'
import { createJevEvaluator, type Evaluator, hasJevCredentials, withCache } from './review/jev.ts'
import { reviewDeck } from './review/review.ts'
import { validateReviewConfig } from './review/verdict.ts'

const FORMATS = ['html', 'pdf', 'pptx'] as const
type Format = (typeof FORMATS)[number]

const [command, ...rest] = process.argv.slice(2)
const commands: Record<string, (argv: string[]) => Promise<number> | number> = {
  new: cmdNew,
  build: cmdBuild,
  validate: cmdValidate,
  check: cmdCheck,
  list: cmdList,
}

// APIキーはローカルでは .env から読む(CIでは環境変数で渡す)
const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

if (!command || !commands[command]) {
  console.error('使い方: npm run cli -- <new|build|validate|check|list> [...]')
  process.exit(command ? 1 : 0)
}
process.exitCode = await commands[command](rest)

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function cmdNew(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { category: { type: 'string', default: '学習' }, title: { type: 'string' } },
  })
  const [slugArg] = positionals
  const category = values.category as Category
  if (!slugArg || !/^[a-z0-9][a-z0-9-]*$/.test(slugArg)) {
    console.error('slug は英小文字・数字・ハイフンで指定する(例: npm run new -- aws-ecs --category 講座)')
    return 1
  }
  if (!Object.hasOwn(CATEGORIES, category)) {
    console.error(`--category は ${Object.keys(CATEGORIES).join(' / ')} のいずれか`)
    return 1
  }

  const date = today()
  // 先頭に YYYY-MM- が付いていなければ付ける
  const slug = /^\d{4}-\d{2}-/.test(slugArg) ? slugArg : `${date.slice(0, 7)}-${slugArg}`
  const dir = path.join(ROOT, 'decks', CATEGORIES[category], slug)
  if (fs.existsSync(dir)) {
    console.error(`すでに存在する: ${path.relative(ROOT, dir)}`)
    return 1
  }

  const vars: Record<string, string> = { title: values.title ?? slugArg, category, date }
  const body = fs
    .readFileSync(path.join(ROOT, 'templates', 'deck', 'slides.md'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'images', '.gitkeep'), '')
  fs.writeFileSync(path.join(dir, 'slides.md'), body)
  console.log(`作成: ${path.relative(ROOT, path.join(dir, 'slides.md'))}`)
  return 0
}

function cmdValidate(): number {
  const decks = findDecks()
  let failed = 0
  for (const deck of decks) {
    const errors = validateMeta(deck)
    if (!errors.length) continue
    // archive/ は完成済みのものをそのまま置くので警告にとどめる
    const label = deck.archived ? '警告' : 'エラー'
    if (!deck.archived) failed++
    for (const e of errors) console.log(`${label}: ${deck.relDir}/slides.md: ${e}`)
  }
  console.log(failed ? `NG: ${failed}件のデッキに問題あり` : `OK: ${decks.length}デッキ`)
  return failed ? 1 : 0
}

function cmdList(): number {
  for (const d of findDecks()) {
    const { title = '(無題)', category = '-', status = '-' } = d.meta
    console.log(`${d.archived ? '[archive] ' : ''}${d.relDir}\t${category}\t${status}\t${title}`)
  }
  return 0
}

async function cmdBuild(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { format: { type: 'string', default: FORMATS.join(',') } },
  })
  const formats = values.format.split(',').map((f) => f.trim()) as Format[]
  const unknown = formats.filter((f) => !FORMATS.includes(f))
  if (unknown.length) {
    console.error(`未対応の形式: ${unknown.join(', ')}(${FORMATS.join(' / ')} から選ぶ)`)
    return 1
  }

  const decks = selectDecks(positionals)
  if (!decks.length) {
    console.error('対象のデッキがない')
    return 1
  }

  const browserPath = formats.some((f) => f !== 'html') ? findBrowserPath() : undefined
  let failed = 0
  for (const deck of decks) {
    const outDir = path.join(ROOT, 'dist', deck.relDir)
    fs.mkdirSync(outDir, { recursive: true })
    copyImages(deck, outDir)
    for (const format of formats) {
      const out = path.join(outDir, format === 'html' ? 'index.html' : `${deck.slug}.${format}`)
      const ok = await runMarp(marpArgs(deck, format, out, browserPath))
      if (!ok) failed++
      console.log(`${ok ? '出力' : '失敗'}: ${path.relative(ROOT, out)}`)
    }
  }
  return failed ? 1 : 0
}

async function runMarp(args: string[]): Promise<boolean> {
  try {
    return (await marpCli(args)) === 0
  } catch (e) {
    // ブラウザが見つからない等はここに来る
    console.error(e instanceof Error ? e.message : e)
    if (String(e).includes('browser')) console.error('PDF/PPTXにはChromeが必要。CHROME_PATH でパスを指定できる')
    return false
  }
}

function marpArgs(deck: Deck, format: Format, out: string, browserPath?: string): string[] {
  const args = [deck.file, '--no-config-file', '--html', '--theme-set', path.join(ROOT, 'themes'), '-o', out, '--quiet']
  if (format !== 'html') {
    args.push(`--${format}`, '--allow-local-files')
    if (browserPath) args.push('--browser-path', browserPath)
  }
  return args
}

/** HTML版から相対パスで画像を参照できるように images/ をコピーする */
function copyImages(deck: Deck, outDir: string): void {
  const src = path.join(path.dirname(deck.file), 'images')
  if (!fs.existsSync(src)) return
  fs.cpSync(src, path.join(outDir, 'images'), { recursive: true, filter: (p) => path.basename(p) !== '.gitkeep' })
}

/** 引数のパス(フォルダ or slides.md)に一致するデッキ。指定がなければ全部 */
function selectDecks(paths: string[]): Deck[] {
  const decks = findDecks()
  if (!paths.length) return decks
  const wanted = paths.map((p) => path.relative(ROOT, path.resolve(p)).split(path.sep).join('/'))
  return decks.filter((d) =>
    wanted.some((w) => w === '' || d.relDir === w || d.relDir.startsWith(`${w}/`) || `${d.relDir}/slides.md` === w),
  )
}

async function cmdCheck(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', default: 'reports' },
      'no-images': { type: 'boolean', default: false },
      'no-layout': { type: 'boolean', default: false },
      'no-review': { type: 'boolean', default: false },
    },
  })
  const selected = selectDecks(positionals)
  // archive/ は完成済みなので検査しない(M-07)
  const decks = selected.filter((d) => !d.archived)
  if (selected.length > decks.length) console.log(`archive/ の${selected.length - decks.length}デッキは検査対象外`)
  if (!decks.length) {
    console.error('検査対象のデッキがない')
    return selected.length ? 0 : 1
  }

  const report: Report = { generatedAt: new Date().toISOString(), decks: [], findings: [], notes: [] }
  const note = (msg: string) => {
    console.warn(`注意: ${msg}`)
    report.notes?.push(msg)
  }

  // Jev精査の準備。キーが無い・呼び出しに失敗したときは精査だけスキップする(レイアウト検査は続ける)
  const reviewCfg = loadReviewConfig()
  const cfgErrors = validateReviewConfig(reviewCfg)
  if (cfgErrors.length) {
    for (const e of cfgErrors) console.error(`config/review.yml: ${e}`)
    return 1
  }
  let evaluate: Evaluator | undefined
  let cache: ReturnType<typeof withCache> | undefined
  if (values['no-review']) {
    // 明示的に切ったときは注記しない
  } else if (!hasJevCredentials()) {
    note('AI_GATEWAY_API_KEY が無いため、Jev精査はスキップした')
  } else {
    cache = withCache(createJevEvaluator(reviewCfg.model), path.join(ROOT, '.cache', 'jev.json'), reviewCfg.model)
    evaluate = cache
  }

  const layoutCfg = loadLayoutConfig()
  const outRoot = path.resolve(values.out)
  const browser = values['no-layout'] ? undefined : await launchBrowser()
  try {
    for (const deck of decks) {
      const result: DeckResult = { deck: deck.relDir, title: String(deck.meta.title ?? deck.slug), slides: 0 }
      const findings: Finding[] = []
      if (browser) {
        const outDir = values['no-images'] ? undefined : path.join(outRoot, deck.relDir)
        const res = await checkLayout({ file: deck.file, deck: deck.relDir }, browser, layoutCfg, outDir)
        result.slides = res.slides
        if (res.contactSheet) result.contactSheet = path.relative(outRoot, res.contactSheet).split(path.sep).join('/')
        findings.push(...res.findings)
      }
      if (evaluate) {
        try {
          const res = await reviewDeck({ file: deck.file, deck: deck.relDir, meta: deck.meta }, reviewCfg, evaluate)
          findings.push(...res.findings)
          if (Object.keys(res.sources).length) result.sources = res.sources
        } catch (e) {
          note(`Jevの呼び出しに失敗したため、${deck.relDir} 以降の精査はスキップした(${e instanceof Error ? e.message : e})`)
          evaluate = undefined
        }
      }
      const slideCount = result.slides || splitSlides(fs.readFileSync(deck.file, 'utf8')).length
      result.slides = slideCount
      report.decks.push(result)
      report.findings.push(...findings)
      const fails = findings.filter(isFailure).length
      console.log(`${fails ? 'NG' : 'OK'}: ${deck.relDir}(${slideCount}枚、要対応${fails}件 / 指摘${findings.length}件)`)
      printFindings(deck, slideCount, findings)
    }
  } finally {
    await browser?.close()
  }
  if (cache) console.log(`Jev: ${cache.misses}リクエスト(キャッシュ利用 ${cache.hits}件)`)

  const { md } = writeReport(report, outRoot)
  console.log(`レポート: ${path.relative(ROOT, md)}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    // サマリーでは相対パスの画像が表示できないので外す
    const summary = renderMarkdown(report).replace(/^!\[.*\n?/gm, '')
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  }
  return hasFailure(report) ? 1 : 0
}

/** 指摘を表示する。GitHub Actions上では原稿の該当行に注釈を付ける */
function printFindings(deck: Deck, slideCount: number, findings: Finding[]): void {
  const sources = splitSlides(fs.readFileSync(deck.file, 'utf8'))
  // 分割結果が描画枚数と食い違うときは行番号を付けない
  const lineOf = (no: number) => (sources.length === slideCount ? sources[no - 1]?.line : undefined) ?? 1
  const file = path.relative(ROOT, deck.file).split(path.sep).join('/')
  for (const f of findings) {
    const where = `${file}:${lineOf(f.slide)}`
    console.log(`  slide ${f.slide} [${f.rule}/${f.level}] ${f.message}(${where})`)
    if (process.env.GITHUB_ACTIONS) {
      const kind = isFailure(f) ? 'error' : 'warning'
      const msg = `slide ${f.slide}: ${f.message}`.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
      console.log(`::${kind} file=${file},line=${lineOf(f.slide)},title=${f.rule}::${msg}`)
    }
  }
}
