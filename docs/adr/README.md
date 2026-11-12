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
