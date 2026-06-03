import {App} from "@modelcontextprotocol/ext-apps"
import type {Card, GameState} from "../shared/types"
import {isValidCard, judge, markNumber} from "./card"
import {seedLocalStorage} from "./hydrate"
import {drawNext} from "./draw"
import NumberList from "@vendor/bingo/numberList"
import drumrollSound from "../../vendor/bingo/src/materials/drumroll.mp3"
import cymbalsSound from "../../vendor/bingo/src/materials/cymbals.mp3"

let card: Card | null = null
let numberList: NumberList | null = null
let drawing = false // 抽選→同期の往復中フラグ（連打抑止）
let lastHistoryLength = 0
let initialized = false // 初回描画(起動/resume)では演出を鳴らさない

const element = (id: string): HTMLElement => {
	const found = document.getElementById(id)
	if (!found) throw new Error(`missing element #${id}`)
	return found
}

const setStatus = (text: string): void => {
	element("status").textContent = text
}

function playSound(dataUrl: string): void {
	// play() は失敗時に同期 throw でなく Promise を reject する（自動再生制限/CSP 等）。
	// 未処理 rejection を避けるため必ず .catch() で握る。演出失敗はゲーム進行に影響させない。
	void new Audio(dataUrl).play().catch(() => {})
}

function renderBoard(): void {
	if (!card) return
	const board = element("board")
	board.replaceChildren()
	for (const column of card) {
		const row = document.createElement("div")
		for (const cell of column) {
			const span = document.createElement("span")
			span.className = cell.marked ? "cell marked" : "cell"
			span.textContent = String(cell.value)
			row.appendChild(span)
		}
		board.appendChild(row)
	}
}

/**
 * サーバー/ローカル双方の GameState を反映する単一経路。
 * - card 形状検証＋hydrate throw 捕捉（不正 state で render を殺さない）
 * - history が伸びた時だけ演出（drumroll / ビンゴ時 cymbals）。echo 再描画では鳴らさない。
 */
function applyState(state: GameState): void {
	if (!isValidCard(state.card)) {
		setStatus("盤面データが不正です")
		return
	}
	try {
		seedLocalStorage({remain: state.remain, history: state.history})
	} catch (error) {
		setStatus("ゲーム状態の復元に失敗しました")
		console.error(error)
		return
	}
	const grew = initialized && state.history.length > lastHistoryLength
	lastHistoryLength = state.history.length
	initialized = true
	card = state.card
	numberList = new NumberList()
	const {bingoLines, reachLines} = judge(card)
	setStatus(bingoLines.length ? "ビンゴ！" : reachLines.length ? `リーチ ${reachLines.length}` : "")
	// history が空(fresh/reset)なら前回の番号が残らないよう明示的にクリアする
	const latest = state.history.at(-1)
	element("latest").textContent = latest !== undefined ? String(latest) : ""
	renderBoard()
	if (grew) playSound(bingoLines.length ? cymbalsSound : drumrollSound)
}

const app = new App({name: "Bingo", version: "0.1.0"})

// start_bingo / sync_state / reset_game / draw_number の structuredContent を反映
app.ontoolresult = result => {
	const state = result.structuredContent as GameState | undefined
	if (state) applyState(state)
}

// ウィジェットのボタンは NumberList でローカル抽選（＝忠実な再利用の主経路）→ サーバーへ同期
element("draw").addEventListener("click", async () => {
	if (drawing || !numberList || !card) return
	const drawn = drawNext(numberList)
	if (drawn === null) {
		setStatus("全て抽選済み")
		return
	}
	drawing = true
	const newState: GameState = {
		remain: numberList.remainList,
		history: numberList.historyList,
		card: markNumber(card, drawn),
	}
	applyState(newState) // 描画＋演出（history が伸びる）
	try {
		await app.callServerTool({name: "sync_state", arguments: {state: newState}})
	} catch (error) {
		setStatus("同期に失敗しました（ローカルは進行済み）")
		console.error(error)
	} finally {
		drawing = false
	}
})

app.connect()
