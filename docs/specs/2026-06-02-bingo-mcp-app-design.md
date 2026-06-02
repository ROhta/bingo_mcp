# 設計書: bingo_mcp（MCP Apps で遊べるビンゴ）

- 日付: 2026-06-02
- ステータス: ドラフト（実装着手前のレビュー待ち）
- 対象リポジトリ: `ROhta/bingo_mcp`（本リポジトリ）
- 再利用元: `ROhta/bingo`（無改変・git submodule で参照）

## 1. 目的

Claude のグラフィカルクライアント（claude.ai web / Claude Desktop）のチャット内で、
「ビンゴやりたい」と言うと **MCP Apps のウィジェット**としてビンゴ盤面が描画され、その場で遊べるようにする。
既存の `ROhta/bingo`（パーティ向けビンゴ抽選機）のソースを**改変せず呼び出して**再利用する。

## 2. 確定した意思決定

| 論点 | 決定 | 根拠 |
|---|---|---|
| 舞台 | claude.ai web / Claude Desktop（グラフィカルClaude） | MCP Apps の iframe はターミナルの Claude Code では描画されない |
| スコープ | 抽選機の再現 ＋ 5×5 ビンゴカード（マーク・リーチ/ビンゴ判定） | ユーザー選択。マルチプレイは対象外 |
| デプロイ | ローカル（stdio）先行 → リモート（HTTP Connector）共有も可能な両対応 | ユーザー選択 |
| 設計の軸 | **既存ソースの忠実な再利用を優先**（サーバー権威より優先） | ユーザー選択。`NumberList` の自然な居場所がブラウザ（iframe）のため |
| 再利用元の取り込み | **git submodule**（`vendor/bingo`）。無改変、`--remote` で上流追従 | `bingo` は npm パッケージ化されておらず import 実体が無い（後述） |

## 3. 既存ソース（`ROhta/bingo`）の調査結果と再利用方針

### 3.1 調査で判明した事実

- `package.json`: `name: "bingo-machine"`, `main: "src/index.html"`（HTML を指す）、`exports`/`types`/`module` フィールド無し、npm 未公開。
- `tsc -b` のコンパイル出力 `src/js/` は**コミットされていない**（`src/` 配下は `index.html` / `materials/` / `ts/` のみ）。
- → `npm install` も `github:` 依存も、**そのままでは import できる実体が無い**。
- `src/ts/numberList.ts` は `export default class NumberList`。ただし **`localStorage`（ブラウザ専用API）に密結合**（`remainList`/`historyList`/`resetLists` が直接 `localStorage` を読み書き）。`generateRandomNumber(n)` は `crypto.getRandomValues` ベースの乱数インデックス生成（Node でも可）。
- **抽選フロー**（remain から引いて history へ移す）は `NumberList` ではなく DOM 結合の `domManipulation.ts` 側にあり、再利用不可。
- ライセンスは **GPL-3.0-or-later**。本リポジトリも GPL-3.0（LICENSE 同梱済み）で整合。

### 3.2 再利用方針（何を・どこで）

| 要素 | 置き場所 | 出所 |
|---|---|---|
| `NumberList`（範囲[1,75]/検証/localStorage履歴/乱数） | ウィジェット（iframe＝ブラウザ環境） | **submodule のソースを無改変で import**（忠実な再利用） |
| 抽選フロー（remain→history） | ウィジェット | 新規（薄い。`NumberList` の公開APIに乗せる） |
| 5×5 カード生成・マーク・リーチ/ビンゴ判定 | ウィジェット | **100%新規** `card.ts`（純関数でテスト可能に設計） |
| 演出（ドラムロール/シンバル） | ウィジェット | submodule の `materials/*.mp3` をバンドル |
| UIリソース配信・ツール・トランスポート | サーバー | 新規（薄型） |

> 再利用の実体は限定的（`NumberList` 本体のみ）であることを明記する。
> `NumberList` を**そのブラウザ環境（iframe）でそのまま動かす**ことで、localStorage シムや global 改変などの小細工を一切排除する。これが「忠実な再利用を優先」の具体的帰結。

## 4. アーキテクチャ

ウィジェット中心 / サーバー薄型。サーバーはゲーム状態を持たない（＝両対応がトランスポート差のみになる）。

```
┌──────────── Claude (web / desktop) ─────────────┐
│ チャット「ビンゴやりたい」→ start_bingo            │
│        ▼                                          │
│  ┌─ iframe: ui://bingo/board (ブラウザ環境) ─────┐ │
│  │  NumberList(submodule のソースを“そのまま”)   │ │ ← localStorage ネイティブ・シム不要
│  │  + draw.ts(抽選フロー:新規) + card.ts(判定:新規)│ │
│  │  + Bootstrap UI / 演出 / postMessage ブリッジ  │ │
│  └───────────────┬───────────▲──────────────────┘ │
│   (任意)tools/call│           │tool結果/通知         │
└───────────────────┼───────────┼────────────────────┘
                    ▼           │
        ┌─ MCP server (薄型・stdio/HTTP両対応) ─┐
        │ resource: ui://bingo/board (widget バンドル) │
        │ tools: start_bingo / (任意)draw_number /     │
        │        reset_game / report_event            │
        │ ※ゲーム状態は持たない                        │
        └─────────────────────────────────────────────┘
```

## 5. コンポーネントと責務

| 単位 | 責務 | 依存 | インターフェース |
|---|---|---|---|
| `vendor/bingo`（submodule） | 既存ビンゴ抽選機ソース（無改変） | なし | `numberList.ts` の `NumberList` を import |
| `src/widget/` | 盤面の描画・抽選/マーク/判定・演出・ブリッジ | `NumberList`, ext-apps（app/bridge） | postMessage 経由でサーバーツールを呼ぶ／結果を受ける |
| `src/widget/card.ts` | カード生成・マーク・リーチ/ビンゴ判定（純関数） | なし | `generateCard()`, `judge(card, drawn)` 等 |
| `src/widget/draw.ts` | 抽選フロー（`NumberList` 公開APIで remain→history） | `NumberList` | `drawNext(): number` 等 |
| `src/server/index.ts` | UIリソース登録・ツール公開・トランスポート | ext-apps server, MCP SDK | `start_bingo` 等のツール、`ui://bingo/board` |

## 6. リポジトリ構成

```
bingo_mcp/
├─ vendor/bingo/        # git submodule → ROhta/bingo（無改変・--remote で追従）
├─ src/
│  ├─ server/
│  │   └─ index.ts      # ui://bingo/board 登録 + tools + transport(stdio/HTTP)
│  └─ widget/
│      ├─ index.html    # 盤面 UI（Bootstrap）
│      ├─ main.ts       # vendor/bingo/src/ts/numberList.ts を import して起動
│      ├─ draw.ts       # 抽選フロー（新規・薄い）
│      ├─ card.ts       # 5×5 カード/判定（新規・純関数）
│      └─ bridge.ts     # postMessage ブリッジ（ext-apps app SDK）
├─ tsconfig.json        # paths に submodule のソースを追加
├─ build               # esbuild/vite で widget を単一 HTML/JS にバンドル
├─ docs/specs/          # 本設計書
├─ package.json
├─ LICENSE (GPL-3.0)
└─ README.md
```

## 7. MCP ツール & UIリソース設計（契約）

- UIリソース: `ui://bingo/board`（`mimeType: text/html`、widget バンドル）。
- 各ツールは `_meta`（ext-apps の UIリソース紐付けキー: `ui.resourceUri` 系）で `ui://bingo/board` を指す。
- ツールの戻りは「モデル用テキスト」＋「ウィジェット用 structuredContent」の二層。

| ツール | 入力 | 動作 | 役割 |
|---|---|---|---|
| `start_bingo` | （任意）カード有無 | 盤面ウィジェットを開く | **中核**。チャット起動の入口 |
| `draw_number` | なし | （任意）ウィジェットに次の抽選を指示 | チャットから引きたい場合の追加機能。host→widget 通知で実現 |
| `reset_game` | なし | 盤面リセットを指示 | 補助 |
| `report_event` | 抽選番号 / リーチ・ビンゴ等 | ウィジェット→モデルへの状態報告 | Claude がナレーションするためのフック |

> 主役は `start_bingo`（チャットで起動）→ 以降はウィジェット上のボタンで操作、というフロー。
> `draw_number` 等の host→widget 連携は二次的機能として段階的に追加する。

## 8. データフロー（典型シナリオ）

```
① ユーザー:「ビンゴやりたい」→ Claude が start_bingo → 盤面ウィジェット描画
② ウィジェットの「抽選」ボタン → draw.ts が NumberList で抽選 → 履歴/カード更新 → 演出 →（任意）report_event でClaudeへ
③（任意）チャット「次引いて」→ Claude が draw_number → host→widget 通知 → ウィジェットが抽選 → ②と同じ更新
④ ビンゴ成立 → シンバル演出 ＋ Claude が「ビンゴ！」と反応
```

## 9. 状態管理と永続化

- ゲーム状態（remain/history/カード/マーク）は**ウィジェット側**に保持。
- `NumberList` は `localStorage` を使う（iframe なのでネイティブに動作）。
- ターンをまたいだ生存はホストのウィジェット永続化機構を併用（実装時に ext-apps の state API で確定）。
- サーバーは状態を持たない。

## 10. デプロイ（両対応）

| | ローカル（個人） | リモート（共有） |
|---|---|---|
| transport | stdio | Streamable HTTP |
| 登録方法 | Claude Desktop 設定 / `claude mcp add` | claude.ai の Connectors に URL 登録 |
| 認証 | 不要 | 公開範囲に応じて OAuth 等 |
| コード差分 | **transport 初期化のみ**（ロジック・ツール・ウィジェットは共通） |

## 11. テスト方針

- `card.ts` / `draw.ts`: 純関数として切り出しユニットテスト（生成・マーク・リーチ/ビンゴ判定を網羅）。
- `NumberList`: 上流の挙動を信頼しつつ、submodule 取り込み後の import が成立することをスモークテスト。
- サーバー: ツール入出力契約のテスト（MCP Inspector / mcpjam 等）。
- ウィジェット: Claude Desktop での実描画・ブリッジ往復を結合確認。

## 12. 段階的実装計画

1. 新リポジトリ雛形 ＋ submodule 追加（`vendor/bingo`）、tsconfig path、widget バンドラ整備。
2. ウィジェット骨格：`NumberList` を iframe で動かし、抽選ボタン→履歴更新（localStorage 動作確認）。
3. `card.ts`（TDD：生成/マーク/リーチ/ビンゴ判定の純関数）。
4. MCP サーバー：`ui://bingo/board` ＋ `start_bingo`。Claude Desktop（stdio）で盤面描画確認。
5. ブリッジ拡充：`draw_number`/`reset_game`/`report_event` ＋ 音演出。
6. リモート HTTP 化 ＋ Connector 登録。

## 13. 実装時に一次情報で確定する項目（記憶に頼らない）

`modelcontextprotocol/ext-apps` の最新ドキュメント（build-mcp-app スキル経由）で確定する:

- ツールと UIリソースの紐付け `_meta` キーの正確な名称。
- postMessage ブリッジの JSON-RPC メソッド名（tools/call、host→widget 通知）。
- ウィジェット状態永続化 API（setState 等）と iframe のターン間ライフサイクル。
- 採用 SDK パッケージ（`@modelcontextprotocol/ext-apps` / `/react` / `/app-bridge` / `/server`）の具体的な使い方。
- Streamable HTTP トランスポートと Connector 登録の手順・認証。

## 14. スコープ外（YAGNI）

- マルチプレイ（参加者ごとのカード・共有抽選状態の同期）。
- サーバー権威の状態管理（今回は不採用）。
- 元リポジトリ `ROhta/bingo` への変更。
