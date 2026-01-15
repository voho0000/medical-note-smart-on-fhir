/**
 * Seed Script for Prompt Gallery
 * 用於建立初始測試資料
 * 
 * 使用方式：
 * 1. 確保已登入 Firebase
 * 2. 執行：npx ts-node scripts/seed-prompts.ts
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore'

// Firebase 配置（從你的 firebase.config.ts 複製）
const firebaseConfig = {
  // 請填入你的 Firebase 配置
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
}

// 初始化 Firebase
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// 測試 Prompts
const samplePrompts = [
  {
    title: 'SOAP 筆記範本',
    description: '標準 SOAP 格式的病歷筆記',
    prompt: `請根據病患資料撰寫 SOAP 筆記：

Subjective (主訴):
- 

Objective (客觀發現):
- 

Assessment (評估):
- 

Plan (計畫):
- `,
    type: 'chat',
    category: 'soap',
    specialty: ['general', 'internal'],
    tags: ['基礎', '通用', 'SOAP'],
  },
  {
    title: '入院病歷',
    description: '完整的入院病歷撰寫範本',
    prompt: `請根據病患資料撰寫入院病歷，包含：

1. Chief Complaint (主訴)
2. Present Illness (現在病史)
3. Past History (過去病史)
4. Personal History (個人史)
5. Family History (家族史)
6. Physical Examination (理學檢查)
7. Laboratory Data (檢驗數據)
8. Impression (臆斷)
9. Plan (治療計畫)`,
    type: 'chat',
    category: 'admission',
    specialty: ['internal', 'surgery'],
    tags: ['入院', '完整病歷'],
  },
  {
    title: '安全警示檢查',
    description: '自動檢查需要注意的安全事項',
    prompt: `請檢查以下安全事項並標記需要注意的項目：

1. 藥物交互作用
2. 過敏史衝突
3. 異常檢驗值
4. 重複用藥
5. 劑量異常
6. 禁忌症

請列出所有發現的安全警示。`,
    type: 'insight',
    category: 'safety',
    specialty: ['general'],
    tags: ['安全', '警示', '藥物'],
  },
  {
    title: '病程摘要',
    description: '總結病患的主要診斷和治療進展',
    prompt: `請總結病患的臨床狀況：

1. 主要診斷
2. 目前治療
3. 近期變化
4. 待辦事項
5. 追蹤計畫`,
    type: 'both',
    category: 'summary',
    specialty: ['general', 'internal'],
    tags: ['摘要', '追蹤'],
  },
  {
    title: '急診初步評估',
    description: '急診病患的快速評估範本',
    prompt: `請進行急診初步評估：

ABCDE 評估：
- Airway (呼吸道)
- Breathing (呼吸)
- Circulation (循環)
- Disability (神經)
- Exposure (暴露)

生命徵象：
- 

初步處置：
- `,
    type: 'chat',
    category: 'other',
    specialty: ['emergency'],
    tags: ['急診', 'ABCDE', '初評'],
  },
  {
    title: '出院摘要',
    description: '出院病歷摘要範本',
    prompt: `請撰寫出院摘要：

1. 入院日期與主訴
2. 住院期間診斷與治療
3. 出院時狀況
4. 出院用藥
5. 追蹤計畫
6. 衛教事項`,
    type: 'chat',
    category: 'discharge',
    specialty: ['general', 'internal', 'surgery'],
    tags: ['出院', '摘要'],
  },
]

async function seedPrompts() {
  console.log('開始建立測試 Prompts...')
  
  try {
    const now = Timestamp.now()
    
    for (const prompt of samplePrompts) {
      const docRef = await addDoc(collection(db, 'sharedPrompts'), {
        ...prompt,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      })
      console.log(`✓ 已建立: ${prompt.title} (ID: ${docRef.id})`)
    }
    
    console.log('\n✅ 完成！已建立', samplePrompts.length, '個測試 Prompts')
  } catch (error) {
    console.error('❌ 錯誤:', error)
  }
}

// 執行
seedPrompts()
