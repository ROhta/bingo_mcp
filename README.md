# bingo_mcp

bingo を MCP Apps で呼ぶ。チャットで「ビンゴやりたい」と言うと、抽選機＋5×5 ビンゴカードのインタラクティブ widget が描画される。

抽選ロジック（`NumberList`）と演出音は [ROhta/bingo](https://github.com/ROhta/bingo) を submodule (`vendor/bingo`) として忠実に再利用している。

## submodule (`vendor/bingo`) への依存

依存しているのは本家リポジトリ全体ではなく、**`numberList.ts` 1ファイルと mp3 2つだけ**。依存面は意図的に狭くしている。

### 依存している部分

| 種類 | 実ファイル | 使用箇所 |
|---|---|---|
| 抽選ロジック `NumberList` クラス | `vendor/bingo/src/ts/numberList.ts`（alias `@vendor/bingo/numberList`） | `src/widget/draw.ts`, `src/widget/main.ts`, テスト |
| 演出音アセット | `vendor/bingo/src/materials/{drumroll,cymbals}.mp3` | `src/widget/main.ts`（esbuild が dataurl 化してインライン） |

`NumberList` は remain/history を localStorage に持つ抽選ステートマシン。これを **widget 側がそのまま実行**することで本家の挙動を忠実に再現する（C案）。alias は `tsconfig.json`（paths＋include）/ `esbuild.mjs` / `vitest.config.ts` の3箇所で配線。

### 依存して**いない**部分（本 repo 側で再実装）

| 機能 | 出所 |
|---|---|
| カード生成・マーク・リーチ/ビンゴ判定 | `src/widget/card.ts` |
| `GameState` 型・サーバー権威状態 | `src/shared/types.ts` |
| サーバー側抽選 `drawFromState` | `src/server/game.ts` — `card.ts` の `randomIndex` を使い `NumberList` を import しない |

依存は非対称で、**widget 側だけが `NumberList` を実行し、server 側は submodule に一切触れない**。`randomIndex` は本家 `NumberList.generateRandomNumber` の式を「import せず再現」したもので、これにより server は submodule のチェックアウト無しでもビルド・抽選でき、widget は本家を忠実に走らせる、という役割分担が依存グラフにそのまま表れている。

## 乱数と公平性

ビンゴの「公平性」は、抽選とカード生成に使う乱数 `randomIndex(maxExclusive)`（`src/widget/card.ts`）が **実用上ほぼ一様** であることに集約される（厳密には後述のとおり ~n/2³² の偏りが残るが、`n ≤ 75` では約 10⁻⁸ で無視できる）。

- **抽選の公平性**: `drawFromState` で残り `n` 個から1つ選ぶとき、どの番号もほぼ等確率 `1/n` で出る。
- **カード生成の公平性**: `pickFiveDistinct` の Fisher-Yates シャッフルが各列レンジ内の数値をほぼ等確率に並べ替える。

### なぜ `Math.random()` ではなく `crypto` か

`randomIndex` のエントロピー源には `crypto.getRandomValues` を使い、`Math.random()` は使わない。

- `Math.random()` は実装依存の擬似乱数（PRNG）で暗号品質ではなく、種が読めれば結果を予測できる。抽選機としては「操作できない」ことに意味がある。
- 本プロジェクトの設計指針（本家 `NumberList` の忠実な再利用）上、本家が `crypto.getRandomValues` を使っているため、widget と server で抽選分布を一致させる必要がある。

避けているのは `Math.random()`（エントロピー源）であって、`Math.floor`（切り捨て）は問題なく使っている。

### なぜ剰余 `%` ではなく floor-normalize か

切り出しは `value % maxExclusive` ではなく、`Math.floor((value / 2 ** 32) * maxExclusive)`（0〜1 に正規化して掛ける）方式を採る。

どちらも `2 ** 32` が `maxExclusive` で割り切れない限り厳密な一様分布にはならず（厳密に消すなら rejection sampling が要る）、偏りの**大きさ**は同程度（±1 個ぶん）。違うのは偏りの**所在**：

- `%` は偏りを**低インデックスに集中**させる（`0 〜 2³² mod n - 1` がわずかに高確率になる＝構造的な **剰余バイアス**）。
- floor-normalize は偏りを範囲全体に**分散**させ、かつ `n ≤ 75` では誤差が `2 ** 32` に対し約 10⁻⁸ と桁違いに小さい。本家 `NumberList.generateRandomNumber` と同方式。

`Math.floor` がここで「`maxExclusive` ちょうど」を返さない点も効いている。u32 の最大値 `2 ** 32 - 1` でも `(2 ** 32 - 1) / 2 ** 32 ≈ 0.99999…`、これに `maxExclusive` を掛けて floor すると必ず `maxExclusive - 1` 以下。返り値は常に `[0, maxExclusive)` に収まり、配列の範囲外アクセスを踏まない（`ceil`/`round` だと上端で範囲外になり得る）。

## 状態の検証境界（書き込みは厳格・読み取りは寛容）

ゲーム状態（`remain`/`history`）の localStorage への出入りは、**書き込み側で厳格に検証し、読み取り側は vendored `NumberList` の寛容な getter に委ねる**という非対称な設計を採る。

| 方向 | 経路 | 検証 |
|---|---|---|
| 書き込み（resume seed） | `seedLocalStorage` → `assertBingoNumbers`（`src/widget/hydrate.ts`） | **厳格**：非配列・非整数・`[1,75]` 範囲外を throw |
| 読み取り（resume restore） | `new NumberList()` の getter（`vendor/bingo`） | **寛容**：非配列は黙って `[]` に縮退。ただし壊れた JSON と範囲外の要素は throw（範囲内の非整数 `[1.5]` は通す） |

この非対称が安全に成り立つ理由：

- 検証が本当に要る untrusted な入力は**サーバー由来の `state`（MCP `structuredContent`）**で、これは widget が **localStorage に書き込む瞬間に `seedLocalStorage` が検証**し、不正なら throw する（`src/widget/main.ts` の呼び出し側が捕捉）。信頼境界は「入口（書き込み）」で守る。
- widget が `new NumberList()` を作るのは**常に seed 成功の直後**なので、寛容な読み取り getter が見るのは「直前に検証済みの自前データ」だけ。寛容な縮退（非配列→`[]`）が表面化するのは stale／改竄された localStorage を単独で読むレアケースに限られ、空の抽選状態へフォールバックするのはゲーム widget として安全側。

> 旧 `readDrawState`（厳格な読み取り口）はこの経路で未使用だったため削除済み。これにより「resume の読み取りは vendored getter に委ねる」という設計判断が確定している。将来、読み取り側にも厳格さが要るようになったら、`assertBingoNumbers` 相当の検証を読み取り口にも設けること。

## デプロイ（ローカル / リモート共有）

サーバーは2つの transport に対応する。**差分は transport 初期化だけ**で、ツール・リソース・盤面ロジックは `createBingoServer()`（`src/server/app.ts`）で共通（設計書 §10）。

| | ローカル（個人） | リモート（共有） |
|---|---|---|
| transport | stdio | Streamable HTTP（`/mcp`） |
| 起動 | `pnpm start`（既定） | `pnpm start:http`（`PORT` 既定 3000） |
| 登録 | Claude Desktop 設定 / `claude mcp add` | claude.ai の Connectors に URL 登録 |
| state | プロセス内 in-memory（単一盤面） | MCP セッション単位 in-memory |

### セッション分離（HTTP のステートフル設計）

`McpServer` と transport は **1:1**（`Protocol.connect` が単一参照を持つ）。よって HTTP では **MCP セッションごとに `createBingoServer()` を1つ生成**し、`Mcp-Session-Id` ヘッダで `Map<sessionId, transport>` を引いてルーティングする。盤面状態 `game` は各サーバーインスタンスの **closure に閉じる**ため、`Map<sessionId, GameState>` を明示的に持たずとも「1セッション1盤面」が成立する（複数利用者が独立した盤面を持つ）。`transport.onclose` でセッション終了時に Map から除去し、サーバーごと GC させる。

`/mcp` は3メソッドを処理する：`POST`（initialize＝新規セッション／既存セッションへの呼び出し）、`GET`（サーバー→クライアントの SSE 通知ストリーム）、`DELETE`（セッション終了）。

### claude.ai での結合確認

ローカル HTTP を一時公開（trycloudflare 等）し、発行 URL（`https://<sub>.trycloudflare.com/mcp`）を claude.ai の Connectors に登録する。web は sandbox proxy 経由のためレンダリング経路が desktop と異なる（設計書 §11）。

> セキュリティ注: 一時的な手動結合確認スコープのため DNS リバインディング保護（`allowedHosts`/`allowedOrigins`）は付けていない。常設公開する場合は前段に Origin/Host 検証ミドルウェアと認証を置くこと。

## 開発

```sh
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html, server(tsc) → dist/server
```
