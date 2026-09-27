# archive/

完成済みの既存スライドの置き場です(M-07)。精査・レイアウト検査の対象外ですが、一括出力(`npm run build`)と索引には含めます。

- 1デッキ=1フォルダで置く: `archive/<YYYY-MM-slug>/slides.md` + `images/`
- 中身は手を入れずそのまま置いてよい。frontmatter(`title` `category` `tags` `status` `created` `updated`)が足りなくても `npm run validate` では警告にとどめる
- 索引をきれいにするため、できれば `title` と `category` だけは足しておく
