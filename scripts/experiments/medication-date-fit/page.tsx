'use client'
import { memo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'
import { MedicationItem } from './BenchMedicationItem'
import { MeasureContext } from './measurement-control'
const rows: MedicationRow[] = Array.from({length:1000},(_,i)=>({
 id:`synthetic-${i}`, title:['ACETAMINOPHEN 500 MG','QUETIAPINE (AS FUMARATE) 25 MG','BETHANECHOL CHLORIDE 25 MG','SODIUM CHLORIDE 3.2 MG/ML+POTASSIUM CHLORIDE 1.4 MG/ML'][i%4],
 status:'active', startedOn:'2026/09/03',endDate:'2026/10/01',durationDays:28,
 dose:i%3===0?'1 錠':undefined,frequency:['HS','TIDAC','BID','QDPRN'][i%4],route:'PO',totalQuantity:28+(i%4)*14,
 daysRemaining:22,isInactive:false,isChronic:i%2===0,refillCount:3,icdCode:'S72.002A',icdText:'左側股骨頸未明示部位閉鎖性骨折之初期照護',
 pharmacy:'合成測試醫院 門診',category:'合成測試藥理分類',searchHaystack:'',
}))
const List = memo(({count}:{count:number})=><div className="@container divide-y border rounded-md">{rows.slice(0,count).map(row=><MedicationItem key={row.id} medication={row} grouped />)}</div>)
const frame = () => new Promise<number>(resolve=>requestAnimationFrame(resolve))
const settle=async()=>{await frame();await frame();await frame()}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
const stats=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return {maxMs:Math.max(0,...s),p95Ms:s[Math.floor(s.length*.95)]??0,framesOver50ms:s.filter(n=>n>50).length}}
export default function Bench(){
 const [config,setConfig]=useState({count:0,enabled:false,key:0})
 const [status,setStatus]=useState('Ready')
 const [result,setResult]=useState<unknown[]>([])
 const panel=useRef<HTMLDivElement>(null)
 const running=useRef(false)
 const run=async()=>{
  if(running.current)return;running.current=true
  const output:unknown[]=[]
  const tasks:{start:number,duration:number}[]=[]
  const po=new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push({start:e.startTime,duration:e.duration})})
  po.observe({type:'longtask',buffered:false})
  const oldFont=document.documentElement.style.fontSize
  const longStats=(start:number,end:number)=>{const values=tasks.filter(t=>t.start+t.duration>start&&t.start<end).map(t=>t.duration);return {count:values.length,totalMs:values.reduce((a,b)=>a+b,0),maxMs:Math.max(0,...values)}}
  try{
   await document.fonts.ready
   // One warmup per mode before the paired recorded trials.
   for(const enabled of [false,true]){flushSync(()=>setConfig({count:100,enabled,key:Math.random()}));await settle();flushSync(()=>setConfig({count:0,enabled,key:Math.random()}));await settle()}
   for(const count of [100,1000])for(let trial=0;trial<5;trial++)for(const enabled of trial%2?[true,false]:[false,true]){
    setStatus(`${count} rows / trial ${trial+1} / measurement ${enabled?'on':'off'}`)
    flushSync(()=>setConfig({count:0,enabled,key:Math.random()}));await settle();await pause(120)
    document.documentElement.style.fontSize='16px';panel.current!.style.width='700px'
    await settle()
    const start=performance.now()
    flushSync(()=>setConfig({count,enabled,key:Math.random()}))
    const syncMs=performance.now()-start
    await settle()
    const mountEnd=performance.now()
    const rendered=panel.current!.querySelectorAll('[data-medication-row-layout]').length
    const resizeStart=performance.now();const resizeFrames:number[]=[];let last=await frame()
    for(let i=0;i<36;i++){panel.current!.style.width=`${i%2?700:480}px`;const now=await frame();resizeFrames.push(now-last);last=now}
    await settle();const resizeEnd=performance.now()
    const fontStart=performance.now();const fontFrames:number[]=[];last=await frame()
    for(let i=0;i<12;i++){document.documentElement.style.fontSize=i%2?'16px':'20px';const now=await frame();fontFrames.push(now-last);last=now}
    await settle();const fontEnd=performance.now()
    const scrollStart=performance.now();const scrollFrames:number[]=[];last=await frame()
    for(let i=0;i<24;i++){panel.current!.scrollTop=(i%12)*800;const now=await frame();scrollFrames.push(now-last);last=now}
    await settle();const scrollEnd=performance.now();await pause(100)
    output.push({count,trial:trial+1,enabled,rendered,mount:{syncMs,settledMs:mountEnd-start,longTasks:longStats(start,mountEnd)},resize:{elapsedMs:resizeEnd-resizeStart,...stats(resizeFrames),longTasks:longStats(resizeStart,resizeEnd)},font:{elapsedMs:fontEnd-fontStart,...stats(fontFrames),longTasks:longStats(fontStart,fontEnd)},scroll:{elapsedMs:scrollEnd-scrollStart,...stats(scrollFrames),longTasks:longStats(scrollStart,scrollEnd)}})
    setResult([...output])
   }
   setStatus('Complete')
  }catch(e){setStatus(`Error: ${String(e)}`)}finally{po.disconnect();document.documentElement.style.fontSize=oldFont;running.current=false}
 }
 const scrollCheck=async()=>{
  if(running.current)return;running.current=true
  const output:unknown[]=[]
  const tasks:{start:number,duration:number}[]=[]
  const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())tasks.push({start:entry.startTime,duration:entry.duration})})
  observer.observe({type:'longtask',buffered:false})
  try{
   await document.fonts.ready
   for(let trial=0;trial<5;trial++)for(const enabled of trial%2?[true,false]:[false,true]){
    setStatus(`Scroll-only / trial ${trial+1} / measurement ${enabled?'on':'off'}`)
    flushSync(()=>setConfig({count:0,enabled,key:Math.random()}));await settle()
    document.documentElement.style.fontSize='16px';panel.current!.style.width='700px'
    flushSync(()=>setConfig({count:1000,enabled,key:Math.random()}));await settle();await pause(500);await settle()
    const start=performance.now();const intervals:number[]=[];let last=await frame()
    for(let i=0;i<24;i++){panel.current!.scrollTop=(i%12)*800;const now=await frame();intervals.push(now-last);last=now}
    await settle();const end=performance.now();await pause(100)
    const durations=tasks.filter(t=>t.start>=start&&t.start<end).map(t=>t.duration)
    output.push({trial:trial+1,enabled,elapsedMs:end-start,...stats(intervals),longTotalMs:durations.reduce((a,b)=>a+b,0),longMaxMs:Math.max(0,...durations)})
    setResult([...output])
   }
   setStatus('Scroll check complete')
  }finally{observer.disconnect();running.current=false}
 }
 return <LanguageProvider><AudienceProvider><TooltipProvider><main style={{padding:16}}><h1>Local synthetic medication benchmark</h1><p>Production build · original MedicationItem copy · only measurement enable flag differs · 100 / 1000 mounted rows · 5 paired trials</p><button onClick={run} style={{border:'1px solid',padding:8}}>Run benchmark</button><button onClick={scrollCheck} style={{border:'1px solid',padding:8}}>Run scroll check</button><p role="status">{status}</p><pre id="results" style={{maxHeight:180,overflow:'auto',fontSize:11}}>{JSON.stringify(result,null,2)}</pre><div ref={panel} style={{width:700,height:450,overflow:'auto'}}><MeasureContext.Provider value={config.enabled}><List key={config.key} count={config.count}/></MeasureContext.Provider></div></main></TooltipProvider></AudienceProvider></LanguageProvider>
}
