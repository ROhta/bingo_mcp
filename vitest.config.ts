import {defineConfig} from "vitest/config"
import {fileURLToPath} from "node:url"

export default defineConfig({
	resolve: {
		alias: {
			"@vendor/bingo/numberList": fileURLToPath(new URL("./vendor/bingo/src/ts/numberList.ts", import.meta.url)),
		},
	},
	// 自前テストのみ対象に限定。APM 生成物（apm_modules/ 等の同梱 .test ファイル）や
	// vendored を拾わないよう include を src 配下に絞る（vitest は .gitignore を見ない）。
	test: {environment: "node", include: ["src/**/*.test.ts"]},
})
