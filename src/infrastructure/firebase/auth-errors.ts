// Firebase Authentication Error Handler
import { FirebaseError } from 'firebase/app'

export interface AuthErrorMessage {
  title: string
  message: string
}

/**
 * Convert Firebase Auth error to user-friendly message
 */
export function getAuthErrorMessage(error: unknown, language: 'en' | 'zh-TW' = 'zh-TW'): AuthErrorMessage {
  if (!(error instanceof FirebaseError)) {
    return {
      title: language === 'zh-TW' ? '發生錯誤' : 'Error',
      message: language === 'zh-TW' ? '發生未知錯誤，請稍後再試。' : 'An unknown error occurred. Please try again.',
    }
  }

  const errorMessages: Record<string, { zh: AuthErrorMessage; en: AuthErrorMessage }> = {
    // Email/Password errors
    'auth/email-already-in-use': {
      zh: {
        title: 'Email 已被使用',
        message: '此 Email 已經註冊過了。請直接登入，或使用其他 Email 註冊。',
      },
      en: {
        title: 'Email Already in Use',
        message: 'This email is already registered. Please sign in or use a different email.',
      },
    },
    'auth/invalid-email': {
      zh: {
        title: 'Email 格式錯誤',
        message: '請輸入有效的 Email 地址。',
      },
      en: {
        title: 'Invalid Email',
        message: 'Please enter a valid email address.',
      },
    },
    'auth/weak-password': {
      zh: {
        title: '密碼強度不足',
        message: '密碼至少需要 6 個字元。',
      },
      en: {
        title: 'Weak Password',
        message: 'Password should be at least 6 characters.',
      },
    },
    'auth/user-not-found': {
      zh: {
        title: '找不到使用者',
        message: '此 Email 尚未註冊。請先註冊帳號。',
      },
      en: {
        title: 'User Not Found',
        message: 'This email is not registered. Please sign up first.',
      },
    },
    'auth/wrong-password': {
      zh: {
        title: '密碼錯誤',
        message: '密碼不正確，請重新輸入。',
      },
      en: {
        title: 'Wrong Password',
        message: 'Incorrect password. Please try again.',
      },
    },
    'auth/invalid-credential': {
      zh: {
        title: '登入失敗',
        message: 'Email 或密碼不正確，請重新輸入。',
      },
      en: {
        title: 'Sign In Failed',
        message: 'Invalid email or password. Please try again.',
      },
    },
    'auth/too-many-requests': {
      zh: {
        title: '嘗試次數過多',
        message: '登入失敗次數過多，請稍後再試。',
      },
      en: {
        title: 'Too Many Requests',
        message: 'Too many failed attempts. Please try again later.',
      },
    },
    // Google Sign-in errors
    'auth/popup-closed-by-user': {
      zh: {
        title: '登入已取消',
        message: '您已關閉登入視窗。',
      },
      en: {
        title: 'Sign In Cancelled',
        message: 'You closed the sign-in window.',
      },
    },
    'auth/popup-blocked': {
      zh: {
        title: '彈窗被封鎖',
        message: '請允許瀏覽器彈窗，然後重試。',
      },
      en: {
        title: 'Popup Blocked',
        message: 'Please allow popups in your browser and try again.',
      },
    },
    'auth/account-exists-with-different-credential': {
      zh: {
        title: '帳號已存在',
        message: '此 Email 已經使用其他登入方式註冊。請使用原本的登入方式。',
      },
      en: {
        title: 'Account Exists',
        message: 'This email is already registered with a different sign-in method. Please use the original method.',
      },
    },
    // Network errors
    'auth/network-request-failed': {
      zh: {
        title: '網路錯誤',
        message: '網路連線失敗，請檢查網路連線後重試。',
      },
      en: {
        title: 'Network Error',
        message: 'Network connection failed. Please check your connection and try again.',
      },
    },
    // Other errors
    'auth/operation-not-allowed': {
      zh: {
        title: '登入方式未啟用',
        message: '此登入方式尚未啟用，請聯絡管理員。',
      },
      en: {
        title: 'Sign-in Method Disabled',
        message: 'This sign-in method is not enabled. Please contact the administrator.',
      },
    },
  }

  const errorCode = error.code
  const messages = errorMessages[errorCode]

  if (messages) {
    return language === 'zh-TW' ? messages.zh : messages.en
  }

  // Default error message
  return {
    title: language === 'zh-TW' ? '發生錯誤' : 'Error',
    message: language === 'zh-TW' 
      ? `發生錯誤：${error.message || '未知錯誤'}` 
      : `Error: ${error.message || 'Unknown error'}`,
  }
}
