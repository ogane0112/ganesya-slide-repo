// スライド管理CLI
//   new <slug> [--category 学習|まとめ|講座] [--title タイトル]  雛形から新規デッキを作る(M-03)
//   build [デッキのパス...] [--format html,pdf,pptx]            HTML/PDF/PPTXを dist/ に一括出力(M-05)
//   validate                                                   全デッキのfrontmatterを検査(M-02)
//   list                                                       デッキの一覧を表示
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { marpCli } from '@marp-team/marp-cli'
import { CATEGORIES, type Category, type Deck, findDecks, ROOT, validateMeta } from './lib/decks.ts'

const FORMATS = ['html', 'pdf', 'pptx'] as const
type Format = (typeof FORMATS)[number]

const [command, ...rest] = process.argv.slice(2)
const commands: Record<string, (argv: string[]) => Promise<number> | number> = {
  new: cmdNew,
  build: cmdBuild,
  validate: cmdValidate,
  list: cmdList,
}

if (!command || !commands[command]) {
  console.error('使い方: npm run cli -- <new|build|validate|list> [...]')
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

  let decks = findDecks()
  if (positionals.length) {
    const wanted = positionals.map((p) => path.relative(ROOT, path.resolve(p)).split(path.sep).join('/'))
    decks = decks.filter((d) => wanted.some((w) => d.relDir === w || d.relDir.startsWith(`${w}/`) || `${d.relDir}/slides.md` === w))
  }
  if (!decks.length) {
    console.error('対象のデッキがない')
    return 1
  }

  const browserPath = formats.some((f) => f !== 'html') ? await findBrowser() : undefined
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

/** CHROME_PATH がなければ Playwright の Chromium を使う(見つからなければMarp CLIの自動検出に任せる) */
async function findBrowser(): Promise<string | undefined> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  try {
    const { chromium } = await import('playwright')
    const p = chromium.executablePath()
    return fs.existsSync(p) ? p : undefined
  } catch {
    return undefined
  }
}

/** HTML版から相対パスで画像を参照できるように images/ をコピーする */
function copyImages(deck: Deck, outDir: string): void {
  const src = path.join(path.dirname(deck.file), 'images')
  if (!fs.existsSync(src)) return
  fs.cpSync(src, path.join(outDir, 'images'), { recursive: true, filter: (p) => path.basename(p) !== '.gitkeep' })
}
