import { applyTemplateVariables, extractTemplateVariables, missingTemplateVariables } from '@/features/prompt-gallery/utils/template-variables.utils'

it('finds curly and square placeholders once each, ignoring links, numbers and list markers', () => {
  const prompt = [
    '我剛開立了 {{藥物名稱}}。請生成 [目標讀者] 看得懂的衛教，再提一次 {{ 藥物名稱 }} 的副作用。',
    '參考 [指引](https://example.org) 與 [1] 的建議；勾選 [x] 已完成。',
    '交互作用：我打算開立 [新開藥物名稱]',
  ].join('\n')
  expect(extractTemplateVariables(prompt)).toEqual([
    { name: '藥物名稱', tokens: ['{{藥物名稱}}', '{{ 藥物名稱 }}'] },
    { name: '目標讀者', tokens: ['[目標讀者]'] },
    { name: '新開藥物名稱', tokens: ['[新開藥物名稱]'] },
  ])
  expect(extractTemplateVariables('沒有變數的範本')).toEqual([])
})

it('substitutes filled values everywhere and leaves empty ones untouched', () => {
  const prompt = '開立 {{藥物名稱}} 給 [目標讀者]，再說明 {{ 藥物名稱 }}。'
  expect(applyTemplateVariables(prompt, { 藥物名稱: 'Apixaban 5 mg' })).toBe('開立 Apixaban 5 mg 給 [目標讀者]，再說明 Apixaban 5 mg。')
  expect(applyTemplateVariables(prompt, { 藥物名稱: '  ', 目標讀者: '家屬' })).toBe('開立 {{藥物名稱}} 給 家屬，再說明 {{ 藥物名稱 }}。')
  expect(missingTemplateVariables({ 藥物名稱: 'x' }, extractTemplateVariables(prompt))).toEqual(['目標讀者'])
})
