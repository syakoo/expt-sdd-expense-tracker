const YEN_NUMBER_FORMAT = new Intl.NumberFormat('ja-JP')

/** 金額を桁区切りし、末尾に「円」を付ける（例：1234 → `1,234円`） */
export function formatYen(amount: number): string {
  return `${YEN_NUMBER_FORMAT.format(amount)}円`
}

/** `YYYY-MM-DD` を `YYYY/MM/DD` にする */
export function formatReceiptDate(date: string): string {
  return date.replaceAll('-', '/')
}
