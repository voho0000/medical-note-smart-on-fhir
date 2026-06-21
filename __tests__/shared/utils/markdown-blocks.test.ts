import { splitMarkdownBlocks } from '@/src/shared/utils/markdown-blocks'

describe('splitMarkdownBlocks', () => {
  it('splits paragraphs on blank lines', () => {
    expect(splitMarkdownBlocks('para one\n\npara two')).toEqual(['para one', 'para two'])
  })

  it('keeps a fenced code block intact despite internal blank lines', () => {
    const md = 'before\n\n```js\nconst a = 1\n\nconst b = 2\n```\n\nafter'
    expect(splitMarkdownBlocks(md)).toEqual([
      'before',
      '```js\nconst a = 1\n\nconst b = 2\n```',
      'after',
    ])
  })

  it('keeps a GFM table as a single block (no internal blank lines)', () => {
    const table = '| a | b |\n| - | - |\n| 1 | 2 |'
    expect(splitMarkdownBlocks(`intro\n\n${table}`)).toEqual(['intro', table])
  })

  it('collapses multiple blank lines and trims', () => {
    expect(splitMarkdownBlocks('a\n\n\n\nb\n\n')).toEqual(['a', 'b'])
  })

  it('returns a single block when there are no blank lines', () => {
    const list = '- one\n- two\n- three'
    expect(splitMarkdownBlocks(list)).toEqual([list])
  })

  it('treats an unterminated fence (mid-stream) as one trailing block', () => {
    // While a code block is still streaming the closing ``` hasn't arrived yet.
    const md = 'intro\n\n```js\nconst a ='
    expect(splitMarkdownBlocks(md)).toEqual(['intro', '```js\nconst a ='])
  })

  it('returns [] for empty input', () => {
    expect(splitMarkdownBlocks('')).toEqual([])
    expect(splitMarkdownBlocks('   \n\n  ')).toEqual([])
  })
})
