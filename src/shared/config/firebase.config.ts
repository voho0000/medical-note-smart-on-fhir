// Firebase Configuration
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore'
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check'

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Initialize Firebase (only once)
let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined
let appCheck: AppCheck | undefined

if (typeof window !== 'undefined') {
  // Client-side initialization
  if (!getApps().length) {
    app = initializeApp(firebaseConfig)
  } else {
    app = getApps()[0]
  }
  
  // Firebase's getAuth() prefers IndexedDB persistence. Since Firebase Auth
  // 1.13.4, hiding a tab closes that database immediately; an initialization
  // write still in flight can then reject with "Database is closing/hidden"
  // and surface as an unhandled runtime error. We already want durable browser
  // sign-in, so choose localStorage explicitly (sessionStorage is the fallback)
  // and avoid the IndexedDB page-visibility race altogether.
  try {
    auth = initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  } catch (error) {
    // Fast Refresh can re-evaluate this module after Auth was initialized with
    // the same Firebase app. Reuse that instance; a full reload will apply the
    // explicit non-IndexedDB persistence list above.
    if ((error as { code?: string })?.code !== 'auth/already-initialized') throw error
    auth = getAuth(app)
  }
  
  // Set language to user's preferred language
  auth.languageCode = 'zh-TW'
  
  // Use named database 'mediprisma'.
  //
  // experimentalAutoDetectLongPolling: Firestore's default realtime transport
  // is a long-lived WebChannel stream, which hospital proxies / corporate
  // firewalls frequently break (symptom: "WebChannelConnection RPC 'Listen'
  // transport errored", offline fallback). Auto-detect probes that connection
  // and transparently falls back to HTTPS long-polling when streaming doesn't
  // work — keeping streaming's speed where the network allows it. Important
  // for in-hospital (VGH) deployments behind restrictive networks.
  try {
    db = initializeFirestore(
      app,
      { experimentalAutoDetectLongPolling: true },
      'mediprisma',
    )
  } catch {
    // Already initialized (e.g. Fast Refresh re-evaluated this module) — reuse
    // the existing instance rather than throwing.
    db = getFirestore(app, 'mediprisma')
  }

  // E2E only: route auth + firestore to the local emulators so the full
  // anonymous-sign-in -> ID-token -> proxy-auth chain (and the security rules)
  // can be exercised without touching production. Gated by an explicit env flag
  // so it can NEVER activate on a real deploy. See playwright.emulated.config.ts.
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1') {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      connectFirestoreEmulator(db, '127.0.0.1', 8080)
    } catch {
      // Already connected (Fast Refresh re-evaluated this module).
    }
  }

}

/**
 * Initialize App Check only when a proxy request actually needs a token.
 *
 * ReCaptchaV3Provider appends a hidden placeholder to document.body. Doing
 * that while React is still hydrating changes the server-rendered DOM; React
 * then rebuilds the body and removes the placeholder before reCAPTCHA renders,
 * causing both a hydration mismatch and "placeholder element" runtime error.
 */
export async function getOrInitializeAppCheck(): Promise<AppCheck | undefined> {
  const appCheckSiteKey = process.env.NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY
  if (
    typeof window === 'undefined'
    || !app
    || process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1'
    || !appCheckSiteKey
  ) {
    return undefined
  }
  if (appCheck) return appCheck

  const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG
  if (debugToken) {
    ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken
  }

  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch {
    appCheck = undefined
  }
  return appCheck
}

export { app, auth, db, appCheck }
