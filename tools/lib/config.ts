// config/ 配下の設定ファイルの読み込み
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { ROOT } from './decks.ts'

export interface LayoutConfig {
  tolerancePx: number
  minFontSize: number
  contactSheet: { columns: number; thumbWidth: number }
}

const LAYOUT_DEFAULTS: LayoutConfig = {
  tolerancePx: 1,
  minFontSize: 20,
  contactSheet: { columns: 4, thumbWidth: 320 },
}

export function loadLayoutConfig(file = path.join(ROOT, 'config', 'layout.yml')): LayoutConfig {
  const data = fs.existsSync(file) ? (parseYaml(fs.readFileSync(file, 'utf8')) ?? {}) : {}
  return {
    ...LAYOUT_DEFAULTS,
    ...data,
    contactSheet: { ...LAYOUT_DEFAULTS.contactSheet, ...data.contactSheet },
  }
}
