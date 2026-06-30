// Firebase Configuration
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore'

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
let app: FirebaseApp
let auth: Auth
let db: Firestore

if (typeof window !== 'undefined') {
  // Client-side initialization
  if (!getApps().length) {
    app = initializeApp(firebaseConfig)
  } else {
    app = getApps()[0]
  }
  
  auth = getAuth(app)
  
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

export { app, auth, db }
