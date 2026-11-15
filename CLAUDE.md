@README.md

## 作業手順

- 判断の経緯は `docs/adr/` にある。見送った案を再導入する前に確認する。判断を変えたら ADR を追加する
- 変更はブランチを切って PR にする。main に直接 push しない（GitHub のルールセットで拒否される。マージには CI の `test` 成功が必要）
- 作業を始める前に `git fetch origin main` を実行し、ブランチが main の最新から切られていることを確認する（クローンが古いことがある）。古ければ main を取り込んでから書き始める。モーションの追加は `motions.js` / `motions.css` / ストーリーの末尾に集まるため、古いまま作業すると他の PR と衝突しやすい
- ワークツリー（`claude -w` / `.claude/worktrees/`）では、最初に `npm ci` を実行する。`node_modules` は共有していない
- ビューアの動作確認は `file://` ではなくローカルサーバー経由で行う（ES Modules のため `file://` では読み込めない）
- コミット前に `npm test` を実行する。初回のみ `npx playwright install chromium` が必要

## コードからは読み取れない決まり

- `MOTIONS` の `code.css` / `code.waapi` / `code.reduced` は表示用の文字列。`setup` の実装を変えたら手で合わせる。テストでは検出できない
- すべてのモーションに「動きを減らす」版を用意する。その版では transform と clip-path を使わない（テストで強制している）
- デモとコードはすべてオリジナルで作る。案件由来のコードや、外部サイトのデモ・コードは使わない

## モダン CSS

コードは利用者が自分の実装へコピーする。新しめの CSS 機能を使う前に、対応ブラウザを調べる（スキル `check-css-browser-support`）。既定の下限は Baseline Widely available（ADR 0016）。

## 前提と判断基準

背景と理由は `docs/philosophy.md` を参照する。

- ビューア（`index.html` と `motions/`）に、外部ライブラリとビルド工程を入れない。素の HTML（CSS / WAAPI 中心）で作る。Storybook などの開発ツールはビューアの外側に置く
- 自分で検証できて被害が小さいものは自前で作る。検証が難しく被害が大きいもの（暗号、認証、サニタイズ、日付・タイムゾーン、ブラウザ差、IME）は、ライブラリを検討する
- バリアントの数に上限はない。ただし、軸ごとのグループ化とタグでの絞り込みを維持する。1回の並べ比較は4案前後に収め、多い軸はグループを分ける
- バリアントの追加が、データ定義への追記だけで済む構造を保つ。手順を増やさない
- 新しいバリアントには、ID・印象ワードのタグ・パラメータ値・使いどころの一言を付ける

## 落とし穴

- main への push は、そのまま GitHub Pages に公開される
- `storybook` と `@storybook/*`、`vitest` と `@vitest/*` は、それぞれバージョンを揃える。`@vitest/browser-playwright` は vitest の完全一致を要求する。Dependabot もこの単位でまとめている
- Storybook の利用統計は `.storybook/main.js` の `disableTelemetry` で無効にしている。外さない
- 公式ドキュメントには `html-vite` のページがない（404）。調べるときは web-components-vite のページを参考にする

## レビュー方針

PR のレビュー（`.github/workflows/claude-code-review.yml`）の方針・評価レベル・マージ判定は [docs/review-policy.md](docs/review-policy.md) にある。レビュー方針を変えるときはそこを直す。

## PR 作成後

CI の確認、Deploy Preview の URL 記載、作業者への報告はスキル `after-pr` に従う。

## やってはいけないこと

- テストを消す・スキップして通す
- CI やルールセットの設定を無断で緩める
