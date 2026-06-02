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
const template = await readFile("src/widget/index.html", "utf-8")
await mkdir("dist", {recursive: true})
await writeFile("dist/mcp-app.html", template.replace("<!--BUNDLE-->", `<script>${bundle.text}</script>`))
console.log("wrote dist/mcp-app.html")
