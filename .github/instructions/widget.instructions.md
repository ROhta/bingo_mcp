---
description: widget の UI / ビルド方針（自前 CSS・CSP・mp3 インライン・esbuild）
applyTo: "{src/widget/**,esbuild.mjs}"
---

# Widget の UI とビルド

## スタイリング

- Bootstrap には依存しない。スタイルは `src/widget/index.html` の `style` と `src/widget/draw.ts` に自前で持つ。
- 色やテーマは CSS カスタムプロパティに集約する。

## CSP とアセット

- UI リソースの `mimeType` は **`text/html;profile=mcp-app`**（MUST）。
- 静的リソースは CSP `resourceDomains` 宣言が必要で、未宣言オリジンはブロックされる（MUST）。
- 演出音（drumroll / cymbals の mp3）は **data: URL でインライン化**して `resourceDomains` を回避する（esbuild の `loader: {".mp3": "dataurl"}`）。

## esbuild バンドル

- `src/widget/main.ts` を起点に iife 形式で単一 HTML（`dist/mcp-app.html`）へバンドルし、`ui://` リソースとして配信する。
- バンドル JS 内に `</script>` が現れると HTML パーサが script を早期終了するため、`</script>` → `<\/script>` にエスケープする。
- テンプレート（`src/widget/index.html`）の `<!--BUNDLE-->` を **置換は関数で**渡して差し込む（文字列置換だと replacement 内の `$&`/`$\`` 等が特殊パターンと解釈され、バンドル中の正規表現エスケープが破損する）。
- vendored モジュール alias（`@vendor/bingo/numberList` ＝ `NumberList` の TS ソース）は cwd 依存回避のため絶対パス化する（`esbuild.mjs` / `vitest.config.ts` 同方式）。mp3 は alias ではなく上記 `loader: {".mp3": "dataurl"}` で取り込む点に注意。
