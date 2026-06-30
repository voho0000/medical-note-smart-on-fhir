/**
 * Seed Script for Prompt Gallery (sharedPrompts collection)
 *
 * 用途：把「起始模板」寫進 Firestore，讓 Prompt Gallery 一開箱就有現成模板可套用。
 *
 * firestore.rules 要求：寫入 sharedPrompts 必須是「登入的真實使用者」，且
 * authorId == 自己的 uid、usageCount == 0。所以本腳本會先用 owner 帳號登入。
 *
 * 使用方式（由 owner 本人執行，會寫入線上資料）：
 *   1. 設定環境變數（.env.local 已有 NEXT_PUBLIC_FIREBASE_*；另加這兩個）：
 *        SEED_EMAIL=你的owner登入email
 *        SEED_PASSWORD=你的密碼
 *      （可選）SEED_AUTHOR_NAME=顯示的作者名（預設 "MediPrisma"）
 *   2. 執行：
 *        node --env-file=.env.local --loader ts-node/esm scripts/seed-prompts.ts
 *
 * 預設只 seed「民眾版（patient）」起始模板 —— 醫療版假設線上已存在（當初已 seed），
 * 重複 seed 會產生重複資料。使用確定性的 doc id + setDoc，所以可安全重跑（upsert）。
 */

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, doc, setDoc, Timestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
// This project uses a NAMED Firestore database "mediprisma", not "(default)".
// Targeting the default DB 404s ("database (default) does not exist").
const db = getFirestore(app, 'mediprisma')

interface SeedPrompt {
  id: string
  title: string
  description: string
  prompt: string
  types: ('chat' | 'insight')[]
  category: string
  specialty: string[]
  audience: ('medical' | 'patient')[]
  tags: string[]
}

// 通用安全語：每個民眾版 prompt 都帶上，確保 AI 不會叫病人自行調藥、且鼓勵與醫療團隊確認。
const PATIENT_SAFETY_NOTE =
  '\n\n（重要：以上內容僅供參考與衛教，實際判斷請以您的醫療團隊為準；' +
  '請勿自行開始、停止或調整任何藥物，任何調整都請先與您的醫師或藥師確認。）'

// ─────────────────────────────────────────────────────────────────────────
// 民眾版（patient）起始模板 — 白話、提醒回哪科追蹤、衛教，不叫病人自行調藥
// ─────────────────────────────────────────────────────────────────────────
const patientPrompts: SeedPrompt[] = [
  {
    id: 'patient-explain-labs',
    title: '用白話解釋我的檢驗報告',
    description: '挑出異常值、用日常語言說明可能意義、建議回哪一科追蹤',
    prompt:
      '請用白話、好懂的方式解釋我的檢驗報告：\n\n' +
      '1. 哪些數值正常、哪些偏高或偏低\n' +
      '2. 偏離正常的項目「可能」代表什麼（用日常語言，必要時用括號簡單解釋醫學名詞）\n' +
      '3. 哪些項目建議回哪一科進一步追蹤\n\n' +
      '請避免艱深術語，重點放在我看得懂、用得上。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'summary',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '檢驗報告'],
  },
  {
    id: 'patient-admission-for-family',
    title: '這次住院重點（給家屬看）',
    description: '用平易語言摘要本次住院的原因、治療與出院後注意事項',
    prompt:
      '請用平易近人的語言，為家屬整理我這次住院的重點：\n\n' +
      '1. 為什麼住院（主要的問題是什麼）\n' +
      '2. 住院期間做了哪些檢查與治療\n' +
      '3. 出院時的狀況如何\n' +
      '4. 回家後要特別注意什麼、大約何時回診\n\n' +
      '請避免醫學術語，必要時用括號簡單說明。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'summary',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '住院', '家屬'],
  },
  {
    id: 'patient-medication-info',
    title: '我的用藥說明與注意事項',
    description: '每種藥在治什麼、常見副作用要留意什麼、服用注意事項',
    prompt:
      '請用白話說明我目前的用藥：\n\n' +
      '1. 每種藥大概是用來做什麼的\n' +
      '2. 常見、需要留意的副作用有哪些\n' +
      '3. 服用時要注意什麼（例如飯前/飯後、要避免與什麼一起吃）\n\n' +
      '請用條列、好閱讀的方式呈現。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'other',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '用藥'],
  },
  {
    id: 'patient-which-specialty',
    title: '我應該回哪些科追蹤？',
    description: '依目前診斷列出建議追蹤的專科與大概時間',
    prompt:
      '依我目前的診斷與健康問題，請建議：\n\n' +
      '1. 我應該回哪些專科門診追蹤（例如腎臟問題→腎臟科、心臟問題→心臟科）\n' +
      '2. 大致建議的回診時間（若資料中已有醫師指示，請以醫師指示為準）\n' +
      '3. 回診前可以先準備或記錄的事項\n\n' +
      '這是一般性建議，實際請依您的主治醫師安排。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'other',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '回診', '追蹤'],
  },
  {
    id: 'patient-questions-for-doctor',
    title: '看診前的提問清單',
    description: '幫我整理下次回診可以問醫師的問題',
    prompt:
      '請依我的狀況，幫我整理一份「下次看診可以問醫師」的問題清單，涵蓋：\n\n' +
      '1. 對目前診斷與病情的疑問\n' +
      '2. 用藥相關（效果、副作用、能不能調整 —— 由醫師決定）\n' +
      '3. 生活、飲食、後續追蹤相關\n\n' +
      '請用簡單、口語的方式條列，讓我可以直接拿去問。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'other',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '看診', '溝通'],
  },
  {
    id: 'patient-lifestyle-diet',
    title: '生活與飲食可以注意什麼',
    description: '針對我的狀況給一般性的飲食、作息、運動建議（非醫囑）',
    prompt:
      '針對我目前的健康狀況，請給一般性的生活與飲食建議：\n\n' +
      '1. 飲食上可以多注意什麼（份量、種類、要少吃的）\n' +
      '2. 作息、運動、壓力管理\n' +
      '3. 哪些習慣對我的狀況特別重要\n\n' +
      '請用白話、可執行的方式說明。若您有特殊飲食限制或正在控制特定疾病，請以醫療團隊指示為準。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'other',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '飲食', '生活型態'],
  },
  // ── 衛教模板 ①：警訊與就醫時機（實證上有助於減少再住院）──
  {
    id: 'patient-warning-signs',
    title: '警訊與就醫時機',
    description: '用紅綠燈分類：哪些症狀要立刻急診、哪些儘快回診、哪些下次再提',
    prompt:
      '依我目前的診斷，請用「紅綠燈」方式幫我整理警訊與就醫時機，並用白話描述具體症狀：\n\n' +
      '🔴 立刻掛急診或打 119：（列出與我狀況相關的危險警訊，例如突然胸痛、呼吸困難、意識改變、嚴重出血、肢體無力等）\n' +
      '🟡 儘快回診或打電話給診間：（需要盡快處理、但非立即危及生命的變化）\n' +
      '🟢 下次回診再提即可：（輕微、可先觀察的變化）\n\n' +
      '若無法確定屬於哪一類，請寧可提早就醫。緊急狀況請直接撥打 119 或前往急診。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'safety',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '警訊', '就醫時機'],
  },
  // ── 衛教模板 ②：自我照護與監測（慢性病自我管理核心）──
  {
    id: 'patient-self-care-monitoring',
    title: '我的自我照護與監測計畫',
    description: '依我的狀況規劃每天/每週該自己量什麼、怎麼記錄、何時找醫師',
    prompt:
      '依我的慢性病或目前狀況，請幫我規劃簡單、可執行的自我照護與監測計畫：\n\n' +
      '1. 每天 / 每週我應該自己量或記錄什麼（例如血壓、血糖、體重、症狀變化）\n' +
      '2. 怎麼記錄、多久回顧一次\n' +
      '3. 哪些數值或變化要主動跟醫師討論\n' +
      '4. 搭配的生活習慣重點\n\n' +
      '請用白話、條列、好執行的方式說明。數值目標與用藥請以您的醫師為準。' +
      PATIENT_SAFETY_NOTE,
    types: ['chat'],
    category: 'other',
    specialty: ['general'],
    audience: ['patient'],
    tags: ['衛教', '民眾版', '自我照護', '自我監測'],
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 醫療版（medical）起始模板 — schema 已修正（types[] + audience[]）。
// 假設線上已存在，預設「不」再 seed（避免重複）；新環境要 seed 可改 promptsToSeed。
// ─────────────────────────────────────────────────────────────────────────
const medicalPrompts: SeedPrompt[] = [
  {
    id: 'medical-soap',
    title: 'SOAP 筆記範本',
    description: '標準 SOAP 格式的病歷筆記',
    prompt:
      '請根據病人資料撰寫 SOAP 筆記：\n\n' +
      'Subjective (主訴):\n- \n\nObjective (客觀發現):\n- \n\n' +
      'Assessment (評估):\n- \n\nPlan (計畫):\n- ',
    types: ['chat'],
    category: 'soap',
    specialty: ['general', 'internal'],
    audience: ['medical'],
    tags: ['基礎', '通用', 'SOAP'],
  },
  {
    id: 'medical-admission',
    title: '入院病歷',
    description: '完整的入院病歷撰寫範本',
    prompt:
      '請根據病人資料撰寫入院病歷，包含：\n\n' +
      '1. Chief Complaint (主訴)\n2. Present Illness (現在病史)\n' +
      '3. Past History (過去病史)\n4. Personal History (個人史)\n' +
      '5. Family History (家族史)\n6. Physical Examination (理學檢查)\n' +
      '7. Laboratory Data (檢驗數據)\n8. Impression (臆斷)\n9. Plan (治療計畫)',
    types: ['chat'],
    category: 'admission',
    specialty: ['internal', 'surgery'],
    audience: ['medical'],
    tags: ['入院', '完整病歷'],
  },
  {
    id: 'medical-safety',
    title: '安全警示檢查',
    description: '自動檢查需要注意的安全事項',
    prompt:
      '請檢查以下安全事項並標記需要注意的項目：\n\n' +
      '1. 藥物交互作用\n2. 過敏史衝突\n3. 異常檢驗值\n' +
      '4. 重複用藥\n5. 劑量異常\n6. 禁忌症\n\n請列出所有發現的安全警示。',
    types: ['insight'],
    category: 'safety',
    specialty: ['general'],
    audience: ['medical'],
    tags: ['安全', '警示', '藥物'],
  },
  {
    id: 'medical-progress-summary',
    title: '病程摘要',
    description: '總結病人的主要診斷和治療進展',
    prompt:
      '請總結病人的臨床狀況：\n\n' +
      '1. 主要診斷\n2. 目前治療\n3. 近期變化\n4. 待辦事項\n5. 追蹤計畫',
    types: ['chat', 'insight'],
    category: 'summary',
    specialty: ['general', 'internal'],
    audience: ['medical'],
    tags: ['摘要', '追蹤'],
  },
  {
    id: 'medical-emergency',
    title: '急診初步評估',
    description: '急診病人的快速評估範本',
    prompt:
      '請進行急診初步評估：\n\nABCDE 評估：\n' +
      '- Airway (呼吸道)\n- Breathing (呼吸)\n- Circulation (循環)\n' +
      '- Disability (神經)\n- Exposure (暴露)\n\n生命徵象：\n- \n\n初步處置：\n- ',
    types: ['chat'],
    category: 'other',
    specialty: ['emergency'],
    audience: ['medical'],
    tags: ['急診', 'ABCDE', '初評'],
  },
  {
    id: 'medical-discharge',
    title: '出院摘要',
    description: '出院病歷摘要範本',
    prompt:
      '請撰寫出院摘要：\n\n' +
      '1. 入院日期與主訴\n2. 住院期間診斷與治療\n3. 出院時狀況\n' +
      '4. 出院用藥\n5. 追蹤計畫\n6. 衛教事項',
    types: ['chat'],
    category: 'discharge',
    specialty: ['general', 'internal', 'surgery'],
    audience: ['medical'],
    tags: ['出院', '摘要'],
  },
]

// 預設只 seed 民眾版（醫療版線上已存在）。要連醫療版一起 seed（例如全新環境），
// 改成： const promptsToSeed = [...patientPrompts, ...medicalPrompts]
const promptsToSeed: SeedPrompt[] = patientPrompts
void medicalPrompts // 保留供參考 / 新環境使用

async function seedPrompts() {
  const email = process.env.SEED_EMAIL
  const password = process.env.SEED_PASSWORD
  if (!email || !password) {
    console.error('❌ 請先設定 SEED_EMAIL / SEED_PASSWORD（owner 帳號）再執行。')
    process.exit(1)
  }
  const authorName = process.env.SEED_AUTHOR_NAME ?? 'MediPrisma'

  console.log(`以 ${email} 登入…`)
  const cred = await signInWithEmailAndPassword(getAuth(app), email, password)
  const authorId = cred.user.uid // firestore.rules 要求 authorId == 登入者 uid

  console.log(`開始 seed ${promptsToSeed.length} 個起始模板…`)
  try {
    const now = Timestamp.now()
    for (const { id, ...data } of promptsToSeed) {
      // 確定性 id + setDoc → 可重複執行（upsert），不會產生重複資料
      await setDoc(doc(collection(db, 'sharedPrompts'), id), {
        ...data,
        authorId,
        authorName,
        createdAt: now,
        updatedAt: now,
        usageCount: 0, // rules 要求建立時從 0 開始
      })
      console.log(`✓ 已寫入: ${data.title} (${id})`)
    }
    console.log(`\n✅ 完成！共 ${promptsToSeed.length} 個模板`)
  } catch (error) {
    console.error('❌ 錯誤:', error)
  }
}

seedPrompts()
