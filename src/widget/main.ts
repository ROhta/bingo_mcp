import {App} from "@modelcontextprotocol/ext-apps"
import type {Card, GameState} from "../shared/types"
import {isValidCard, judge, markNumber} from "./card"
import {seedLocalStorage} from "./hydrate"
import {drawNext} from "./draw"
import NumberList from "@vendor/bingo/numberList"
import drumrollSound from "../../vendor/bingo/src/materials/drumroll.mp3"
import cymbalsSound from "../../vendor/bingo/src/materials/cymbals.mp3"

// チャット抽選の「溜め」時間（ドラムロール→数字公開）。
// レスポンス待ち中は鳴らす widget が未マウントで不可のため、widget 描画後に 2 秒確保する。
const REVEAL_DELAY_MS = 2000

let card: Card | null = null
let numberList: NumberList | null = null
let phase: "idle" | "rolling" = "idle" // ボタンの start/stop 状態
let suspending = false // チャット抽選の溜め演出中（ボタン操作を抑止）
let initialized = false // この widget インスタンスで初回の状態適用か
let generation = 0 // 状態適用の世代。進めると進行中の溜めタイマーのコールバックを無効化できる

// 音源は事前生成して使い回す（毎回 new Audio(data:URL) だと decode 遅延で鳴り出しが遅れる）
const drumrollAudio = new Audio(drumrollSound)
drumrollAudio.loop = true
const cymbalsAudio = new Audio(cymbalsSound)

const element = (id: string): HTMLElement => {
	const found = document.getElementById(id)
	if (!found) throw new Error(`missing element #${id}`)
	return found
}
const setStatus = (text: string): void => {
	element("status").textContent = text
}
const setLatest = (text: string): void => {
	element("latest").textContent = text
}
const setButtonLabel = (text: string): void => {
	element("draw").textContent = text
}

// ドラムロール = 抽選中の「溜め」。ループ再生し、任意に停止できる。
function startDrumroll(): void {
	drumrollAudio.currentTime = 0
	void drumrollAudio.play().catch(() => {})
}
function stopDrumroll(): void {
	drumrollAudio.pause()
	drumrollAudio.currentTime = 0
}
// シンバル = 数字が公開された瞬間（毎回）
function playCymbals(): void {
	cymbalsAudio.currentTime = 0
	void cymbalsAudio.play().catch(() => {})
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

function updateStatus(): void {
	if (!card) return
	const {bingoLines, reachLines} = judge(card)
	setStatus(bingoLines.length ? "ビンゴ！" : reachLines.length ? `リーチ ${reachLines.length}` : "")
}

/** state を盤面へ反映（演出なし）。localStorage 再シード＋NumberList 再生成。成否を返す。 */
function applyBoardState(state: GameState): boolean {
	if (!isValidCard(state.card)) {
		setStatus("盤面データが不正です")
		return false
	}
	try {
		seedLocalStorage({remain: state.remain, history: state.history})
	} catch (error) {
		setStatus("ゲーム状態の復元に失敗しました")
		console.error(error)
		return false
	}
	card = state.card
	numberList = new NumberList()
	renderBoard()
	updateStatus()
	return true
}

/** 最新番号のマークを伏せたカード（リビール前の溜め表示用）。 */
function withLatestUnmarked(source: Card, latest: number): Card {
	return source.map(column => column.map(cell => (cell.value === latest ? {...cell, marked: false} : cell)))
}

/** チャット抽選結果の widget: 溜め(ドラムロール)→数字公開(シンバル) の演出付きで反映。 */
/** 進行中の溜め/ロール状態を打ち切り、ボタンを idle に戻す（外部 state 適用時に整合性を保つ）。 */
function stopTransientUi(): void {
	generation++ // 保留中の溜めタイマーのコールバックを無効化
	suspending = false
	stopDrumroll()
	if (phase === "rolling") {
		phase = "idle"
		setButtonLabel("START")
	}
}

function revealWithSuspense(state: GameState): void {
	const latest = state.history.at(-1)
	if (latest === undefined || !isValidCard(state.card)) {
		if (applyBoardState(state)) setLatest("")
		return
	}
	const myGeneration = ++generation
	suspending = true
	// 溜め: 数字を「？」・最新マークを伏せて表示し、ドラムロールを鳴らす
	card = withLatestUnmarked(state.card, latest)
	try {
		seedLocalStorage({remain: state.remain, history: state.history})
	} catch (error) {
		console.error(error)
	}
	numberList = new NumberList()
	renderBoard()
	setStatus("")
	setLatest("？")
	startDrumroll()
	window.setTimeout(() => {
		if (myGeneration !== generation) return // 途中で別 state が来ていたら破棄（古い state を戻さない）
		stopDrumroll()
		suspending = false
		if (applyBoardState(state)) {
			// 本来の(マーク済み)状態へ。適用成功時のみ番号公開＋シンバル。
			setLatest(String(latest))
			playCymbals()
		}
	}, REVEAL_DELAY_MS)
}

const app = new App({name: "Bingo", version: "0.1.0"})

app.ontoolresult = result => {
	const state = result.structuredContent as GameState | undefined
	if (!state) return
	const firstMount = !initialized
	initialized = true
	// チャット「次引いて」(draw_number)で新規描画された widget は、履歴ありで初回マウント
	// → 溜め演出付きで公開。start_bingo(fresh)/reset/sync echo は演出なし。
	if (firstMount && state.history.length > 0 && phase === "idle") {
		revealWithSuspense(state)
		return
	}
	// それ以外(start_bingo / reset_game / sync echo)は、進行中の溜め/ロールを打ち切ってから反映し UI 整合性を保つ
	stopTransientUi()
	if (applyBoardState(state)) {
		const latest = state.history.at(-1)
		setLatest(latest !== undefined ? String(latest) : "")
	}
}

// ボタンは本家式 start/stop: 押す→ドラムロール(溜め)継続、もう一度→停止＆数字公開(シンバル)
element("draw").addEventListener("click", async () => {
	if (suspending || !numberList || !card) return

	if (phase === "idle") {
		if (numberList.remainList.length === 0) {
			setStatus("全て抽選済み")
			return
		}
		phase = "rolling"
		setButtonLabel("STOP")
		setLatest("？")
		startDrumroll()
		return
	}

	// rolling → 停止して抽選確定・公開
	phase = "idle"
	setButtonLabel("抽選")
	stopDrumroll()
	const drawn = drawNext(numberList)
	if (drawn === null) {
		setLatest("")
		setStatus("全て抽選済み")
		return
	}
	card = markNumber(card, drawn)
	setLatest(String(drawn))
	renderBoard()
	updateStatus()
	playCymbals()
	try {
		await app.callServerTool({
			name: "sync_state",
			arguments: {state: {remain: numberList.remainList, history: numberList.historyList, card}},
		})
	} catch (error) {
		setStatus("同期に失敗しました（ローカルは進行済み）")
		console.error(error)
	}
})

app.connect()
