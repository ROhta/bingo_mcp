import * as esbuild from "esbuild"
import {mkdir, readFile, writeFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"

// widget を単一の HTML/JS にバンドルし、ui:// リソースとして配信する dist/mcp-app.html を生成。
const result = await esbuild.build({
	entryPoints: ["src/widget/main.ts"],
	bundle: true,
	format: "iife",
	target: "es2022",
	write: false,
	loader: {".mp3": "dataurl"}, // 演出音は data: URL でインライン化（CSP resourceDomains 回避）
	// 相対 alias は cwd 依存になるため絶対パス化（vitest.config.ts と同方式）
	alias: {
		"@vendor/bingo/numberList": fileURLToPath(new URL("./vendor/bingo/src/ts/numberList.ts", import.meta.url)),
	},
})

const bundle = result.outputFiles[0]
if (!bundle) throw new Error("esbuild produced no output")
// バンドル JS 内に "</script>" が現れると HTML パーサが script を早期終了するためエスケープ
const safeScript = bundle.text.replace(/<\/script>/gi, "<\\/script>")
const template = await readFile("src/widget/index.html", "utf-8")
await mkdir("dist", {recursive: true})
// XSS 非該当: safeScript はビルド時に生成する自前の esbuild バンドル（外部/ユーザー入力ではない）。
// </script> はエスケープ済み。MCP App は自コードを単一HTMLに inline して ui:// で配信する仕様。
// nosemgrep
const html = template.replace("<!--BUNDLE-->", `<script>${safeScript}</script>`)
await writeFile("dist/mcp-app.html", html)
console.log("wrote dist/mcp-app.html")
