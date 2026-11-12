@README.md

## 作業手順

- 変更はブランチを切って PR にする。main に直接 push しない（GitHub のルールセットで拒否される。マージには CI の `test` 成功が必要）
- ワークツリー（`claude -w` / `.claude/worktrees/`）では、最初に `npm ci` を実行する。`node_modules` は共有していない
- ビューアの動作確認は `file://` ではなくローカルサーバー経由で行う（ES Modules のため `file://` では読み込めない）
- コミット前に `npm test` を実行する。初回のみ `npx playwright install chromium` が必要

## コードからは読み取れない決まり

- `MOTIONS` の `code.css` / `code.waapi` / `code.reduced` は表示用の文字列。`setup` の実装を変えたら手で合わせる。テストでは検出できない
- すべてのモーションに「動きを減らす」版を用意する。その版では transform と clip-path を使わない（テストで強制している）
- デモとコードはすべてオリジナルで作る

## 落とし穴

- main への push は、そのまま GitHub Pages に公開される
- `storybook` と `@storybook/*`、`vitest` と `@vitest/*` は、それぞれバージョンを揃える。`@vitest/browser-playwright` は vitest の完全一致を要求する。Dependabot もこの単位でまとめている
- Storybook の利用統計は `.storybook/main.js` の `disableTelemetry` で無効にしている。外さない
- 公式ドキュメントには `html-vite` のページがない（404）。調べるときは web-components-vite のページを参考にする
