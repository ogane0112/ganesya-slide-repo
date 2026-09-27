# CLAUDE.md

Marpで作った学習・まとめ・講座スライドを集約し、作成から精査・検査・PowerPoint化までを支援する個人リポジトリ。
要件の詳細は `docs/requirements.md`(要件ID: M-xx / R-xx / J-xx / L-xx / P-xx)を必ず先に読むこと。

## 前提・決定事項

- 公開リポジトリ。職場のスライドはコンプライアンス上扱わない(スコープ外)
- APIキーは `.env`(ローカル)/ GitHub Secrets(CI)。コード・ログ・コミットに含めない。`.env.example` を参照
- Jevは Vercel AI Gateway 経由(モデル名 `typesafe-ai/jev`、AI SDK 7 の評価用関数から呼ぶ)。
  2026年9月公開の早期提供モデルで仕様が変わりうるため、呼び出しは1モジュールに閉じ込め、Claudeのみで判定するフォールバックを用意する
- 修正案の文章生成は Claude(Jevは文章を生成しない。判定=Jev、文章=Claude、数値チェック=コード)
- 検査・変換ツールは Node.js(TypeScript)、PowerPoint操作だけ PowerShell + COM
- 完成済みの既存スライドは `archive/` に置き、精査・検査の対象外(索引とPages公開には含める)
- PowerPointテンプレート(.potx)は自作して `templates/` に置く

## デザイン(テーマ `themes/wakaba.css` に実装済み)

- 16:9(1280×720)、若葉ライト: 背景 #F4F9EE / 文字 #2E3A27 / アクセント #6BAA45、ちょっと緩い雰囲気
- 見出し(h1/h2)は中央寄せのラベル風: 背景 #7AB258・白文字・角丸
- 見出しは上に固定、本文は見出しの下の残り領域で縦中央(flex + auto margin)
- フォント: Zen Maru Gothic(コードは UDEV Gothic)。見出し40px / 本文28px / 注釈20px
- 吹き出し5種: `<div class="point|warn|note|summary|ref">` → 💡⚠️📝✅🔗 をテーマ側で付与
- タイトルスライドは `<!-- _class: title -->`、上のタグは `<div class="tag">`

## 現状

- 済: 要件定義、テーマ、サンプルデッキ `decks/learning/2026-09-ecs-fargate/`、レイアウト検査の試作 `tools/layout/snapshot.mjs`(L-01/L-02/L-07相当)
- 未決: 検査の閾値のうち L-04(1枚の行数・文字数上限)と、種別(学習/まとめ/講座)ごとの見た目の差 → ユーザーと相談して決める
- 次のタスク: `docs/requirements.md` の「開発フェーズ」1→2→3→4 の順

## コマンド

```bash
npm install
npx marp --server decks                      # プレビュー
npm run build                                # dist/ に一括出力
node tools/layout/snapshot.mjs <slides.md> dist/preview   # PNG書き出し+はみ出し検査(違反でexit 1)
```

## 注意点(試作で分かったこと)

- Marp標準テーマは `place-content: safe center center` で中身を縦中央に寄せる。上詰め系の調整は `display:flex` + `justify-content` を `!important` で上書きしている
- テーマのGoogle Fonts `@import` はネットワーク制限下だと効かない。ローカル描画ではフォントをOSにインストールしておく
- Marp CLIの `--images png` はヘッドレスChromeが不安定なことがあった。検査・プレビュー画像は Playwright で自前描画する方式(snapshot.mjs)を基本にする
- Playwrightのブラウザを別パスで使う場合は `CHROME_PATH` 環境変数で指定できる
- 原稿でHTMLのdivを使うため `.marprc.yml` で `html: true`。div内でMarkdownを使うときは前後に空行を入れる
