# 0001: カタログ化に Storybook（html-vite）を使う

- 状態: 採用
- 日付: 2026-11-12

## 背景

モーションを増やすにあたり、振る舞いテスト・画面サイズの切り替え・周辺ツール（アドオン）を自作せずに使いたかった。ビューアは素の HTML / CSS / WAAPI で書かれており、React は使っていない。

## 決定

Storybook 10 の `@storybook/html-vite` を導入する。テストは `@storybook/addon-vitest` で、ストーリーの `play` 関数として書く。

## 検討した他の案

- Ladle: React 専用のため、モーションを React コンポーネントに書き直す必要がある
- 自作ビューアを Playwright で直接テストする（Storybook なし）: 構成は最も単純だが、Viewport やアドオンなどの周辺ツールが使えない

## 結果

- Node とビルド工程が必要になった（Node 20.19+ / 22.12+）
- 公式ドキュメントに html-vite のページがない（2026-11-12 時点で 404）。調べるときは web-components-vite のページを参考にする
