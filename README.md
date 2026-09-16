# ウェーブレングス（協力モード）

ボードゲーム「ウェーブレングス」の協力モードを、1台の端末を回して遊ぶ Web アプリにしたもの。
授業・レクで生徒がスマホで使う前提。サーバー無し・ビルド無し・完全オフラインで動く。

- 対戦モード・左右当てフェイズは作らない（協力モードのみ）
- お題カードと達成度メッセージは原作を流用せず、すべて独自文
- ライトテーマのみ（ダークテーマは作らない）

---

## 現在の状況（2026-09-15）

**Opus フェーズ完了。ここから Sonnet に引き継ぐ。** 通しプレイは可能。

| | 状態 |
|---|---|
| ルールエンジン `js/game-logic.js` | ✅ 完了・テスト 36 件通過 |
| ダイヤル `js/dial.js`（ドラッグ・スライダー・公開表示） | ✅ 完了 |
| 画面・状態機械 `js/app.js` + `index.html` | ✅ 完了（7画面、設定UI、localStorage 復帰） |
| デザイントークン `css/tokens.css`（hallmark / Coral） | ✅ 完了 |
| お題 `data/prompts.js` | ⚠️ 動作確認用 10 枚のみ |
| `rules.html` | ❌ 未作成（設定画面からリンク済み） |
| README 完成・GitHub 公開・メモリ | ❌ 未 |

---

## Sonnet への引き継ぎ

### 残タスク（この順で）
1. **`data/prompts.js` を 50 枚（100 組）に拡充。** 形式は既存の 10 枚と同じ `{ a: {left, right}, b: {left, right} }`。
   生徒向け・一般向けの対比を中心に、情報・商業の教科ネタを少し混ぜる。1行1枚で書き、原作カードの文面は使わない。
2. **`rules.html` を作る。** `index.html` の「ルールを読む」からリンク済み。内容は「遊び方（手渡しの流れ）」「得点」「ヒントのコツ（数字・程度の言葉を使わない、固有名詞がよい、短く）」「設定項目の説明（プリセット／ラウンド数／ゾーンの広さ／点数／カード追加／ヒント表示）」。
   見た目は `tests.html` と同じく `css/tokens.css` + `css/style.css` を読み込み、`.title` `.card` `.btn` を使う。
3. **この README を完成させる**（下の「遊び方」「お題の追加」「ファイル構成」は書いてある。「公開 URL」を追記する）。
4. **GitHub 公開。** `git init` → `gh repo create mkt918/wavelength --public --source . --push` → Pages を `main` / `/ (root)` で有効化（`gh api -X POST repos/mkt918/wavelength/pages -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"`）。ビルド不要なので workflow は要らない。
5. **メモリ**: `C:\Users\nagoy\.claude\projects\C--antigravity-public-00---\memory\` に `project_wavelength.md` を1件追加し、`MEMORY.md` に1行。

### 守ってほしい設計上の約束
- **ルールは `js/game-logic.js` だけに置く。** DOM・localStorage・`Math.random` に依存しない純粋関数。乱数は引数 `rng` で受け取る。状態は書き換えず新しいオブジェクトを返す。
- **ルールを変えたら `js/tests.js` にテストを足す。** `node js/tests.js` または `tests.html` を開いて全件 PASS を確認してから報告する。
- **色・フォントは `css/tokens.css` の変数経由のみ。** 生の色値を `style.css` や HTML に書かない。ダーク対応（`prefers-color-scheme`）は入れない。
- **`data/prompts.js` は JS のまま**（JSON にしない）。`file://` で開いたとき `fetch` が失敗するため。
- 画面は `index.html` の `<section data-screen="...">` を `hidden` で切り替える方式。新しい画面を足すなら `app.js` の `renderers[画面名]` を追加する。
- 動作確認は `C:\antigravity\public\00_作業\.claude\launch.json` の `wavelength` 設定（`python -m http.server 8765`）でブラウザから開ける。`file://` でも動く。

### 既知の仮決め
- ゾーン角度の既定 **7°** は原作の実測値ではない目安。設定画面のスライダーで 4〜14° に変えられる。
- 達成度メッセージは「7ラウンド×3点＝21点満点」の公式区分を、満点に対する割合に一般化して判定している（`achievement(total, baseMax)`）。

---

## 遊び方

1. **設定画面** でプレイヤー名（任意）とルールを決めて「はじめる」
   - プリセット: 公式 / かんたん / むずかしい。「くわしく設定する」でスライダー・トグルから個別に変更できる（変更すると「カスタム」表示になる）
2. **出題者に端末を渡す** → 出題者はお題の表裏どちらかを選び、ターゲットの位置を見てヒントを考える
3. ヒントを入力（または口頭で伝えて）「画面を隠す」
4. **チームに端末を渡す** → ダイヤルをドラッグかスライダーで合わせて「決定」
5. ターゲットが公開され得点。中央に当たるとカードが1枚追加される（設定でオフにできる）
6. カードがなくなったら終了。合計点と達成度メッセージが出る

得点ゾーンは 5 分割で、既定は `2-3-3-3-2` 点（中央 3 点）。ゾーン外は 0 点。

進行中のゲームは localStorage に保存されるので、うっかりリロードしても同じ画面に戻る。上部バーの「中断」で最初に戻れる。

## お題の追加

`data/prompts.js` を直接編集する。1枚のカードに表（a）と裏（b）の2面がある。

```js
{ a: { left: '熱い', right: '冷たい' }, b: { left: '朝にすること', right: '夜にすること' } },
```

`left` がダイヤルの左端（0°）、`right` が右端（180°）。

## ローカルで動かす

`index.html` をダブルクリックで開くだけで動く（Web フォント・外部ライブラリ無し）。
テストは `tests.html` を開くか、次を実行する。

```bash
node js/tests.js
```

## ファイル構成

```
index.html          画面（7画面を1枚に。data-screen で切替）
rules.html          ルール説明（Sonnet フェーズで作成）
tests.html          ブラウザで開くだけで走る自己検証
css/
  tokens.css        デザイントークン（hallmark / Coral / ライトのみ）
  style.css         画面のスタイル
js/
  game-logic.js     ルールエンジン（純粋関数）
  dial.js           半円ダイヤルの SVG 描画・ドラッグ操作
  app.js            状態機械・DOM 制御・localStorage
  tests.js          game-logic のテスト（ブラウザ / node 両対応）
data/
  prompts.js        お題カード
.hallmark/log.json  hallmark の履歴
```

## 今後決めること
- 対戦モード（左脳／右脳チーム・左右当て・10点先取）を足すかどうか。足すなら `game-logic.js` に別の state 型を追加し、画面を増やす
- ゾーン角度の既定値（原作を実測できれば合わせる）
- 高校生向けにお題の難易度・傾向を調整する（実際に使ってみてから）
