# CLAUDE.md

Marpで作った学習・まとめ・講座スライドを集約し、作成から精査・検査・PowerPoint化までを支援する個人リポジトリ。
要件の詳細は `docs/requirements.md`(要件ID: M-xx / R-xx / J-xx / L-xx / P-xx)を必ず先に読むこと。

## 前提・決定事項

- 公開リポジトリ。職場のスライドはコンプライアンス上扱わない(スコープ外)
- APIキーは `.env`(ローカル)/ GitHub Secrets(CI)。コード・ログ・コミットに含めない。`.env.example` を参照
- Jevは Vercel AI Gateway 経由(モデル名 `typesafe-ai/jev`、AI SDK 7 の評価用関数から呼ぶ)。
  2026年9月公開の早期提供モデルで仕様が変わりうるため、呼び出しは1モジュールに閉じ込める。Jevが使えないときは精査だけ警告付きでスキップ(レイアウト検査は続ける)
- Claude API(LLM API)は使わない。修正案はレポート(指摘スライドの原文付き)を見ながら Claude Code との対話で作る(判定=Jev、文章=人+Claude Code、数値チェック=コード)
- 検査・変換ツールは Node.js(TypeScript)、PowerPoint操作だけ PowerShell + COM
- 完成済みの既存スライドは `archive/` に置き、精査・検査の対象外(索引とPages公開には含める)
- PowerPointテンプレート(.potx)は自作して `templates/` に置く

## デッキの作り方

メモからデッキを作る・原稿を直すときは `.claude/skills/make-deck/SKILL.md`(手順・1枚の分量・吹き出しの使い分け・やってはいけないこと)に従う。

## デザイン(テーマ `themes/wakaba.css` に実装済み)

- 16:9(1280×720)、若葉ライト: 背景 #F4F9EE / 文字 #2E3A27 / アクセント #6BAA45、ちょっと緩い雰囲気
- 見出し(h1/h2)は中央寄せのラベル風: 背景 #7AB258・白文字・角丸
- 見出しは上に固定、本文は見出しの下の残り領域で縦中央(flex + auto margin)
- フォント: Zen Maru Gothic(コードは UDEV Gothic)。見出し40px / 本文28px / 注釈20px
- 吹き出し5種: `<div class="point|warn|note|summary|ref">` → 💡⚠️📝✅🔗 をテーマ側で付与
- タイトルスライドは `<!-- _class: title -->`、上のタグは `<div class="tag">`

## 現状

- 済: 要件定義、テーマ、サンプルデッキ `decks/learning/2026-09-ecs-fargate/`
- 済(フェーズ1): フォルダ構成、雛形 `templates/deck/slides.md`、`tools/cli.ts`(new / build / validate / list)。archive/ への既存スライドの集約はユーザー作業待ち
- 済(フェーズ2): レイアウト検査 `tools/layout/`(L-01/L-02/L-03/L-07)、統合レポート `tools/lib/report.ts`(reports/report.md・json)、CI `.github/workflows/check.yml`
- 未決: 検査の閾値のうち L-04(1枚の行数・文字数上限)と、種別(学習/まとめ/講座)ごとの見た目の差 → ユーザーと相談して決める
- 済(フェーズ3): Jev精査 `tools/review/`(R-01〜R-06)。`npm run check` でレイアウト検査と一緒に走り、統合レポートに 🔴警告/🟡注意 と指摘スライドの原文を出す。閾値 `config/review.yml` は仮値で、実デッキで確率を見ながらユーザーと調整する(完了条件: 既存デッキ3本で誤検出が許容範囲)。R-07(構成チェック)は未着手
- 次のタスク: Jevの閾値調整(キーが使える環境で実デッキを流す)→ フェーズ4(PowerPoint補助)

## コマンド

```bash
npm install
npx marp --server decks                      # プレビュー
npm run new -- <slug> --category 講座 [--title ...]   # 雛形から新規デッキ
npm run validate                             # frontmatter検査(M-02、archive/は警告のみ)
npm run build [-- <パス...>] [--format html,pdf,pptx]   # dist/<デッキのパス>/ に一括出力
npm run check [-- <パス...>] [--no-images] [--no-layout] [--no-review]   # レイアウト検査+Jev精査 → reports/(要対応でexit 1、archive/は対象外)
npm run typecheck
npm test                                     # tools/**/*.test.ts(Chromiumが必要)
```

## 注意点(試作で分かったこと)

- Marp標準テーマは `place-content: safe center center` で中身を縦中央に寄せる。上詰め系の調整は `display:flex` + `justify-content` を `!important` で上書きしている
- テーマのGoogle Fonts `@import` はネットワーク制限下だと効かない。ローカル描画ではフォントをOSにインストールしておく
- Marp CLIの `--images png` はヘッドレスChromeが不安定なことがあった。検査・プレビュー画像は Playwright で自前描画する方式(tools/layout/check.ts)を基本にする
- Marpはコードブロックがはみ出すと自動縮小する(`<pre is="marp-pre">`)。検査では `script: false` で自動縮小を切り、`pre` は `overflow:hidden` にして L-02 だけで数える
- ブラウザ内で動かす検査コードは `tools/layout/inpage.js`(素のJS)。tsxで変換した関数を `page.evaluate` に渡すと `__name` 未定義で壊れることがある
- L-03 はテーマ装飾のページ番号(`section::after`、18px)を対象外にしている。閾値は `config/layout.yml`
- Playwrightのブラウザを別パスで使う場合は `CHROME_PATH` 環境変数で指定できる。`build` のPDF/PPTXも `CHROME_PATH` → Playwright同梱Chromium → Marp CLIの自動検出の順で探す
- Jevは AI SDK 7 の `experimental_evaluate`。Noul は `boolean` 型、Score は0始まりの小数(期待値)で返り、確信度は無い。AI SDK に触るのは `tools/review/jev.ts` だけ。テストは偽の評価モデルを渡して行う
- `.env` は `tools/cli.ts` が `process.loadEnvFile` で読む。Jevの答えは `.cache/jev.json` にキャッシュ(閾値だけ変えたときは再リクエストしない)
- TypeScriptは tsx で直接実行(ビルド不要)。相対importは `.ts` 拡張子付きで書く
- 原稿でHTMLのdivを使うため `.marprc.yml` で `html: true`。div内でMarkdownを使うときは前後に空行を入れる
