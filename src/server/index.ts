import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {registerAppResource, registerAppTool, RESOURCE_MIME_TYPE} from "@modelcontextprotocol/ext-apps/server"
import {readFile} from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {z} from "zod"
import {drawFromState, freshGame} from "./game.js"
import {judge} from "../widget/card.js"
import type {GameState} from "../shared/types.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const RESOURCE_URI = "ui://bingo/board"

// 単一盤面ポリシー（設計書 §9）。stateful HTTP 化（複数セッション分離）は Task 11。
let game: GameState | null = null

// GameState の zod スキーマ（raw shape は SDK が z.object() で自動ラップ）
const cellSchema = z.object({value: z.union([z.number(), z.literal("FREE")]), marked: z.boolean()})
const gameStateShape = {
	remain: z.array(z.number()),
	history: z.array(z.number()),
	card: z.array(z.array(cellSchema)),
}

const server = new McpServer({name: "bingo-mcp", version: "0.1.0"})

registerAppResource(server, RESOURCE_URI, RESOURCE_URI, {mimeType: RESOURCE_MIME_TYPE}, async () => {
	const html = await readFile(path.join(here, "../../dist/mcp-app.html"), "utf-8")
	return {contents: [{uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html}]}
})

registerAppTool(
	server,
	"start_bingo",
	{
		title: "ビンゴを開始",
		description: "ビンゴ盤面を開く。既存があれば再開、無ければ新規。",
		inputSchema: {mode: z.enum(["resume", "fresh"]).optional()},
		outputSchema: gameStateShape,
		_meta: {ui: {resourceUri: RESOURCE_URI}},
	},
	async ({mode}) => {
		const current = mode === "fresh" || game === null ? freshGame() : game
		game = current
		return {content: [{type: "text", text: "ビンゴ盤面を開きました。"}], structuredContent: current}
	},
)

registerAppTool(
	server,
	"sync_state",
	{
		title: "状態同期",
		description: "ウィジェットからゲーム状態を保存する（抽選/マークの度に呼ばれる）。",
		inputSchema: {state: z.object(gameStateShape)},
		outputSchema: gameStateShape,
		_meta: {ui: {resourceUri: RESOURCE_URI}},
	},
	async ({state}) => {
		const current = state as GameState
		game = current
		const latest = current.history.at(-1)
		return {content: [{type: "text", text: latest ? `抽選: ${latest}` : "同期しました。"}], structuredContent: current}
	},
)

registerAppTool(
	server,
	"reset_game",
	{
		title: "リセット",
		description: "ゲームを初期化する。",
		inputSchema: {},
		outputSchema: gameStateShape,
		_meta: {ui: {resourceUri: RESOURCE_URI}},
	},
	async () => {
		const current = freshGame()
		game = current
		return {content: [{type: "text", text: "リセットしました。"}], structuredContent: current}
	},
)

registerAppTool(
	server,
	"draw_number",
	{
		title: "番号を抽選",
		description: "次の番号を1つ抽選する（チャットからの「次引いて」用）。",
		inputSchema: {},
		outputSchema: gameStateShape,
		_meta: {ui: {resourceUri: RESOURCE_URI}},
	},
	async () => {
		const before = game ?? freshGame()
		if (before.remain.length === 0) {
			return {content: [{type: "text", text: "全て抽選済みです。"}], structuredContent: before}
		}
		const current = drawFromState(before)
		game = current
		const latest = current.history.at(-1)
		const {bingoLines, reachLines} = judge(current.card)
		const note = bingoLines.length ? " ビンゴ！" : reachLines.length ? ` リーチ ${reachLines.length}` : ""
		return {content: [{type: "text", text: `${latest} を抽選。${note}`.trim()}], structuredContent: current}
	},
)

await server.connect(new StdioServerTransport())
