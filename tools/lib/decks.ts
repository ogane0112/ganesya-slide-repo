// デッキ(1フォルダ = slides.md + images/)の探索とfrontmatterの読み取り
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')

/** 種別(日本語) → decks/ 配下のフォルダ名 */
export const CATEGORIES = { 学習: 'learning', まとめ: 'summary', 講座: 'course' } as const
export type Category = keyof typeof CATEGORIES
export const STATUSES = ['draft', 'review', 'done'] as const
export type Status = (typeof STATUSES)[number]

export interface Deck {
  /** slides.md の絶対パス */
  file: string
  /** デッキフォルダのROOTからの相対パス(区切りは常に /) */
  relDir: string
  /** フォルダ名(例: 2026-09-ecs-fargate) */
  slug: string
  /** archive/ 配下なら true(精査・検査の対象外) */
  archived: boolean
  meta: Record<string, unknown>
}

const SOURCE_DIRS = ['decks', 'archive'] as const

export function findDecks(): Deck[] {
  const decks: Deck[] = []
  for (const top of SOURCE_DIRS) {
    const base = path.join(ROOT, top)
    if (!fs.existsSync(base)) continue
    for (const file of walk(base)) {
      const dir = path.dirname(file)
      decks.push({
        file,
        relDir: path.relative(ROOT, dir).split(path.sep).join('/'),
        slug: path.basename(dir),
        archived: top === 'archive',
        meta: readFrontmatter(file),
      })
    }
  }
  return decks.sort((a, b) => a.relDir.localeCompare(b.relDir))
}

function* walk(dir: string): Generator<string> {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name !== 'images' && !ent.name.startsWith('.')) yield* walk(p)
    } else if (ent.name === 'slides.md') {
      yield p
    }
  }
}

export function readFrontmatter(file: string): Record<string, unknown> {
  const src = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return {}
  const data = parseYaml(m[1])
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

/** M-02 のfrontmatter検査。問題があればメッセージを返す */
export function validateMeta(deck: Deck): string[] {
  const { meta } = deck
  const errors: string[] = []
  if (meta.marp !== true) errors.push('marp: true がない')
  if (typeof meta.title !== 'string' || !meta.title.trim()) errors.push('title がない')
  if (!Object.hasOwn(CATEGORIES, String(meta.category))) {
    errors.push(`category は ${Object.keys(CATEGORIES).join(' / ')} のいずれか(現在: ${meta.category})`)
  } else if (!deck.archived) {
    const expected = `decks/${CATEGORIES[meta.category as Category]}/`
    if (!deck.relDir.startsWith(expected)) errors.push(`category「${meta.category}」のデッキは ${expected} に置く`)
  }
  if (!Array.isArray(meta.tags) || meta.tags.some((t) => typeof t !== 'string')) errors.push('tags は文字列の配列')
  if (!STATUSES.includes(meta.status as Status)) errors.push(`status は ${STATUSES.join(' / ')} のいずれか(現在: ${meta.status})`)
  for (const key of ['created', 'updated']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta[key] ?? ''))) errors.push(`${key} は YYYY-MM-DD 形式`)
  }
  return errors
}
