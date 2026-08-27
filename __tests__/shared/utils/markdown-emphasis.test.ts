import { normalizeMarkdownEmphasisBoundaries } from '@/src/shared/utils/markdown-emphasis'

describe('normalizeMarkdownEmphasisBoundaries', () => {
  it('moves trailing punctuation outside malformed bold labels without changing visible text', () => {
    expect(normalizeMarkdownEmphasisBoundaries('**日期：**肌酸酐')).toBe('**日期**：肌酸酐')
    expect(normalizeMarkdownEmphasisBoundaries('**Label:**value')).toBe('**Label**:value')
    expect(normalizeMarkdownEmphasisBoundaries('__日期：__肌酸酐')).toBe('__日期__：肌酸酐')
  })

  it('leaves valid emphasis unchanged', () => {
    expect(normalizeMarkdownEmphasisBoundaries('**日期：** 肌酸酐')).toBe('**日期：** 肌酸酐')
    expect(normalizeMarkdownEmphasisBoundaries('**日期**：肌酸酐')).toBe('**日期**：肌酸酐')
  })

  it('does not rewrite escaped markers, inline code, or fenced code', () => {
    const markdown = [
      String.raw`\**日期：**肌酸酐`,
      '`**日期：**肌酸酐`',
      '```md',
      '**日期：**肌酸酐',
      '```',
      '~~~',
      '__日期：__肌酸酐',
      '~~~',
    ].join('\n')

    expect(normalizeMarkdownEmphasisBoundaries(markdown)).toBe(markdown)
  })

  it('preserves multiline code spans while repairing prose after them', () => {
    const markdown = [
      '`code starts',
      '**日期：**肌酸酐',
      'code ends`',
      '**日期：**肌酸酐',
    ].join('\n')

    expect(normalizeMarkdownEmphasisBoundaries(markdown)).toBe([
      '`code starts',
      '**日期：**肌酸酐',
      'code ends`',
      '**日期**：肌酸酐',
    ].join('\n'))
  })
})
