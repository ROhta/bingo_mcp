import NumberList from "@vendor/bingo/numberList"

/** 残りから1つ抽選して history へ移し、抽選番号を返す。残りが無ければ null。 */
export function drawNext(numberList: NumberList): number | null {
	const remain = numberList.remainList
	if (remain.length === 0) return null
	const index = numberList.generateRandomNumber(remain.length)
	const drawnNumber = remain[index]!
	numberList.remainList = remain.filter((_, i) => i !== index)
	numberList.historyList = [...numberList.historyList, drawnNumber]
	return drawnNumber
}
