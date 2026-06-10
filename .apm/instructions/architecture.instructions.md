---
description: bingo_mcp のアーキテクチャ（責務分担・vendored 依存・乱数・状態検証境界・MCP ツール・状態権威）
applyTo: "src/**"
---

# アーキテクチャと実装方針

## 概要

Claude のグラフィカルクライアント（claude.ai web / Claude Desktop）のチャット内で「ビンゴやりたい」と言うと、MCP Apps のウィジェットとしてビンゴ盤面（抽選機 ＋ 5×5 カード）が描画される。既存の `ROhta/bingo` のソースを**改変せず**再利用する。

## 3 層の責務分担

- `src/server`: MCP サーバー（stdio）。`GameState` の権威を持つ。submodule に**一切触れない**。
- `src/widget`: ブラウザ描画＋抽選実行。vendored `NumberList` を**実行する**。
- `src/shared`: `GameState` 等の型定義。

## vendored `NumberList` の非対称依存

依存しているのは `ROhta/bingo` 全体ではなく **`numberList.ts` 1 ファイルと mp3 2 つだけ**。

- **widget 側だけ**が `@vendor/bingo/numberList` を import して実行し、本家の抽選挙動を忠実に再現する。
- **server 側**は `NumberList` を import せず、`src/widget/card.ts` の `randomIndex` を使って抽選する（`drawFromState`）。`randomIndex` は本家 `NumberList.generateRandomNumber` の式を「import せず再現」したもの。
- これにより server は submodule のチェックアウト無しでもビルド・抽選できる。
- alias 配線は **3 箇所**: `tsconfig.json`（paths＋include）/ `esbuild.mjs`（alias）/ `vitest.config.ts`（resolve.alias）。いずれも絶対パス化する（cwd 依存回避）。

## 乱数と公平性（`randomIndex` の契約）

エントロピー源は `crypto.getRandomValues` を使い、`Math.random()` は使わない。

- `Math.random()` は実装依存 PRNG で予測可能。抽選機としては「操作できない」ことに意味がある。本家も `crypto` を使うため分布を一致させる。
- 切り出しは剰余 `%` ではなく `Math.floor((value / 2 ** 32) * maxExclusive)`（floor-normalize）。`%` は低インデックスに偏る剰余バイアスがあるが、floor-normalize は偏りを範囲全体に分散し、`n ≤ 75` では誤差 ~10⁻⁸ と無視できる。本家 `generateRandomNumber` と同方式。
- 返り値は常に `[0, maxExclusive)` に収まる（u32 最大でも `(2³²-1)/2³² < 1` のため `floor` で `maxExclusive` 未満）。配列範囲外アクセスを踏まない。
- 避けているのは `Math.random()`（エントロピー源）であって `Math.floor`（切り捨て）は問題なく使う。

## 状態の検証境界（書き込み厳格・読み取り寛容）

`remain`/`history` の localStorage 出入りは非対称に検証する。

| 方向                       | 経路                                                                 | 検証                                              |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 書き込み（resume seed）    | `seedLocalStorage` → `assertBingoNumbers`（`src/widget/hydrate.ts`） | **厳格**: 非配列・非整数・`[1,75]` 範囲外を throw |
| 読み取り（resume restore） | `new NumberList()` の getter（vendored）                             | **寛容**: 非配列は黙って `[]` に縮退              |

untrusted な入力はサーバー由来の `state`（MCP `structuredContent`）で、widget が localStorage に書き込む瞬間に `seedLocalStorage` が検証する（信頼境界＝入口）。widget が `new NumberList()` を作るのは常に seed 成功直後なので、寛容な読み取りが見るのは検証済みの自前データだけ。将来読み取り側にも厳格さが要るなら `assertBingoNumbers` 相当を読み取り口にも設けること。

## MCP ツール（`src/server/index.ts`）

| ツール        | 入力                         | 挙動                                                                          |
| ------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `start_bingo` | `mode?: "resume" \| "fresh"` | 盤面を開く。`fresh` または未開始なら新規、既存があれば再開                    |
| `sync_state`  | `state: GameState`           | widget から状態を保存（抽選/マークの度に呼ばれる）                            |
| `draw_number` | なし                         | 次の1つを抽選（チャットからの「次引いて」用）。枯渇時は「全て抽選済み」を返す |
| `reset_game`  | なし                         | ゲーム初期化                                                                  |

出力はすべて `gameStateShape`（`remain` / `history` / `card`）の `structuredContent`。

## 状態権威（C案）と単一盤面

MCP Apps の View はターンごとに破棄・再生成され（`ui/resource-teardown`）、状態永続化 API は未定義。そのため **サーバーが平データのチェックポイント（`GameState`）を保持**し、widget が各 render で再シードして `NumberList` を実行、結果をサーバーへ同期する（C案）。現状は単一盤面ポリシー（`index.ts` の `let game`）。stateful HTTP 化（複数セッション分離）は将来課題。
