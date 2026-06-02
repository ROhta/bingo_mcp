import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
	resolve: {
		alias: {
			"@vendor/bingo/numberList": fileURLToPath(new URL("./vendor/bingo/src/ts/numberList.ts", import.meta.url)),
		},
	},
	test: { environment: "node" },
})
