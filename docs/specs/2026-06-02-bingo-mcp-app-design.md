# 設計書: bingo_mcp（MCP Apps で遊べるビンゴ）

- 日付: 2026-06-02
- バージョン: **v2**（レビュー指摘と ext-apps 一次仕様を反映）
- ステータス: ドラフト（実装着手前のレビュー待ち）
- 対象リポジトリ: `ROhta/bingo_mcp`（本リポジトリ）
- 再利用元: `ROhta/bingo`（無改変・git submodule で参照）

## 0. v2 での変更点（レビュー反映）

v1 は「サーバーは状態を持たず、全状態をウィジェットが保持」と断定していたが、ext-apps 仕様
（2026-01-26, `specification/2026-01-26/apps.mdx`）の一次確認で以下が判明し、根幹を改訂した。

- View は**ターンごとに破棄・再生成**され（`ui/resource-teardown`）、**状態永続化 API は未定義**（"State persistence and restoration" は Future Considerations 止まり）。→ ウィジェット単独ではターン跨ぎで状態が消える。
- UIリソースの `mimeType` は **MUST `text/html;profile=mcp-app`**（v1 の `text/html` は誤り）。
- 静的リソースは CSP `resourceDomains` 宣言が必要。未宣言オリジンはブロック（MUST）。

主な改訂:
1. 状態権威を **C案（サーバーは平データのチェックポイント、ウィジェットは各 render で再シードして `NumberList` を動かす）** に確定（§2/§4/§9）。
2. `mimeType` を `text/html;profile=mcp-app` に訂正（§7）。
3. §13 を「(A) 名称・手順確認」と「(B) 着手前スパイク必須の能力検証」に分離し、**Phase 0 スパイク**を新設（§12/§13）。
4. `card.ts` の型契約を明文化（§9b）。`draw.ts` の非純粋性とテスト方針を分離（§5/§11）。
5. 抽選枯渇・複数/再オープン・`start_bingo` の resume/fresh セマンティクスを定義（§7/§9）。
6. mp3 の data: URL インライン化、tsconfig paths + バンドラ alias、default import を明記（§6）。

## 1. 目的

Claude のグラフィカルクライアント（claude.ai web / Claude Desktop）のチャット内で、
「ビンゴやりたい」と言うと **MCP Apps のウィジェット**としてビンゴ盤面が描画され、その場で遊べるようにする。
既存の `ROhta/bingo`（パーティ向けビンゴ抽選機）のソースを**改変せず呼び出して**再利用する。

## 2. 確定した意思決定

| 論点 | 決定 | 根拠 |
|---|---|---|
| 舞台 | claude.ai web / Claude Desktop（グラフィカルClaude） | MCP Apps の iframe はターミナルの Claude Code では描画されない |
| スコープ | 抽選機の再現 ＋ 5×5 ビンゴカード（マーク・リーチ/ビンゴ判定）。単一盤面のみ | ユーザー選択。マルチプレイ・複数同時盤面は対象外 |
| デプロイ | ローカル（stdio）先行 → リモート（HTTP Connector）共有も可能な両対応 | ユーザー選択 |
| 設計の軸 | **既存ソースの忠実な再利用を優先**（`NumberList` をウィジェットで無改変利用） | ユーザー選択 |
| 状態権威 | **C案: サーバーが平データのチェックポイントを保持／ウィジェットが各 render で再シードして `NumberList` を実行し、結果をサーバーへ同期** | View は毎ターン破棄・永続化 API 無し（仕様確認）。忠実な再利用とターン跨ぎ耐性の両立 |
| 抽選(RNG)の権威 | **常にウィジェットの `NumberList`**。サーバーは抽選しない（平データを預かるのみ） | RNG 経路を一本化し、サーバー側のロジック重複を避ける |
| 再利用元の取り込み | git submodule（`vendor/bingo`）。無改変、`--remote` で上流追従 | `bingo` は npm パッケージ化されておらず import 実体が無い（§3.1） |

## 3. 既存ソース（`ROhta/bingo`）の調査結果と再利用方針

### 3.1 調査で判明した事実（一次情報で確認済み）

- `package.json`: `name: "bingo-machine"`, `main: "src/index.html"`、`exports`/`types`/`module` 無し、npm 未公開。
- `tsc -b` のコンパイル出力 `src/js/` は**コミットされていない**（`src/` 配下は `index.html` / `materials/` / `ts/` のみ）。→ npm/git 依存では import 実体が無い。
- `src/ts/numberList.ts` は `export default class NumberList`。`remainList`/`historyList`/`resetLists` が `localStorage`（キー: `remainNumberList` / `historyNumberList`）を直接読み書き（ブラウザ専用）。`generateRandomNumber(n)` は `crypto.getRandomValues` ベースの乱数インデックス生成（Node でも可）。
- **抽選フロー**（remain から引いて history へ移す）は `NumberList` ではなく DOM 結合の `domManipulation.ts` 側にあり、再利用不可。
- ライセンスは **GPL-3.0-or-later**。本リポジトリも GPL-3.0（LICENSE 同梱済み）で整合。

### 3.2 再利用方針（何を・どこで）

| 要素 | 置き場所 | 出所 |
|---|---|---|
| `NumberList`（範囲[1,75]/検証/localStorage履歴/乱数） | ウィジェット（iframe＝ブラウザ環境） | **submodule のソースを無改変で import**（忠実な再利用） |
| 抽選フロー（remain→history） | ウィジェット `draw.ts` | 新規（`NumberList` の公開 API に乗せる薄い順序ロジック） |
| 5×5 カード生成・マーク・リーチ/ビンゴ判定 | ウィジェット `card.ts` | **100%新規**（純関数、§9b に契約） |
| 演出（ドラムロール/シンバル） | ウィジェット | submodule の `materials/*.mp3` を **data: URL でインライン化** |
| 平データのチェックポイント保持・UIリソース配信・ツール | サーバー | 新規（薄型・抽選はしない） |

> 再利用の実体は `NumberList` 本体のみであり、過大な再利用主張はしない。
> `NumberList` を**ブラウザ環境（iframe）でそのまま動かす**ことで localStorage シムを排除する。
> サーバーが保持するのは `NumberList` インスタンスではなく、その状態を表す**平データ**（後述）。

## 4. アーキテクチャ

ウィジェットが「遊ぶ面」、サーバーが「ターンを跨ぐチェックポイント」。抽選はウィジェットの `NumberList` のみ。

```
┌──────────── Claude (web / desktop) ─────────────┐
│ チャット「ビンゴやりたい」→ start_bingo            │
│        ▼  tool-result(structuredContent=state)    │
│  ┌─ iframe View: ui://bingo/board (毎ターン再生成) ┐│
│  │ ① 受領した state で localStorage を再シード     ││
│  │ ② NumberList(submodule) を生成して抽選          ││ ← localStorage はセッション内ネイティブ
│  │ ③ card.ts で判定 / 演出(inline mp3)             ││
│  │ ④ 新 state をサーバーへ sync(tools/call)        ││
│  │ ⑤ ui/update-model-context でモデルへ要約        ││
│  └───────────────┬───────────▲──────────────────┘│
│   tools/call(sync)│           │tool-result/tool-input │
└───────────────────┼───────────┼────────────────────┘
                    ▼           │
        ┌─ MCP server (薄型 / stdio・HTTP両対応) ─────┐
        │ state: Map<sessionId, GameState> (平データ・in-memory) │
        │   GameState = {remain[], history[], card}            │
        │ resource: ui://bingo/board (widget バンドル)          │
        │ tools: start_bingo / draw_number / sync_state /       │
        │        reset_game                                     │
        │ ※ 抽選(RNG)はしない。state の保管・受け渡しのみ        │
        └───────────────────────────────────────────────────────┘
```

## 5. コンポーネントと責務

| 単位 | 責務 | 依存 | 純粋性/テスト |
|---|---|---|---|
| `vendor/bingo`（submodule） | 既存ビンゴ抽選機ソース（無改変） | なし | 上流を信頼＋取り込みスモーク |
| `src/widget/card.ts` | カード生成・マーク・リーチ/ビンゴ判定 | **なし（純関数）** | Node でユニットテスト |
| `src/widget/draw.ts` | 抽選フロー（remain→history の順序ロジック）＋ `NumberList` への副作用呼び出し | `NumberList`（=`localStorage`） | **純粋でない**。順序ロジックを純関数化し、`NumberList` 呼び出しは薄いアダプタに隔離。純粋部のみ Node テスト、結合は jsdom/実 iframe |
| `src/widget/hydrate.ts` | サーバー state → localStorage 再シード／現 state 抽出 | `localStorage` | jsdom テスト |
| `src/widget/main.ts` + `bridge.ts` | 描画・ブリッジ（tools/call、通知受領、ui/update-model-context） | ext-apps app/bridge | iframe 結合確認 |
| `src/server/index.ts` | `ui://bingo/board` 登録・ツール・チェックポイント保持・トランスポート | ext-apps server, MCP SDK | ツール入出力契約テスト |

`NumberList` は `export default` のため **`import NumberList from "…/numberList"`**（デフォルトインポート）で取り込む。

## 6. リポジトリ構成

```
bingo_mcp/
├─ vendor/bingo/        # git submodule → ROhta/bingo（無改変・--remote で追従）
├─ src/
│  ├─ server/index.ts   # ui://bingo/board 登録 + tools + transport(stdio/HTTP)
│  └─ widget/
│      ├─ index.html    # 盤面 UI（Bootstrap）
│      ├─ main.ts       # 起動・描画
│      ├─ bridge.ts     # postMessage ブリッジ（ext-apps app SDK）
│      ├─ hydrate.ts    # サーバー state ⇄ localStorage 再シード
│      ├─ draw.ts       # 抽選フロー（NumberList 利用・非純粋）
│      └─ card.ts       # 5×5 カード/判定（純関数）
├─ tsconfig.json        # paths に vendor を追加（型解決用）
├─ docs/specs/          # 本設計書
├─ package.json         # build スクリプトで esbuild/vite が widget を単一 HTML/JS にバンドル
├─ LICENSE (GPL-3.0)
└─ README.md
```

ビルド時の注意:
- TS の `paths` は**型解決のエイリアスのみ**。実体のバンドルには**バンドラの resolve.alias（vite）/ alias（esbuild）も必要**で、`vendor/bingo/src/ts/*.ts` を新リポ側 tsconfig の `include` に含める。
- `materials/*.mp3` は **data: URL（base64）でインライン化**（CSP `resourceDomains` ブロック回避）。外部 CDN 参照は避ける。
- 非ブロッカー（明記）: vendor の `engines: node>=24` / `pnpm>=11` は**新リポの取り込みには無関係**（バンドラが直接コンパイル）。private `#` フィールドもモダンターゲットならネイティブ対応。

## 7. MCP ツール & UIリソース設計（契約）

- UIリソース: `ui://bingo/board`、**`mimeType: text/html;profile=mcp-app`**（MUST）。widget バンドルを内包。
- 各ツールは `_meta.ui.resourceUri = "ui://bingo/board"` で UI を紐付け。
- 戻りは「モデル用テキスト」＋「ウィジェット用 structuredContent（= GameState 平データ）」の二層。

| ツール | 入力 | 動作 | 備考 |
|---|---|---|---|
| `start_bingo` | `{mode?: "resume"｜"fresh"}` | セッションの GameState を用意し盤面を開く。既定: 既存があれば **resume**、無ければ fresh | 中核。チャット起動の入口 |
| `draw_number` | なし | チャットからの抽選。新 View に tool-input{action:"draw"} を渡し、**View 側で `NumberList` が抽選**→sync | 二次機能。RNG はあくまでウィジェット |
| `sync_state` | `{state: GameState}` | ウィジェットからの状態同期をチェックポイントに保存 | ウィジェット→サーバー（tools/call）。抽選/マークの度に呼ぶ |
| `reset_game` | なし | チェックポイントを初期化し新規ゲーム | ウィジェット内ボタンでも完結可。チャット起点時は draw_number と同様の経路 |

確認済みの通信プリミティブ（ext-apps 2026-01-26）:
- Host→View: `ui/notifications/tool-input` / `tool-result` / `tool-input-partial` / `tool-cancelled` / `host-context-changed`。
- View→モデル: `ui/message`（チャットに発話追加）/ `ui/update-model-context`（会話コンテキスト更新）。

## 8. データフロー（典型シナリオ）

```
① 「ビンゴやりたい」→ start_bingo → サーバーが GameState 用意 →
   tool-result(structuredContent=state) と共に View 描画 →
   View が state で localStorage 再シード → NumberList 生成 → 盤面表示

② ウィジェットの「抽選」ボタン → draw.ts が NumberList で抽選 → card.ts 判定 →
   localStorage 更新 → sync_state(tools/call) でサーバーへ →
   ui/update-model-context で「B-12, リーチ1」等をモデルへ → 演出

③ チャット「次引いて」→ draw_number → 新 View 描画 + tool-input{action:"draw"} →
   View が直近 state から再シード → NumberList が抽選 → ②と同じ sync/通知

④ ビンゴ成立 → シンバル演出 + ui/message で Claude が「ビンゴ！」と反応
```

## 9. 状態管理と永続化（C案・詳細）

- **権威**: サーバーの `Map<sessionId, GameState>`（in-memory・平データ）。`GameState = {remain:number[], history:number[], card:Card}`（マーク状態は `Card` の各 `Cell.marked` が保持。別途 `marks[][]` は持たない）。
- **ウィジェット**: 各 render で受領した state から `localStorage`（`remainNumberList`/`historyNumberList`）を**再シード**し、`NumberList` を resume。抽選/マーク後の新 state を `sync_state` でサーバーへ返す。
- **セッション内 vs ターン跨ぎ**: `localStorage` は `allow-same-origin` 前提でセッション内はネイティブ動作。ただし View は毎ターン破棄され得るため**ターン跨ぎ生存は localStorage に依存しない**。跨ぎの真実は常にサーバーのチェックポイント。
- **単一盤面ポリシー**（C-4 対応）: 1 セッション 1 盤面のみ。`start_bingo` 再実行は既定で **resume**（既存チェックポイントを引き継ぐ）。複数同時盤面はスコープ外（§14）。これにより固定 localStorage キーの衝突は「サーバー state がマスター・localStorage は使い捨てキャッシュ」の関係で吸収する。
- **枯渇**（I-5 対応）: remain が空のとき `draw.ts.drawNext(): number | null` は `null` を返し、UI は抽選ボタン無効化＋終端表示。

## 9b. `card.ts` の型契約（新規・純関数）

```ts
// 列レンジ: B 1–15 / I 16–30 / N 31–45 / G 46–60 / O 61–75
// 中央(N の中央)は FREE（初期マーク済み）
type Cell = { value: number | "FREE"; marked: boolean }
type Card = Cell[][]            // 5列 × 5行
type Line = { kind: "row"｜"col"｜"diag"; index: number }

function generateCard(): Card                 // 各列レンジから重複なく 5 個、中央 FREE(初期 marked)
function markNumber(card: Card, n: number): Card  // 抽選番号でマーク（該当セルがあれば marked=true、不変更新）
function judge(card: Card):                   // マーク状態のみで判定（drawn 引数は不要）
  { bingoLines: Line[]; reachLines: Line[] }  // ビンゴ=1ライン全マーク / リーチ=あと1つで成立
```

判定はマーク状態（FREE 含む）に対する行・列・対角の全 12 ラインで評価。テスト網羅対象。

## 10. デプロイ（両対応）

| | ローカル（個人） | リモート（共有） |
|---|---|---|
| transport | stdio | Streamable HTTP |
| 登録方法 | Claude Desktop 設定 / `claude mcp add` | claude.ai の Connectors に URL 登録（プラン/組織設定に依存） |
| 認証 | 不要 | 公開範囲に応じ OAuth 等 |
| state | 同一プロセス内 in-memory | MCP セッション単位で in-memory（DB 不要。必要なら後で永続化） |
| コード差分 | **transport 初期化のみ**（ロジック・ツール・ウィジェットは共通） |

> サーバーは平データの薄いチェックポイントのみを持つため、両対応は実質トランスポート初期化の差。
> レンダリング経路は web（sandbox proxy 経由）と desktop（直接）で異なるが、サーバーコードには波及しない。

## 11. テスト方針

- `card.ts`: Node で純関数ユニットテスト（生成のレンジ/FREE、マーク、リーチ/ビンゴ判定を網羅）。
- `draw.ts`: 順序ロジックの純粋部は Node、`NumberList` 結合部は **jsdom もしくは実 iframe** でテスト（localStorage 前提）。
- `hydrate.ts`: jsdom で再シード往復（サーバー state ⇄ localStorage）を検証。
- サーバー: ツール入出力契約（`start_bingo`/`draw_number`/`sync_state`/`reset_game` の structuredContent）。
- 結合: **Claude Desktop と claude.ai(web) の両方**で実描画・ブリッジ往復・通知を確認（レンダリング経路差のため両方）。

## 12. 段階的実装計画

- **Phase 0（フィージビリティ・スパイク／着手前必須）**: ext-apps SDK で §13(B) の能力を最小実装で検証 —
  (a) tool-result の structuredContent が View に届き再シードできる、(b) tool-input{action} を新 View が受け取れる、
  (c) View→サーバーの tools/call(sync) が通る、(d) ui/update-model-context でモデルが状態を認識できる。
  いずれか不可なら該当機能のフォールバック（§13(B) 参照）を確定してから先へ。
1. 新リポ雛形 ＋ submodule 追加（`vendor/bingo`）、tsconfig paths＋バンドラ alias、widget バンドラ整備、取り込みスモーク。
2. ウィジェット骨格：`hydrate.ts`＋`NumberList` を iframe で動かし抽選ボタン→履歴更新（localStorage 動作確認）。
3. `card.ts`（TDD：§9b の契約を満たす純関数）。
4. MCP サーバー：`ui://bingo/board`（mimeType 正）＋ `start_bingo`＋`sync_state`。Claude Desktop で描画＋同期確認。
5. `draw_number`/`reset_game`（Phase 0 の結果に従う）＋演出（inline mp3）＋`ui/update-model-context`。
6. リモート HTTP 化 ＋ claude.ai 結合確認 ＋ Connector 登録。

## 13. 実装時に一次情報で確定する項目

`modelcontextprotocol/ext-apps` の最新ドキュメント（build-mcp-app スキル経由）で確定する。

**(A) 名称・手順の確認（低リスク・実装時で可）**
- ツール紐付け `_meta` キーの正確な記法（`_meta.ui.resourceUri`）。
- SDK パッケージ（`@modelcontextprotocol/ext-apps` / `/react` / `/app-bridge` / `/server`）の API。
- Streamable HTTP トランスポートと Connector 登録の手順・認証。

**(B) Phase 0 でスパイク検証する能力（高リスク・着手前）**
- structuredContent による View 再シード（§9 の前提）。
- tool-input による「draw 意図」受領（§7 `draw_number`、§8③）。
- View→サーバー tools/call(sync) と View→モデル `ui/update-model-context`/`ui/message`（§8②④）。
- フォールバック: (b)(c) 不可なら `draw_number` は「開き直して resume + 単発抽選」で代替。(d) 不可ならモデルのナレーションは諦め、ウィジェット表示のみ。

## 14. スコープ外（YAGNI）

- マルチプレイ（参加者ごとのカード・共有抽選状態の同期）。
- **複数同時盤面**（1 セッション 1 盤面のみ）。
- 元リポジトリ `ROhta/bingo` への変更。
- ターン間永続化を localStorage に依存させること（サーバー チェックポイントが真実）。

## 15. 既知の制約・前提（ext-apps 2026-01-26 で確認済み）

- UIリソース `mimeType` は MUST `text/html;profile=mcp-app`、URI は `ui://` スキーム。
- View は会話ターンごとに破棄・再生成（`ui/resource-teardown`）。状態永続化 API は未定義（Future Considerations）。
- サンドボックス iframe（`allow-scripts`＋`allow-same-origin`）。静的リソースは CSP `resourceDomains` 宣言が必要、未宣言はブロック（MUST）。
- 出典: `https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx`
