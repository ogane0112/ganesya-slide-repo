// 検査・出力で使うChromiumの場所。CHROME_PATH → Playwright同梱のChromium の順で探す
import fs from 'node:fs'
import { type Browser, chromium } from 'playwright'

export function findBrowserPath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const p = chromium.executablePath()
  return fs.existsSync(p) ? p : undefined
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = findBrowserPath()
  try {
    return await chromium.launch(executablePath ? { executablePath } : {})
  } catch (e) {
    throw new Error(`Chromiumを起動できない。CHROME_PATH でパスを指定するか npx playwright install chromium を実行する\n${e}`)
  }
}
