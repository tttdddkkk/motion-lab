# 0009: PR のプレビューに Netlify Deploy Preview を使う

- 状態: 採用
- 日付: 2026-11-14

## 背景

main への push は GitHub Pages に公開される（ADR 0006）。作業者はスマホだけで作業し、ローカルでサーバーを立てられない。マージ前に PR 単位でビューアを実機で確認する手段が必要になった。

## 決定

- Netlify の Deploy Preview を使う。ビューア（`index.html` / `motions/` / `robots.txt`）だけを `dist/` にコピーして配信する（`netlify.toml`）
- 本番の公開は引き続き GitHub Pages。Netlify の本番公開は使わない
- Storybook はプレビューせず、CI で `build-storybook` が通ることだけ確認する

## 検討した他の案

- Vercel / Cloudflare Pages: 機能は足りるが、ビルド設定をリポジトリ内で完結させやすい Netlify を選んだ
- リポジトリ全体の配信: `package.json` などビューアに不要なファイルまで公開されるため避けた

## 結果

- PR ごとにスマホで開ける URL が得られる
- プレビューは `noindex` だが、アクセス制限ではない（URL を知れば誰でも閲覧できる）
- Netlify アカウント側の連携操作が作業者に必要
