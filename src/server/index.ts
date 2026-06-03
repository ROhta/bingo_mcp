import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {createBingoServer} from "./app.js"
import {startHttpServer} from "./http.js"

// 既定はローカル stdio、--http でリモート共有（Streamable HTTP）。
// ツール・リソース・盤面ロジックは createBingoServer() で共通、差分は transport 初期化のみ（設計書 §10）。
if (process.argv.includes("--http")) {
	startHttpServer(Number(process.env.PORT ?? 3000))
} else {
	await createBingoServer().connect(new StdioServerTransport())
}
