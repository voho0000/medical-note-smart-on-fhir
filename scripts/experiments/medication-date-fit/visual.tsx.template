'use client'
import { useState } from 'react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'
import { MedicationItem } from '../BenchMedicationItem'

const rows: MedicationRow[] = Array.from({ length: 50 }, (_, i) => ({
  id: `visual-${i}`, title: i % 2 ? 'ACETAMINOPHEN (=PARACETAMOL) 500 MG' : 'FLURAZEPAM HCL 30 MG',
  status: 'active', startedOn: '2026/09/03', endDate: '2026/10/01', durationDays: 28,
  frequency: i % 2 ? 'BID' : 'HS', totalQuantity: 28, daysRemaining: 22,
  isInactive: false, isChronic: true, refillCount: 3, icdCode: 'S72.002A',
  icdText: '左側股骨頸未明示部位閉鎖性骨折之初期照護',
  pharmacy: '合成測試醫院 門診', category: '合成藥理分類', searchHaystack: '',
}))
export default function Visual() {
  const [count, setCount] = useState(50)
  return <LanguageProvider><AudienceProvider><TooltipProvider>
    <main style={{ padding: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {[16, 20, 32].map(size => <button key={size} onClick={() => { document.documentElement.style.fontSize = `${size}px` }}>字級 {size}</button>)}
        <button onClick={() => setCount(count ? 0 : 50)}>切換清單</button>
      </div>
      <div className="@container divide-y rounded-md border" style={{ height: '70vh', overflow: 'auto' }} data-visual-list>
        {rows.slice(0, count).map(row => <MedicationItem key={row.id} medication={row} grouped />)}
      </div>
    </main>
  </TooltipProvider></AudienceProvider></LanguageProvider>
}
