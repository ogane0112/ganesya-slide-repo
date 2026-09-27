// ブラウザ内で実行するレイアウト検査(L-01/L-02/L-03)
// tsx(esbuild)の変換を通すと page.evaluate で壊れることがあるため、素のJSで addScriptTag から読み込む
window.__layoutCheck = (opts) => {
  const tol = opts.tolerancePx

  const describe = (el) => {
    const cls = el.classList.length ? `.${el.classList[0]}` : ''
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    return `${el.tagName.toLowerCase()}${cls}${text ? `「${text.length > 20 ? `${text.slice(0, 20)}…` : text}」` : ''}`
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }
  const outermost = (els) => els.filter((el) => !els.some((o) => o !== el && o.contains(el)))
  const examples = (els) => {
    const shown = els.slice(0, 3).map(describe).join('、')
    return els.length > 3 ? `${shown} ほか${els.length - 3}件` : shown
  }

  return [...document.querySelectorAll('svg[data-marpit-svg] > foreignObject > section')].map((sec) => {
    const issues = []
    const box = sec.getBoundingClientRect()

    // L-01: スライド外へのはみ出し。pre の中身は L-02 で見る
    const st = getComputedStyle(sec)
    const inner = {
      left: box.left + parseFloat(st.paddingLeft),
      top: box.top + parseFloat(st.paddingTop),
      right: box.right - parseFloat(st.paddingRight),
      bottom: box.bottom - parseFloat(st.paddingBottom),
    }
    const beyond = (area) =>
      outermost(
        [...sec.querySelectorAll('*')].filter((el) => {
          if (el.closest('pre') || !visible(el)) return false
          const r = el.getBoundingClientRect()
          return r.left < area.left - tol || r.top < area.top - tol || r.right > area.right + tol || r.bottom > area.bottom + tol
        }),
      )
    const overY = sec.scrollHeight - sec.clientHeight
    const overX = sec.scrollWidth - sec.clientWidth
    if (overY > tol || overX > tol) {
      // 下の余白(ページ番号の場所)に食い込んだだけでも scroll量に出るので、原因は本文領域基準で探す
      const culprits = beyond(inner)
      const who = culprits.length ? `(${examples(culprits)})` : ''
      if (overY > tol) issues.push({ rule: 'L-01', message: `縦に${overY}pxはみ出し${who}` })
      if (overX > tol) issues.push({ rule: 'L-01', message: `横に${overX}pxはみ出し${who}` })
    } else {
      // 絶対配置などはscroll量に出ないので、スライド枠そのものとの比較で見る
      const outside = beyond(box)
      if (outside.length) issues.push({ rule: 'L-01', message: `要素がスライド枠外: ${examples(outside)}` })
    }

    // L-02: コードブロックの横はみ出し(Marpの自動縮小は切って描画している)
    for (const pre of sec.querySelectorAll('pre')) {
      const over = pre.scrollWidth - pre.clientWidth
      if (over > tol) {
        const scale = Math.round((pre.clientWidth / pre.scrollWidth) * 100)
        const firstLine = (pre.textContent || '').split('\n')[0].slice(0, 30)
        issues.push({
          rule: 'L-02',
          message: `コードが横に${over}pxはみ出し(自動縮小なら約${scale}%に縮む)「${firstLine}」`,
        })
      }
    }

    // L-03: 文字を直接持つ要素のフォントサイズ下限
    const small = [...sec.querySelectorAll('*')].filter((el) => {
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
      return hasText && visible(el) && parseFloat(getComputedStyle(el).fontSize) < opts.minFontSize - 0.01
    })
    if (small.length) {
      const sizes = [...new Set(small.map((el) => parseFloat(getComputedStyle(el).fontSize)))].sort((a, b) => a - b)
      issues.push({
        rule: 'L-03',
        message: `${opts.minFontSize}px未満の文字(${sizes.map((s) => `${Math.round(s * 10) / 10}px`).join('/')}): ${examples(outermost(small))}`,
      })
    }
    return issues
  })
}
