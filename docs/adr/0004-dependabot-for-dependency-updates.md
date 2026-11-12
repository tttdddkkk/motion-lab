# 0004: 依存更新に Dependabot を使い、公開直後の版を待つ

- 状態: 採用
- 日付: 2026-11-12

## 背景

依存はすべて開発用で、数も10個未満。公開しているビューア自体は依存ゼロ。主なリスクは手元や CI での npm サプライチェーン攻撃と、放置による脆弱性。

## 決定

- Dependabot alerts と security updates を GitHub の設定で有効にする
- `.github/dependabot.yml` で npm と GitHub Actions を毎週月曜 9:00（Asia/Tokyo）に確認する
- `cooldown` で公開から7日（major は14日）経った版だけを取り込む。脆弱性修正にはこの待ちはかからない（Dependabot の仕様）
- `storybook` / `@storybook/*` と `vitest` / `@vitest/*` は、バージョンを揃える必要があるため major も含めてそれぞれ1つの PR にまとめる。それ以外は minor と patch をまとめる
- CI（`npm ci` → `npm test`）で更新 PR を検証する

## 検討した他の案

- Renovate: 設定は柔軟だが GitHub App の導入が別に必要。この規模では Dependabot で足りる
- 更新 PR の自動マージ: 当時はマージ前のチェック必須化がなかったため見送り（その後 0006 で必須化した。自動マージ自体は未導入）

## 結果

- 7日・14日という日数に強い根拠はない。運用しながら見直す
