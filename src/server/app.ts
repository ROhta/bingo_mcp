import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {registerAppResource, registerAppTool, RESOURCE_MIME_TYPE} from "@modelcontextprotocol/ext-apps/server"
import {readFile} from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {z} from "zod"
import {describeDraw, drawFromState, freshGame} from "./game.js"
import type {GameState} from "../shared/types.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const RESOURCE_URI = "ui://bingo/board"

// GameState の zod スキーマ（raw shape は SDK が z.object() で自動ラップ）
const cellSchema = z.object({value: z.union([z.number(), z.literal("FREE")]), marked: z.boolean()})
const gameStateShape = {
	remain: z.array(z.number()),
	history: z.array(z.number()),
	card: z.array(z.array(cellSchema)),
}

/**
 * ビンゴ MCP サーバーを1つ生成する。盤面状態 game は本インスタンスのクロージャに閉じる。
 * McpServer↔transport は 1:1（protocol.connect が単一参照を持つ）ため、
 * stdio は本関数を1回・HTTP は MCP セッションごとに呼ぶ。これにより「1セッション1盤面」が
 * 共有 Map 無しで closure に成立する（設計書 §9 単一盤面 / §10 セッション単位 state）。
 */
export function createBingoServer(): McpServer {
	// 単一盤面ポリシー（設計書 §9）。HTTP では各セッションが本クロージャを独立して持つ。
	let game: GameState | null = null
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
			description:
				"次の番号を1つ抽選する（チャットからの「次引いて」用）。引いた番号はカードにあれば自動でマークされる。ユーザーにタップを促さず、戻り文（カードにあったか・リーチ/ビンゴ）をそのまま伝えること。",
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
			const drawn = current.history.at(-1)!
			return {content: [{type: "text", text: describeDraw(current.card, drawn)}], structuredContent: current}
		},
	)

	return server
}
