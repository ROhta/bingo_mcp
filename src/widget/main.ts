import {App} from "@modelcontextprotocol/ext-apps"
import type {Card, GameState} from "../shared/types"
import {isValidCard, judge, markNumber} from "./card"
import {seedLocalStorage} from "./hydrate"
import {drawNext} from "./draw"
import NumberList from "@vendor/bingo/numberList"

let card: Card | null = null
let numberList: NumberList | null = null

const element = (id: string): HTMLElement => {
	const found = document.getElementById(id)
	if (!found) throw new Error(`missing element #${id}`)
	return found
}

const setStatus = (text: string): void => {
	element("status").textContent = text
}

function render(): void {
	if (!card) return
	const {bingoLines, reachLines} = judge(card)
	setStatus(bingoLines.length ? "ビンゴ！" : reachLines.length ? `リーチ ${reachLines.length}` : "")
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

/** server の GameState を受領してウィジェットへ反映する。Task 8 申し送り(検証・捕捉)を実装。 */
function loadState(state: GameState): void {
	if (!isValidCard(state.card)) {
		setStatus("盤面データが不正です")
		return
	}
	try {
		// 不正な remain/history は throw（黙って壊さない）。ここで必ず捕捉する。
		seedLocalStorage({remain: state.remain, history: state.history})
	} catch (error) {
		setStatus("ゲーム状態の復元に失敗しました")
		console.error(error)
		return
	}
	card = state.card
	numberList = new NumberList()
	render()
}

const app = new App({name: "Bingo", version: "0.1.0"})

// start_bingo / sync_state / reset_game の structuredContent でゲーム状態を受領
app.ontoolresult = result => {
	const state = result.structuredContent as GameState | undefined
	if (state) loadState(state)
}

element("draw").addEventListener("click", async () => {
	if (!numberList || !card) return
	const drawn = drawNext(numberList)
	if (drawn === null) {
		setStatus("全て抽選済み")
		return
	}
	card = markNumber(card, drawn)
	element("latest").textContent = String(drawn)
	render()
	// 抽選結果をサーバーのチェックポイントへ同期（RNG はウィジェット側=ここが真実）
	await app.callServerTool({
		name: "sync_state",
		arguments: {state: {remain: numberList.remainList, history: numberList.historyList, card}},
	})
})

app.connect()
