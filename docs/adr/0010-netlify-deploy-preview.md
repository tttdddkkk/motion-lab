# 0010: PR のプレビューに Netlify Deploy Preview を使う

- 状態: 採用
- 日付: 2026-11-14

## 背景

[ADR 0009](0009-branch-preview-and-ci-for-mobile.md) でブランチ別プレビュー環境＋CI を採用した。main への push は GitHub Pages に公開される（ADR 0006）ため、マージ前に PR 単位でビューアを確認する手段が別に要る。

## 決定

- Netlify の Deploy Preview を使う。ビューア（`index.html` / `motions/` / `robots.txt`）だけを `dist/` にコピーして配信する（`netlify.toml`）
- 本番の公開は引き続き GitHub Pages。Netlify の本番公開は使わない
- Storybook はプレビューしない。代わりに CI の `test` ジョブに `npm run build-storybook` を足し、ビルドが通ることだけ確認する。ジョブ名は変えない（ADR 0006 の必須チェック名を保つため）

## 検討した他の案

- Vercel / Cloudflare Pages: 機能は足りるが、ビルド設定をリポジトリ内で完結させやすい Netlify を選んだ
- リポジトリ全体の配信: `package.json` などビューアに不要なファイルまで公開されるため避けた
- lint / typecheck の CI 追加: 該当スクリプトがないため行わない

## 結果

- PR ごとにスマホで開ける URL が得られる
- プレビューは `noindex` だが、アクセス制限ではない（URL を知れば誰でも閲覧できる）
- CI の所要時間が `build-storybook` の分だけ延びる
- Netlify アカウント側の連携操作が作業者に必要
