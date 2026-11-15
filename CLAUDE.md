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
- デモとコードはすべてオリジナルで作る。案件由来のコードや、外部サイトのデモ・コードは使わない

## モダン CSS を使うときの対応ブラウザ確認

CSS の新機能（新しいプロパティ・関数・at-rule・セレクタ、`animation-timeline`、`@starting-style`、`@property`、`linear()` など）は、ブラウザとバージョンによって未対応のことがある。ここのコードは利用者が自分の実装へコピーするため、ビューアで動くだけでは足りない。使う前に、次の手順で確認する。記憶や推測で「使える」と判断しない。

1. 使う機能を列挙する。`code.css` / `motions.css` / `compare.js` に出てくる新しめの機能をすべて対象にする
2. 対応状況を一次情報で調べる。MDN の Browser compatibility（BCD）、web.dev / MDN の Baseline、caniuse を使い、WebSearch / WebFetch で今の値を取る。調べた日付を控える
3. 各機能について、Chrome（Android）・Safari（iOS）・Firefox の対応開始バージョンと Baseline の区分（Widely available / Newly available / 対象外）を表にする。部分対応（一部の値だけ・フラグ付き・プレフィックス必須）は区別して書く
4. 判断する
   - Widely available: そのまま使う
   - Newly available: 使ってよいが、`@supports` か `CSS.supports()` で判定し、未対応時の代替（動きを減らす版に近い、フェードだけの表現など）を用意する。`compare-ui.js` の `clipSupported()` が先例
   - Baseline 外（一部ブラウザのみ）: ビューアの本体には入れない。入れる場合は `@supports` で囲み、未対応時にも壊れないことを確認したうえで、PR で「要確認」にする
5. 結果を残す。PR 本文に「機能 / 対応開始バージョン / Baseline 区分 / 調べた日 / 未対応時の挙動」を書く。`code.css` に貼るコードが `@supports` の代替を含むなら、`setup` の実装と手で合わせる（上の決まりと同じ）。判断が従来の方針（素の CSS で、ブラウザ差に頼らない）から外れるなら ADR を追加する
6. 判断に迷う機能（対応が Baseline の境目、バージョンの記述が情報源で食い違う、実機で確認できない）は、使わずに作業者へ確認する

対応ブラウザの下限は「Baseline Widely available」を既定とする。それより新しい機能を使うのは、上の手順で代替まで用意できたときだけ。

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
2. Netlify の Deploy Preview（`deploy-preview-<PR番号>--motion-lab-tttdddkkk.netlify.app`）が発行されたら、URL を PR 本文に記載する。ビューアのプレビューであり、Storybook は含まれない
3. 作業者に報告する

### 報告の形式

- 変更点を短く書く
- 確認してほしい画面と URL（プレビューURL + 見てほしい操作）を明記する。モーションを追加・変更したときは URL の末尾に `#<id>` を付けて、そのモーションを直接開く形にする（ADR 0011）
- 要確認の点があれば「要確認」として書く

### やってはいけないこと

- テストを消す・スキップして通す
- CI やルールセットの設定を無断で緩める
