---
marp: true
theme: wakaba
paginate: true
title: ECS Fargateってなに?
category: 学習
tags: [AWS, ECS, Fargate, コンテナ]
status: draft
created: 2026-09-27
updated: 2026-09-27
---

<!-- _class: title -->
<!-- _paginate: skip -->

<div class="tag">AWS 学習メモ #1</div>

# ECS Fargateってなに?

サーバーを持たずにコンテナを動かす仕組み

2026-09-27

---

# ざっくり言うと

- コンテナを動かす**サーバーをAWSが用意**してくれる
- 自分で決めるのは「CPUとメモリをどれだけ使うか」だけ
- OSのパッチ当てや台数の調整は気にしなくていい

<div class="point">

ECSは「コンテナを動かす司令塔」、Fargateは「コンテナが乗る場所」。
組み合わせて使う。

</div>

---

# EC2で動かす場合との違い

| | EC2 起動タイプ | Fargate |
| --- | --- | --- |
| サーバーの管理 | 自分でやる | AWSにおまかせ |
| 料金の単位 | インスタンスの時間 | タスクのvCPU・メモリ |
| 細かいカスタマイズ | できる | 制限あり |

<div class="warn">

Fargateではホストにログインできない。
ホスト側での特殊な設定が必要なら、EC2の方が向いている。

</div>

---

# 登場人物をおさえる

- **クラスター**: タスクやサービスをまとめる入れ物
- **タスク定義**: どのイメージを、どのCPU・メモリで動かすかの設計図
- **タスク**: タスク定義から起動した、実際に動いているコンテナ
- **サービス**: タスクを決まった数だけ動かし続ける見張り役

<div class="note">

タスクが落ちても、サービスが新しいタスクを立ち上げ直してくれる。

</div>

---

# タスク定義の例

```json
{
  "family": "hello-web",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "256", "memory": "512",
  "containerDefinitions": [{ "name": "web", "image": "nginx:latest" }]
}
```

<div class="warn">

`networkMode` は `awsvpc` 固定。CPUとメモリの組み合わせにも決まりがある。

</div>

---

# まとめ

<div class="summary">

- Fargate = コンテナ用の「サーバーを意識しない」実行環境
- 決めるのはタスク定義(イメージ・CPU・メモリ)
- 動かし続けたいならサービスを作る

</div>

<div class="ref">

Amazon ECS デベロッパーガイド「AWS Fargate の Amazon ECS」
https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/AWS_Fargate.html

</div>
