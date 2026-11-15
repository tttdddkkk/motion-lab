---
name: after-pr
description: motion-lab で Pull Request を作成した直後の後処理。CI の結果確認、Netlify Deploy Preview の URL を PR 本文へ記載、作業者への報告までを行う。PR を作った・更新したあと、または「PR の状況を報告して」と頼まれたときに使う。PR を作る前のコミットや push だけの段階では使わない。
---

# PR 作成後の流れ

1. CI の `test` ジョブ（`npm test` と `npm run build-storybook`）の結果を確認する。失敗していたら原因を調べて直す。テストを消す・スキップして通さない
2. Netlify の Deploy Preview（`deploy-preview-<PR番号>--motion-lab-tttdddkkk.netlify.app`）が発行されたら、URL を PR 本文に記載する。ビューアのプレビューであり、Storybook は含まれない
3. 作業者に報告する

## 報告の形式

- 変更点を短く書く
- 確認してほしい画面と URL（プレビューURL + 見てほしい操作）を明記する。モーションを追加・変更したときは URL の末尾に `#<id>` を付けて、そのモーションを直接開く形にする（ADR 0011）
- 要確認の点があれば「要確認」として書く
