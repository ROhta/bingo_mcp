import {generateCard, markNumber} from "../widget/card.js"
import type {GameState} from "../shared/types.js"

/** 新規ゲームの初期状態（remain=1..75, history=空, 新しい5×5カード）。 */
export function freshGame(): GameState {
	return {
		remain: Array.from({length: 75}, (_, index) => index + 1),
		history: [],
		card: generateCard(),
	}
}

/**
 * チェックポイント上で1つ抽選する純関数（チャット駆動 draw_number 用）。
 * 残りが空ならそのまま返す（同一参照）。引いた番号はカードにあればマークする。
 * RNG はウィジェットの NumberList と等価（crypto による一様乱数）。
 */
export function drawFromState(game: GameState): GameState {
	if (game.remain.length === 0) return game
	const buffer = new Uint32Array(1)
	crypto.getRandomValues(buffer)
	const index = Math.floor(((buffer[0] ?? 0) / 2 ** 32) * game.remain.length)
	const drawn = game.remain[index]!
	return {
		remain: game.remain.filter((_, i) => i !== index),
		history: [...game.history, drawn],
		card: markNumber(game.card, drawn),
	}
}
