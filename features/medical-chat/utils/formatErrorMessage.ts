// Format error messages for better user feedback

type Language = 'zh-TW' | 'en'

interface ErrorMapping {
  pattern: RegExp
  zh: string
  en: string
}

export function formatErrorMessage(error: Error | string, language: Language = 'zh-TW'): string {
  const message = typeof error === 'string' ? error : error.message
  
  // Map common errors to user-friendly messages with actionable advice
  // Order matters: more specific patterns should come first
  const errorMappings: ErrorMapping[] = [
    // Check for API key errors first (most common user error)
    {
      pattern: /401|unauthorized|authentication failed.*check.*api key|incorrect api key|invalid api key|invalid_api_key|api_key_invalid/i,
      zh: '🔑 **API Key 錯誤**\n\n您的 API key 可能無效或已過期。\n\n**解決方法：**\n1. 前往右側「設定」標籤\n2. 重新輸入正確的 API key\n3. 確認 key 沒有多餘的空格\n4. 如使用 OpenAI，key 應以 `sk-` 開頭\n5. 如使用 Gemini，key 應以 `AIza` 開頭',
      en: '🔑 **API Key Error**\n\nYour API key may be invalid or expired.\n\n**Solutions:**\n1. Go to the "Settings" tab on the right\n2. Re-enter the correct API key\n3. Make sure there are no extra spaces\n4. For OpenAI, key should start with `sk-`\n5. For Gemini, key should start with `AIza`'
    },
    {
      pattern: /rate limit|429/i,
      zh: '⏱️ **請求次數超過限制**\n\n您的 API 使用已達到速率限制。\n\n**解決方法：**\n1. 等待幾分鐘後再試\n2. 檢查您的 API 配額\n3. 考慮升級您的 API 方案',
      en: '⏱️ **Rate Limit Exceeded**\n\nYour API usage has reached the rate limit.\n\n**Solutions:**\n1. Wait a few minutes and try again\n2. Check your API quota\n3. Consider upgrading your API plan'
    },
    {
      pattern: /timeout|timed out/i,
      zh: '⏰ **請求逾時**\n\n伺服器回應時間過長。\n\n**解決方法：**\n1. 檢查網路連線\n2. 稍後再試\n3. 嘗試較短的問題',
      en: '⏰ **Request Timeout**\n\nThe server took too long to respond.\n\n**Solutions:**\n1. Check your network connection\n2. Try again later\n3. Try a shorter question'
    },
    {
      pattern: /network error|failed to fetch|fetch failed/i,
      zh: '🌐 **網路連線問題**\n\n無法連接到 AI 服務。\n\n**解決方法：**\n1. 檢查網路連線\n2. 確認防火牆設定\n3. 重新整理頁面\n4. 如果您有設定 API key，請確認 key 是否正確',
      en: '🌐 **Network Connection Issue**\n\nUnable to connect to AI service.\n\n**Solutions:**\n1. Check your network connection\n2. Check firewall settings\n3. Refresh the page\n4. If you have set an API key, verify it is correct'
    },
    {
      pattern: /service.*unavailable|500|502|503/i,
      zh: '🔧 **服務暫時無法使用**\n\nAI 服務目前無法回應。\n\n**解決方法：**\n1. 稍後再試\n2. 檢查服務狀態頁面\n3. 嘗試其他模型',
      en: '🔧 **Service Temporarily Unavailable**\n\nThe AI service is currently unavailable.\n\n**Solutions:**\n1. Try again later\n2. Check the service status page\n3. Try a different model'
    },
    {
      pattern: /quota|billing/i,
      zh: '💳 **配額或帳單問題**\n\n您的 API 配額可能已用完。\n\n**解決方法：**\n1. 檢查 API 帳戶餘額\n2. 確認付款方式有效\n3. 查看使用量統計',
      en: '💳 **Quota or Billing Issue**\n\nYour API quota may be exhausted.\n\n**Solutions:**\n1. Check your API account balance\n2. Verify payment method is valid\n3. Review usage statistics'
    },
    {
      pattern: /model.*not found|invalid model/i,
      zh: '🤖 **模型不可用**\n\n選擇的 AI 模型無法使用。\n\n**解決方法：**\n1. 前往「設定」選擇其他模型\n2. 確認您的 API key 有權限使用該模型\n3. 檢查模型名稱是否正確',
      en: '🤖 **Model Unavailable**\n\nThe selected AI model is not available.\n\n**Solutions:**\n1. Go to "Settings" to select another model\n2. Verify your API key has permission for this model\n3. Check the model name is correct'
    },
    {
      pattern: /content.*filtered|safety/i,
      zh: '🛡️ **內容安全過濾**\n\n您的請求或回應觸發了安全過濾。\n\n**解決方法：**\n1. 調整問題內容\n2. 避免敏感或不當內容\n3. 嘗試重新表述問題',
      en: '🛡️ **Content Safety Filter**\n\nYour request or response triggered a safety filter.\n\n**Solutions:**\n1. Adjust your question content\n2. Avoid sensitive or inappropriate content\n3. Try rephrasing your question'
    },
  ]
  
  // Check for known error patterns
  for (const mapping of errorMappings) {
    if (mapping.pattern.test(message)) {
      const friendlyMessage = language === 'zh-TW' ? mapping.zh : mapping.en
      return `⚠️ ${friendlyMessage}`
    }
  }
  
  // For unknown errors, provide a generic but helpful message
  const genericMessage = language === 'zh-TW'
    ? `**發生錯誤**\n\n${message}\n\n**建議：**\n1. 檢查網路連線\n2. 確認 API key 設定正確\n3. 重新整理頁面再試\n4. 如問題持續，請聯絡技術支援`
    : `**An Error Occurred**\n\n${message}\n\n**Suggestions:**\n1. Check network connection\n2. Verify API key is configured correctly\n3. Refresh the page and try again\n4. Contact support if the issue persists`
  
  return `⚠️ ${genericMessage}`
}
