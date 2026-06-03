import {createServer, type IncomingMessage} from "node:http"
import {randomUUID} from "node:crypto"
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {isInitializeRequest} from "@modelcontextprotocol/sdk/types.js"
import {createBingoServer} from "./app.js"

const MCP_PATH = "/mcp"

/** POST ボディを読み切って JSON へ。node:http には body parser が無いので自前で行う（空なら undefined）。 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		// 全 Buffer を結合してから一度だけ decode する。チャンク毎に toString すると
		// マルチバイト UTF-8 がチャンク境界で割れて文字化けする。
		const chunks: Buffer[] = []
		req.on("data", chunk => chunks.push(chunk as Buffer))
		req.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf-8")
			if (raw === "") return resolve(undefined)
			try {
				resolve(JSON.parse(raw))
			} catch (error) {
				reject(error)
			}
		})
		req.on("error", reject)
	})
}

/**
 * Streamable HTTP でビンゴサーバーを公開する（リモート共有・設計書 §10）。
 * ステートフル: MCP セッションごとに transport ＋ createBingoServer() を1組生成し、
 * Mcp-Session-Id ヘッダで引く。McpServer↔transport が 1:1 のため「1セッション1サーバー1盤面」。
 *
 * 注: DNS リバインディング保護（allowedHosts/Origins）は付けていない。trycloudflare 等での
 * 一時的な手動結合確認スコープ（Task 11 Step 3）のため。常設公開するなら前段に検証ミドルウェアを置くこと。
 */
export function startHttpServer(port: number): void {
	const transports = new Map<string, StreamableHTTPServerTransport>()

	const httpServer = createServer(async (req, res) => {
		const url = new URL(req.url ?? "", "http://localhost")
		if (url.pathname !== MCP_PATH) {
			res.writeHead(404).end()
			return
		}
		const header = req.headers["mcp-session-id"]
		const sessionId = Array.isArray(header) ? header[0] : header
		const existing = sessionId ? transports.get(sessionId) : undefined

		// POST 以外（GET=SSE通知ストリーム / DELETE=セッション終了）は既存セッション必須
		if (req.method !== "POST") {
			if (!existing) {
				res.writeHead(400).end("Unknown or missing session")
				return
			}
			await existing.handleRequest(req, res)
			return
		}

		// POST: ボディを読み、既存セッションへ委譲、無ければ initialize のみ新規受付
		const body = await readJsonBody(req).catch(() => undefined)
		if (existing) {
			await existing.handleRequest(req, res, body)
			return
		}
		if (!isInitializeRequest(body)) {
			res.writeHead(400).end("No valid session and not an initialize request")
			return
		}
		// 型注釈は必須: onsessioninitialized が transport を自己参照するため推論が循環する
		const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: id => {
				transports.set(id, transport)
			},
		})
		// セッション終了でルーティング表から除去（しないとセッションごとにサーバーがリーク）
		transport.onclose = () => {
			if (transport.sessionId) transports.delete(transport.sessionId)
		}
		await createBingoServer().connect(transport)
		await transport.handleRequest(req, res, body)
	})

	httpServer.listen(port, () => console.error(`bingo-mcp Streamable HTTP: http://localhost:${port}${MCP_PATH}`))
}
