# 0018: JSDoc と tsc で型を検査する（ビューアは JavaScript のまま）

- 状態: 採用
- 日付: 2026-11-16

## 背景

ビューア（`index.html` と `motions/*.js`）はブラウザが ES Modules として直接読み込む。ビルド工程を入れない方針（ADR 0002、README）のため、TypeScript（`.ts`）には書き換えられない。

一方、`MOTIONS` の各要素（`id / cat / name / feel / use / ms / easing / desc / setup / code`）や、差分比較のバリアント（`mode` と `params` の組）は形が決まっていて、綴り違いや定義漏れが起きやすい。これまでは `tests/` の一部でしか検出できず、テストを書いていない形の崩れには気づけなかった。

## 決定

- 型は JSDoc で書く。型定義は `motions/types.js`（実行時には何も export しない）に置く
- `npm run typecheck`（`tsc -p .`、`noEmit`）で検査し、CI の `test` ジョブで `npm test` の前に実行する
- 検査対象は `motions/`、`stories/`、`tests/`。`tsconfig.json` は `checkJs` と `strict` を有効にする
- 導入時は `noImplicitAny` を無効にする。引数の型注釈が無い関数は `any` として扱い、検査の対象になるのは、型を付けた部分（`Motion` / `Ctx` / `CompareGroup` など）と、そこから推論できる部分
- DOM から要素を取るときは `q(root, selector)` / `qa(root, selector)`（`motions.js`）を使う。見つからなければ、探したセレクタ名つきの例外にする
- `.ts` への書き換えはしない。ビューアの実行物は変わらない

## 検討した他の案

- ビューアを `.ts` にして、ビルドで `.js` を出す: ビルド工程を入れない方針（ADR 0002）と合わない。型検査の目的は JSDoc で足りる
- `.ts` にするのはテストとストーリーだけにする: 型が付くのは import 先に限られ、ビューア側の検査にならない
- 最初から `noImplicitAny` を有効にする: 導入時に約 160 件の型エラーが出る。DOM を触るコードの引数への注釈が大半で、形の食い違いを見つける効果が薄いまま、PR が大きくなる
- `index.html` のスクリプトも検査対象にする: HTML 内のスクリプトは `tsc` が読めない。`viewer.js` として外出しした時点で対象に加える

## 結果

- `MOTIONS` と差分比較のデータの綴り違い・必須フィールドの欠落を、`npm run typecheck` が検出する
- `typescript` が devDependency に増える（Dependabot の `minor-and-patch` で更新される）
- `noImplicitAny` を有効にするまでは、注釈の無い引数は検査されない。段階的に有効化するか、別の ADR で判断する
- `index.html` のインラインスクリプトは、引き続き検査の対象外（2026-11-16 追記: `motions/viewer.js` に外出しし、検査の対象に加えた。判断は変えていない）
- モーションの要素の取得に失敗したとき、`null` 参照ではなく「要素が見つからない: <セレクタ>」の例外になる
