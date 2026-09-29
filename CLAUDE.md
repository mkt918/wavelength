# ウェーブレングス（協力モード）— Claude への指示

1台の端末を回して遊ぶボードゲームの Web アプリ。プレーンHTML/CSS/JS（ビルド不要）、GitHub Pages で公開。
概要・遊び方・ファイル構成は `README.md`。

## 作業の記録（save / load）

- 会話のまとめは **`.claude/summaries/YYYY-MM-DD_見出し.md`** に置く（`.gitignore` 済み。公開されない）。
- 汎用フォーマット（一言・作業概要・決めたこと・現在の状態・次にやること・保留中の判断・参照ファイル）で書く。
- README の「現在の状況」表は機能の完了トラッカー用。会話ログの置き場にしない（フェーズが完了したときだけ更新する）。
- `00_作業` の「まとめ.md＋_INDEX.md」は単発タスク用なので、この製品では使わない。
- 経緯の要約は `memory/project_wavelength.md` にもある。

## 守ること

- ルールは `js/game-logic.js` だけに置く。DOM・localStorage・`Math.random` に依存しない純粋関数で、乱数は引数 `rng` で受け取る。
- ルールやデータ（`data/prompts.js`）を変えたら `node js/tests.js` で全件 PASS を確認してから報告する。
- 色・フォントは `css/tokens.css` の変数経由のみ。ダーク対応はしない（ライトのみ）。
- `data/prompts.js` は JS のまま（`file://` で開いても `fetch` 無しで読めるように）。各面に `ex`（お題の見本3つ）が必須。
- 用語: 出題者が言う言葉＝「お題」、両端のペア＝「ものさし」。旧称（ヒント／お題）に戻さない。内部名 `hintOnScreen` などは互換のため据え置き。
- `[hidden]` は全体で `display:none !important`。表示切替は `el.hidden` で行う。
- 日本語は `line-break: strict`（禁則処理）。全体に `overflow-wrap: anywhere` を掛けない。

## 動作確認

`C:\antigravity\public\00_作業\.claude\launch.json` の `wavelength`（`serve_nocache.py` が no-store で配信）。
素の `python -m http.server` はブラウザにキャッシュされて変更が反映されないことがある。
