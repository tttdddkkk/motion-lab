@README.md

## 作業手順

- 判断の経緯は `docs/adr/` にある。見送った案を再導入する前に確認する。判断を変えたら ADR を追加する
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

## レビュー方針

PR では `.github/workflows/claude-code-review.yml` が Claude によるレビューを行う。このリポジトリの主産物はモーション定義（`motions/`）とビューア（`index.html`）であり、レビューの主対象もそこに置く。

### 出力

- レビューコメントはすべて日本語で書く
- 事実（コードから確認できること）と推測を区別し、推測を断定しない。挙動に関する指摘には `file:line` を引用する

### 評価レベル

すべての指摘コメントは、本文の先頭に次のいずれかのラベルを置く。ラベルの無いコメントは投稿しない。

**🔴 CRITICAL** — マージ前に必ず直すもの。

- モーションの `setup` / `run` の誤り。`run` の Promise が解決しない、アニメーション終了後に要素やスタイルが残る、連続再生で状態が壊れる
- 「動きを減らす」版の欠落、またはその版で transform や clip-path を使っている
- `code.css` / `code.waapi` / `code.reduced` の表示用コードが `setup` の実装と食い違っている（時間・イージング・キーフレーム）。テストでは検出できないため、レビューで確認する
- `MOTIONS` に追加した id に対応するストーリーがない
- ビューアが壊れる変更。`motions/motions.js` / `motions/motions.css` の読み込み、一覧・再生・速度・コード表示が動かなくなる
- ワークフローや設定に秘密情報が含まれる、または Storybook の `disableTelemetry` を外している

**🟡 WARNING** — 動作はするが問題が起きうるもの。

- エラー処理の欠落、異常系で黙って不正な表示になる経路
- アクセシビリティの低下（キーボード操作、`aria-*`、コントラスト）
- `docs/adr/` にある判断と矛盾する変更で、新しい ADR が追加されていない
- README や CLAUDE.md の記述と実際の挙動の乖離

**🔵 INFO** — 任意の改善提案。表現・命名・構成の好み。最大5件まで。

### マージ判定

🔴 CRITICAL が1件でもあればマージ要件を満たさない。🟡 WARNING と 🔵 INFO はマージを妨げない。

### 指摘しない

- `package-lock.json`
- 変更されていない箇所。この PR で触れていないコードの既存の問題は対象外とする

## PR 作成後の流れ

1. CI（`test` ジョブ: `npm test` と `npm run build-storybook`）の結果を確認する。失敗していたら原因を調べて直す
2. Netlify の Deploy Preview（`deploy-preview-<PR番号>--<サイト名>.netlify.app`）が発行されたら、URL を PR 本文に記載する。ビューアのプレビューであり、Storybook は含まれない
3. 作業者に報告する

### 報告の形式

- 変更点を短く書く
- 確認してほしい画面と URL（プレビューURL + 見てほしい操作）を明記する
- 要確認の点があれば「要確認」として書く

### やってはいけないこと

- テストを消す・スキップして通す
- CI やルールセットの設定を無断で緩める
