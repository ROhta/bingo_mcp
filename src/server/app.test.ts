import {describe, expect, test} from "vitest"
import {Client} from "@modelcontextprotocol/sdk/client/index.js"
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js"
import {createBingoServer} from "./app"
import type {GameState} from "../shared/types"

// 1サーバーインスタンス＝1 MCP セッション（HTTP では transport ごとに本関数を呼ぶ）。
// プロセス内 transport で client と直結し、ツール入出力契約を検証する。
async function connectClient(): Promise<Client> {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	const client = new Client({name: "test", version: "0"})
	await Promise.all([client.connect(clientTransport), createBingoServer().connect(serverTransport)])
	return client
}

async function stateOf(result: Awaited<ReturnType<Client["callTool"]>>): Promise<GameState> {
	return result.structuredContent as GameState
}

describe("createBingoServer セッション分離", () => {
	test("インスタンスごとに盤面が独立し、互いの抽選に影響しない", async () => {
		const a = await connectClient()
		const b = await connectClient()

		await a.callTool({name: "start_bingo", arguments: {mode: "fresh"}})
		await a.callTool({name: "draw_number", arguments: {}})
		await a.callTool({name: "draw_number", arguments: {}})

		// B は別インスタンス。A が2回引いた後でも B の新規盤面は履歴空
		const bState = await stateOf(await b.callTool({name: "start_bingo", arguments: {mode: "fresh"}}))
		expect(bState.history).toEqual([])

		// A は独立に積み上がる（3回目）
		const aState = await stateOf(await a.callTool({name: "draw_number", arguments: {}}))
		expect(aState.history).toHaveLength(3)
		expect(aState.remain).toHaveLength(72)
	})

	test("同一インスタンスは resume で盤面を引き継ぐ", async () => {
		const a = await connectClient()
		await a.callTool({name: "start_bingo", arguments: {mode: "fresh"}})
		await a.callTool({name: "draw_number", arguments: {}})
		// 既定 resume: 既存チェックポイントを返す（履歴は消えない）
		const resumed = await stateOf(await a.callTool({name: "start_bingo", arguments: {}}))
		expect(resumed.history).toHaveLength(1)
	})
})
