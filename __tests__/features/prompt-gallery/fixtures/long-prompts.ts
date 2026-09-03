/** Synthetic instructions only; no patient data. The tail catches truncation. */
export function makeLongPrompt(length: number, singleLine = false): string {
  const start = singleLine ? 'PROMPT_START🩺' : 'PROMPT_START🩺\n'
  const end = singleLine ? 'PROMPT_END完整結尾🧬' : '\nPROMPT_END完整結尾🧬'
  const block = singleLine ? '中文English0123456789' : [
    '## 臨床摘要 / Clinical summary',
    '- 請保留數值、來源與日期。Do not infer missing information.',
    '| 項目 | 來源 |',
    '| --- | --- |',
    '| 待確認資料 | 原始文件 |',
    '<section><p>Preserve & compare the available findings.</p></section>',
    '',
  ].join('\n')
  const bodyLength = length - start.length - end.length
  return start + block.repeat(Math.ceil(bodyLength / block.length)).slice(0, bodyLength) + end
}

export const LONG_PROMPT_CASES = [
  { name: '8,001 characters', length: 8001, singleLine: false, format: 'plain-text' },
  { name: '20,000 mixed Chinese/English characters', length: 20000, singleLine: false, format: 'markdown' },
  { name: '100,000 characters with Markdown and HTML', length: 100000, singleLine: false, format: 'html' },
  { name: '100,000 characters without line breaks', length: 100000, singleLine: true, format: 'plain-text' },
] as const
