# Motion Lab

自分用のモーションライブラリ（ボタンエフェクト・画面遷移）。

- ビューア: 素の HTML / CSS / WAAPI。ビルド工程なし
- カタログとテスト: Storybook（`@storybook/html-vite`）+ `@storybook/addon-vitest`（Node 20.19+ / 22.12+）
- 方針: すべてオリジナルのデモとコードで構成する

## 構成

- `motions/motions.js` … モーション定義（`MOTIONS` 配列）。ビューアと Storybook の両方がここを読む
- `motions/motions.css` … 共有トークンとデモ用スタイル
- `index.html` … スマホ向けビューア
- `stories/motions.stories.js` … 1モーション1行のストーリーと振る舞いテスト（`play`）
- `tests/` … `MOTIONS` とストーリーの対応漏れを検出するテスト

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
| CI | GitHub Actions（`.github/workflows/ci.yml`） | push / PR 時に `npm ci` → `npm test` |
| 依存更新 | Dependabot（`.github/dependabot.yml`） | 毎週月曜に npm と Actions の更新 PR。公開から7日（major は14日）経ったバージョンだけ取り込む |
| 脆弱性対応 | Dependabot alerts / security updates | GitHub のリポジトリ設定で有効化する |
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
