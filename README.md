# slides-repo

Marpで作った学習・まとめ・講座スライドの置き場です。書いたスライドを自動で精査・レイアウト検査し、必要なときはPowerPointにも変換できるようにしています(開発中)。

![サンプル](docs/sample-preview.png)

## 構成

| パス | 内容 |
| --- | --- |
| `decks/{learning,summary,course}/` | 1デッキ=1フォルダ(`slides.md` + `images/`) |
| `archive/` | 完成済みの既存スライド(検査対象外) |
| `themes/wakaba.css` | 共通テーマ「若葉ライト」 |
| `templates/deck/` | 新規デッキの雛形 |
| `tools/cli.ts` | new / build / validate / list |
| `tools/` | レイアウト検査・Jev精査などのツール |
| `powershell/` | PowerPoint COM補助スクリプト |
| `docs/requirements.md` | 要件定義書 |

## 使い方

```bash
npm install
npm run new -- aws-ecs --category 講座 --title "ECS入門"   # 雛形から decks/course/YYYY-MM-aws-ecs/ を作成
npm run preview                                           # ブラウザでプレビュー
npm run validate                                          # frontmatterの検査
npm run build                                             # 全デッキを dist/ にHTML/PDF/PPTXで出力
npm run build -- decks/learning --format html             # 対象と形式を絞って出力
```

- デッキは `decks/<learning|summary|course>/<YYYY-MM-slug>/slides.md` に置き、frontmatter に `title` `category`(学習/まとめ/講座) `tags` `status`(draft/review/done) `created` `updated` を書く
- 出力先は `dist/<デッキのパス>/` で、`index.html`・`<slug>.pdf`・`<slug>.pptx` ができる(`images/` もコピー)
- PDF/PPTXにはChromeが必要。見つからないときは `CHROME_PATH` でパスを指定する
