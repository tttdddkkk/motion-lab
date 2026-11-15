---
name: check-css-browser-support
description: モーションやビューアに新しめの CSS 機能（animation-timeline、@starting-style、@property、linear()、view-transition、:has()、color-mix() など、対応ブラウザが限られるもの）を使う前に、対応バージョンを調べて採否を決める手順。`motions/` や `index.html` の CSS、`code.css` に貼る表示用コードで、新しいプロパティ・関数・at-rule・セレクタを書く／変えるときに使う。transition・animation・opacity など広く対応済みの基本機能だけの変更では使わない。
---

# モダン CSS の対応ブラウザ確認

コードは利用者が自分の実装へコピーするため、ビューアで動くだけでは足りない。記憶で「使える」と判断せず、一次情報で調べてから使う。背景は `docs/adr/0016-check-browser-support-for-modern-css.md`。

## 手順

1. 使う機能を列挙する。`code.css` / `motions.css` / `compare.js` に出てくる新しめの機能をすべて対象にする
2. MDN の Browser compatibility（BCD）、Baseline（web.dev / MDN）、caniuse を、WebSearch / WebFetch で今の値を取る。調べた日付を控える
3. 各機能について、Chrome（Android）・Safari（iOS）・Firefox の対応開始バージョンと Baseline 区分（Widely available / Newly available / 対象外）を表にする。部分対応（一部の値だけ・フラグ付き・プレフィックス必須）は区別して書く
4. 区分で判断する。既定の下限は Baseline Widely available
   - Widely available: そのまま使う
   - Newly available: `@supports` か `CSS.supports()` で判定し、代替（フェードだけの表現など）を用意したときだけ使う。先例は `compare-ui.js` の `clipSupported()`
   - Baseline 外: ビューア本体には入れない。入れる場合は `@supports` で囲み、未対応時に壊れないことを確認して、PR で「要確認」にする
5. `code.css` に貼るコードが `@supports` の代替を含むなら、`setup` の実装と手で合わせる（テストでは検出できない）
6. PR 本文に「機能 / Chrome・Safari(iOS)・Firefox の対応開始バージョン / Baseline 区分 / 調べた日 / 未対応時の挙動」を書く
7. 判断に迷うもの（Baseline の境目、情報源の食い違い、実機で確認できない）は使わずに作業者へ確認する。従来の方針（素の CSS で、ブラウザ差に頼らない）から外れる判断は ADR に残す
