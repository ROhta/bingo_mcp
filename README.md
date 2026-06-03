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

## 開発

```sh
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html, server(tsc) → dist/server
```
