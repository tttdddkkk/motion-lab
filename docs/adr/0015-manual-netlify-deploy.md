# 0015: Netlify の本番デプロイを、GitHub Actions の手動実行だけにする

- 状態: 採用
- 日付: 2026-11-15

## 背景

- Netlify はクレジット制で、本番デプロイ1回に15クレジットかかる。月300クレジットのうち、短期間で半分を使った
- Netlify の Git 連携による自動ビルドは、push のたびに消費する。デプロイ回数を自分で決められない
- 公開URLは GitHub Pages（ADR 0006 / 0010）。Netlify の本番サイトは、必要なときにだけ更新できればよい

## 決定

- `.github/workflows/deploy-netlify.yml` を追加する。トリガーは `workflow_dispatch` のみで、「確認した」のチェックが無いと失敗する。main 以外のブランチからは実行できない
- ビルドは不要な静的サイトのため、`netlify.toml` の `[build] command` と同じコピー処理で `dist/` を作り、Netlify CLI（版を固定）で `--prod` デプロイする
- 認証情報（`NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID`）は GitHub の Secrets に置く
- `netlify.toml` の `[context.production]` に `ignore = "exit 0"` を書き、main への push による本番ビルドだけをスキップする。PR の Deploy Preview は context が別のため、これまでどおり発行される（ADR 0010 は維持）
- Netlify 画面での自動ビルド停止は行わない

## 検討した他の案

- Netlify 画面で Git からの自動ビルドを止める: Deploy Preview も止まる可能性があるため避けた
- 本番デプロイをやめる: 今回は、必要なときに更新できる手段を残す

## 結果

- 本番デプロイの回数を、自分の実行回数に等しくできる
- PR の Deploy Preview は維持される
- ワークフローの `dist/` 作成処理は `netlify.toml` と二重管理になる。片方を変えたらもう片方も合わせる
