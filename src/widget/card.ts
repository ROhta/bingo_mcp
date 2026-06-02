import {Card, Cell, COLUMN_RANGES, Judgement, Line} from "../shared/types.js"

function pickFiveDistinct(min: number, max: number): number[] {
	const pool = Array.from({length: max - min + 1}, (_, i) => min + i)
	for (let i = pool.length - 1; i > 0; i--) {
		const buf = new Uint32Array(1)
		crypto.getRandomValues(buf)
		const j = Math.floor(((buf[0] ?? 0) / 2 ** 32) * (i + 1))
		;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
	}
	return pool.slice(0, 5)
}

/** 各列レンジから重複なく5個。中央(列2,行2)は FREE(初期 marked)。 */
export function generateCard(): Card {
	return COLUMN_RANGES.map(([min, max], col) =>
		pickFiveDistinct(min, max).map((value, row) =>
			col === 2 && row === 2 ? {value: "FREE" as const, marked: true} : {value, marked: false},
		),
	)
}

/** 抽選番号に一致するセルを marked=true にした新しいカードを返す（不変更新）。 */
export function markNumber(card: Card, drawnNumber: number): Card {
	return card.map(col => col.map(cell => (cell.value === drawnNumber ? {...cell, marked: true} : cell)))
}

/** 判定対象の全12ライン（5行 + 5列 + 2対角）。index は型で 0..4 / 0|1 に縛られる。 */
const ALL_LINES: Line[] = [
	...([0, 1, 2, 3, 4] as const).map(index => ({kind: "row" as const, index})),
	...([0, 1, 2, 3, 4] as const).map(index => ({kind: "col" as const, index})),
	{kind: "diag" as const, index: 0},
	{kind: "diag" as const, index: 1},
]

/** ライン上の5セルを取り出す（plumbing）。 */
export function lineCells(card: Card, line: Line): Cell[] {
	if (line.kind === "row") return card.map(col => col[line.index]!)
	if (line.kind === "col") return card[line.index]!
	return line.index === 0 ? card.map((col, i) => col[i]!) : card.map((col, i) => col[4 - i]!)
}

/**
 * カードを判定する。マーク状態のみを見る（FREE は初期 marked）。
 * - bingo: 1ライン(行/列/対角)が全マーク(5/5)
 * - reach: あと1つで成立(ちょうど4/5マーク)
 */
export function judge(card: Card): Judgement {
	const bingoLines: Line[] = []
	const reachLines: Line[] = []
	for (const line of ALL_LINES) {
		const markedCount = lineCells(card, line).filter(cell => cell.marked).length
		if (markedCount === 5) bingoLines.push(line)
		else if (markedCount === 4) reachLines.push(line)
	}
	return {bingoLines, reachLines}
}

/**
 * 信頼境界の検証: 値が 5×5 の Card 形状か（不正な server state で judge/lineCells が crash しないように）。
 * Task 8: ウィジェットが server の state.card を受領する箇所で使う。
 */
export function isValidCard(value: unknown): value is Card {
	return (
		Array.isArray(value) &&
		value.length === 5 &&
		value.every(
			col =>
				Array.isArray(col) &&
				col.length === 5 &&
				col.every(cell => {
					if (typeof cell !== "object" || cell === null) return false
					const candidate = cell as {value?: unknown; marked?: unknown}
					return (typeof candidate.value === "number" || candidate.value === "FREE") && typeof candidate.marked === "boolean"
				}),
		)
	)
}
