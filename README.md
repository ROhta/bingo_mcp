# bingo_mcp

bingo を MCP Apps で呼ぶ。チャットで「ビンゴやりたい」と言うと、抽選機＋5×5 ビンゴカードのインタラクティブ widget が描画される。

抽選ロジック（`NumberList`）と演出音は [ROhta/bingo](https://github.com/ROhta/bingo) を submodule (`vendor/bingo`) として忠実に再利用している。

## 乱数と公平性

ビンゴの「公平性」は、抽選とカード生成に使う乱数 `randomIndex(maxExclusive)`（`src/widget/card.ts`）が **一様分布** であることに集約される。

- **抽選の公平性**: `drawFromState` で残り `n` 個から1つ選ぶとき、どの番号も等確率 `1/n` で出る。
- **カード生成の公平性**: `pickFiveDistinct` の Fisher-Yates シャッフルが各列レンジ内の数値を等確率に並べ替える。

### なぜ `Math.random()` ではなく `crypto` か

`randomIndex` のエントロピー源には `crypto.getRandomValues` を使い、`Math.random()` は使わない。

- `Math.random()` は実装依存の擬似乱数（PRNG）で暗号品質ではなく、種が読めれば結果を予測できる。抽選機としては「操作できない」ことに意味がある。
- 本プロジェクトの設計指針（本家 `NumberList` の忠実な再利用）上、本家が `crypto.getRandomValues` を使っているため、widget と server で抽選分布を一致させる必要がある。

避けているのは `Math.random()`（エントロピー源）であって、`Math.floor`（切り捨て）は問題なく使っている。

### なぜ剰余 `%` ではなく floor-normalize か

切り出しは `value % maxExclusive` ではなく、`Math.floor((value / 2 ** 32) * maxExclusive)`（0〜1 に正規化して掛ける）方式を採る。

- `%` は `2 ** 32` が `maxExclusive` で割り切れないとき **剰余バイアス** が出る（小さいインデックスがわずかに高確率になる）。
- floor-normalize なら偏りが分散され、かつ `n ≤ 75` では `2 ** 32` に対し誤差が桁違いに小さい。本家 `NumberList.generateRandomNumber` と同方式。

`Math.floor` がここで「`maxExclusive` ちょうど」を返さない点も効いている。u32 の最大値 `2 ** 32 - 1` でも `(2 ** 32 - 1) / 2 ** 32 ≈ 0.99999…`、これに `maxExclusive` を掛けて floor すると必ず `maxExclusive - 1` 以下。返り値は常に `[0, maxExclusive)` に収まり、配列の範囲外アクセスを踏まない（`ceil`/`round` だと上端で範囲外になり得る）。

## 開発

```sh
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html, server(tsc) → dist/server
```
