# Motion Lab

自分用のモーションライブラリ（ボタンエフェクト・画面遷移・コメント・通知・展開・テキスト）。認識合わせのための、動きの実物集です。

- ビューア: 素の HTML / CSS / WAAPI。ビルド工程なし
- カタログとテスト: Storybook（`@storybook/html-vite`）+ `@storybook/addon-vitest`（Node 20.19+ / 22.12+）
- 方針: すべてオリジナルのデモとコードで構成する

## なぜ作るか

見た目の挙動は、口頭では合っているつもりでもすれ違いやすい。実物を見せれば認識の食い違いが減り、指示も ID と数値で済む。AI が実装を安く出せる時代は、「何を作るか」の認識合わせがボトルネックになるため、その共通言語と辞書として使う。

実装を配布するライブラリではなく、採用した値をコピーして、各自の実装や指示書に貼る道具。ビューアは外部ライブラリを前提にしない。

外部ライブラリの導入判断と、Motion Lab の位置づけの詳細は [docs/philosophy.md](docs/philosophy.md) を参照。

## 構成

- `motions/motions.js` … モーション定義（`MOTIONS` 配列）。ビューアと Storybook の両方がここを読む
- `motions/motions.css` … 共有トークンとデモ用スタイル
- `index.html` … スマホ向けビューア。「差分比較」への切り替え（`#compare`）を含む
- `motions/compare.js` … 差分比較のデータ（バリアント定義とトラック生成）。`MOTIONS` とは別で、ストーリーは不要。`motions/compare-ui.js` が描画する（ADR 0012）
- `stories/motions.stories.js` … 1モーション1行のストーリーと振る舞いテスト（`play`）
- `tests/` … `MOTIONS` とストーリーの対応漏れ、差分比較データの整合を検出するテスト

## 使い方

- ビューア: ES Modules を使うため `file://` では開けない。GitHub Pages か、`npx serve` などのローカルサーバー経由で開く
- Storybook: `npm install` → `npm run storybook`
- テスト: `npm test`（初回のみ `npx playwright install chromium`）

## モーションを追加する

1. `motions/motions.js` の `MOTIONS` 配列にオブジェクトを1つ足す（`id / cat / name / feel / use / ms / easing / desc / setup / code{css, waapi, reduced}`）
2. `stories/motions.stories.js` の末尾に `export const Xxx = story('<id>');` を1行足す（忘れると `npm test` が失敗する）

## 開発環境設定

| 設定 | ツール | 用途 |
| --- | --- | --- |
| CI | GitHub Actions（`.github/workflows/ci.yml`） | push / PR 時に `npm ci` → `npm test` → `npm run build-storybook` |
| 依存更新 | Dependabot（`.github/dependabot.yml`） | 毎週月曜に npm と Actions の更新 PR。公開から7日（major は14日）経ったバージョンだけ取り込む |
| 脆弱性対応 | Dependabot alerts / security updates | GitHub のリポジトリ設定で有効化する |
| プレビュー | Netlify Deploy Preview（`netlify.toml`） | PR ごとにビューアのプレビューURLを発行（ADR 0009 / 0010） |
| 本番デプロイ（Netlify） | GitHub Actions（`.github/workflows/deploy-netlify.yml`） | 手動実行（`workflow_dispatch`）のみ。クレジット消費を自分で制御する（ADR 0015） |
| Node | `.node-version` | CI とローカルで揃える |

### あえて入れていないもの

判断の経緯は [docs/adr/](docs/adr/) を参照。

- Renovate: 依存が少なく、Dependabot で足りるため（ADR 0004）
- 更新 PR の自動マージ: 未導入。マージ前チェックの必須化は済んでいる（ADR 0004 / 0006）
- Storybook の利用統計: `.storybook/main.js` の `disableTelemetry` で無効化している

## 公開URL

https://tttdddkkk.github.io/motion-lab/

## 検索エンジンについて

`<meta name="robots" content="noindex,nofollow">` と `robots.txt` で検索結果に載りにくくしている。アクセス制限ではないため、URL を知っていれば誰でも閲覧できる。
