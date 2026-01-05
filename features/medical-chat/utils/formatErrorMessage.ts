// Format error messages for better user feedback

export function formatErrorMessage(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message
  
  // Map common errors to user-friendly messages with actionable advice
  const errorMappings: Array<{ pattern: RegExp; message: string }> = [
    {
      pattern: /authentication failed|api key|unauthorized|401/i,
      message: '🔑 **API Key 錯誤**\n\n您的 API key 可能無效或已過期。\n\n**解決方法：**\n1. 前往右側「設定」標籤\n2. 重新輸入正確的 API key\n3. 確認 key 沒有多餘的空格\n4. 如使用 OpenAI，key 應以 `sk-` 開頭\n5. 如使用 Gemini，key 應以 `AIza` 開頭'
    },
    {
      pattern: /rate limit|429/i,
      message: '⏱️ **請求次數超過限制**\n\n您的 API 使用已達到速率限制。\n\n**解決方法：**\n1. 等待幾分鐘後再試\n2. 檢查您的 API 配額\n3. 考慮升級您的 API 方案'
    },
    {
      pattern: /timeout|timed out/i,
      message: '⏰ **請求逾時**\n\n伺服器回應時間過長。\n\n**解決方法：**\n1. 檢查網路連線\n2. 稍後再試\n3. 嘗試較短的問題'
    },
    {
      pattern: /network error|failed to fetch|fetch failed/i,
      message: '🌐 **網路連線問題**\n\n無法連接到 AI 服務。\n\n**解決方法：**\n1. 檢查網路連線\n2. 確認防火牆設定\n3. 重新整理頁面\n4. 檢查 Firebase proxy 是否正常運作'
    },
    {
      pattern: /service.*unavailable|500|502|503/i,
      message: '🔧 **服務暫時無法使用**\n\nAI 服務目前無法回應。\n\n**解決方法：**\n1. 稍後再試\n2. 檢查服務狀態頁面\n3. 嘗試其他模型'
    },
    {
      pattern: /quota|billing/i,
      message: '💳 **配額或帳單問題**\n\n您的 API 配額可能已用完。\n\n**解決方法：**\n1. 檢查 API 帳戶餘額\n2. 確認付款方式有效\n3. 查看使用量統計'
    },
    {
      pattern: /model.*not found|invalid model/i,
      message: '🤖 **模型不可用**\n\n選擇的 AI 模型無法使用。\n\n**解決方法：**\n1. 前往「設定」選擇其他模型\n2. 確認您的 API key 有權限使用該模型\n3. 檢查模型名稱是否正確'
    },
    {
      pattern: /content.*filtered|safety/i,
      message: '🛡️ **內容安全過濾**\n\n您的請求或回應觸發了安全過濾。\n\n**解決方法：**\n1. 調整問題內容\n2. 避免敏感或不當內容\n3. 嘗試重新表述問題'
    },
  ]
  
  // Check for known error patterns
  for (const { pattern, message: friendlyMessage } of errorMappings) {
    if (pattern.test(message)) {
      return `⚠️ ${friendlyMessage}`
    }
  }
  
  // For unknown errors, provide a generic but helpful message
  return `⚠️ **發生錯誤**\n\n${message}\n\n**建議：**\n1. 檢查網路連線\n2. 確認 API key 設定正確\n3. 重新整理頁面再試\n4. 如問題持續，請聯絡技術支援`
}
