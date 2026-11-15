# Architecture Decision Records

このリポジトリで行った判断と、その理由・検討した他の案を残す。1判断1ファイル。

- 判断を変えるときは既存ファイルを書き換えず、新しい ADR を追加し、古い方の「状態」を「置き換え（00XX）」にする
- 書式は [template.md](template.md) を使う

| No. | 判断 | 状態 |
| --- | --- | --- |
| [0001](0001-storybook-for-catalog.md) | カタログ化に Storybook（html-vite）を使う | 採用 |
| [0002](0002-keep-viewer-share-motion-data.md) | 自作ビューアを残し、モーション定義を1か所にまとめる | 採用 |
| [0003](0003-behavior-tests-only.md) | テストは当面、振る舞いテストだけにする | 採用 |
| [0004](0004-dependabot-for-dependency-updates.md) | 依存更新に Dependabot を使い、公開直後の版を待つ | 採用 |
| [0005](0005-no-shared-node-modules-in-worktrees.md) | ワークツリーで `node_modules` を共有しない | 採用 |
| [0006](0006-pr-only-main.md) | main への直接 push を禁止し、PR と CI 成功を必須にする | 採用 |
| [0007](0007-disable-storybook-telemetry.md) | Storybook の利用統計を無効にする | 採用 |
| [0008](0008-comment-flow-patent-constraints.md) | 流れる文字のモーションは、映像と重ならない別枠で作る | 採用 |
| [0009](0009-branch-preview-and-ci-for-mobile.md) | 出先（スマホ）での開発確認を「ブランチ別プレビュー環境＋CI」で行う | 採用 |
| [0010](0010-netlify-deploy-preview.md) | PR のプレビューに Netlify Deploy Preview を使う | 採用 |
| [0011](0011-viewer-open-motion-by-url-hash.md) | ビューアは URL の `#<id>` で最初に開くモーションを指定できるようにする | 採用 |
| [0012](0012-comparison-view-separate-from-motions.md) | 認識合わせ用の「差分比較」ビューを、MOTIONS とは別のデータで持つ | 採用 |
| [0013](0013-comment-flow-vertical.md) | 流れる文字は、横だけでなく縦（下→上）も作る | 採用 |
| [0014](0014-notification-category.md) | 「通知」カテゴリを作り、チャットはコメントに含める | 採用 |
| [0015](0015-manual-netlify-deploy.md) | Netlify の本番デプロイを、GitHub Actions の手動実行だけにする | 採用 |
| [0016](0016-check-browser-support-for-modern-css.md) | モダン CSS は、対応ブラウザを調べてから使う | 採用 |
| [0017](0017-text-category.md) | 「テキスト」カテゴリを作り、1つの文章の見せ方を集める | 採用 |
