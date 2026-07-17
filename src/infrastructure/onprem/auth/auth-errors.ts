export interface AuthErrorMessage {
  title: string
  message: string
}

export function getAuthErrorMessage(
  _error: unknown,
  language: 'en' | 'zh-TW' = 'zh-TW',
): AuthErrorMessage {
  return language === 'zh-TW'
    ? { title: '登入功能已停用', message: '此全地端版本不使用 MediPrisma 帳號登入。' }
    : { title: 'Sign-in disabled', message: 'This on-premises build does not use MediPrisma account sign-in.' }
}
