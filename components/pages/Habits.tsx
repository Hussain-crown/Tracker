'use client'
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now } from '@/lib/utils'
import type { HabitEntry } from '@/lib/stores'

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'

const ALL_FIELDS = [
  { key:'interruptions',label:'Interruptions',  color:RED,       weight:-1,desc:'Focus disruptions'         },
  { key:'convo',        label:'Conversations',  color:GOLD,      weight:3, desc:'New prospect conversations' },
  { key:'mpa',          label:'MPA',            color:BLUE,      weight:2, desc:'Product demonstrations'    },
  { key:'contact',      label:'Contacts',       color:'#5B9BD5', weight:2, desc:'People you contacted'      },
  { key:'catch_up',     label:'Catch Ups',      color:PURPLE,    weight:1, desc:'Social connections'        },
  { key:'dtm',          label:'DTM',            color:TEAL,      weight:2, desc:'Decision to move convos'   },
  { key:'pre_filter',   label:'Pre-Filter',     color:'#E8913A', weight:2, desc:'Pre-filter calls'          },
  { key:'mg1',          label:'MG1',            color:TEAL,      weight:4, desc:'Group presentations run'   },
  { key:'launch',       label:'Launches',       color:GOLD,      weight:3, desc:'New partner launches'      },
] as const
type FieldKey = typeof ALL_FIELDS[number]['key']
// Fields hidden entirely at level 1 (entry tier) — restored at level >= 2.
const LEVEL1_HIDDEN: readonly FieldKey[] = ['interruptions','convo','contact']
type Tab = 'log'|'trends'|'core'

const CONV = { mg1PerConvo:0.034, mpaPerConvo:0.83, mg1PerMpa:0.041, dtmPerConvo:0.22, pfPerConvo:0.067, cuPerConvo:0.33 }

function getV(h:HabitEntry|undefined,k:string):number{ return h?(h as any)[k]??0:0 }
function fmtDate(d:string){ return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}) }
function brisbaneToday(){ return new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}) }
function daysLeft(deadline:string):number{
  const tl=new Date(brisbaneToday()+'T12:00:00')
  const en=new Date(deadline+'T12:00:00')
  return Math.max(0,Math.ceil((en.getTime()-tl.getTime())/86400000))
}

function ScoreRing({score,size=56}:{score:number;size?:number}){
  const color=score>=80?GREEN:score>=60?TEAL:score>=40?GOLD:RED
  const r=(size-6)/2;const circ=2*Math.PI*r
  return(
    <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--s3)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${(score/100)*circ} ${circ}`} strokeLinecap="round"
        style={{transition:'stroke-dasharray 0.8s ease'}}/>
    </svg>
  )
}

const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:8}
const INP:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'8px 10px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',textAlign:'center',fontWeight:700}
const INPL:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',boxSizing:'border-box'}

interface CoreGoals { goalField:FieldKey; goalMonthly:number; deadline:string; overrides:Partial<Record<FieldKey,number>> }
const defaultDeadline=()=>new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
const EMPTY_CORE:CoreGoals={goalField:'mg1',goalMonthly:3,deadline:defaultDeadline(),overrides:{}}

function deriveTargets(goals:CoreGoals):Partial<Record<FieldKey,number>>{
  const g=goals.goalMonthly
  const ov=goals.overrides
  // Convert any goal field back to convos, then derive everything from convos
  let convos=0
  switch(goals.goalField){
    case 'mg1':      convos=Math.ceil(g/CONV.mg1PerConvo); break
    case 'convo':    convos=g; break
    case 'mpa':      convos=Math.ceil(g/CONV.mpaPerConvo); break
    case 'contact':  convos=Math.ceil(g*0.6); break
    case 'catch_up': convos=Math.ceil(g/CONV.cuPerConvo); break
    case 'dtm':      convos=Math.ceil(g/CONV.dtmPerConvo); break
    case 'pre_filter':convos=Math.ceil(g/CONV.pfPerConvo); break
    case 'launch':   convos=Math.ceil(g*3/CONV.mg1PerConvo); break
    default:         convos=g
  }
  const mg1=Math.ceil(convos*CONV.mg1PerConvo)
  const mpa=Math.ceil(convos*CONV.mpaPerConvo)
  const dtm=Math.ceil(convos*CONV.dtmPerConvo)
  const pf=Math.ceil(convos*CONV.pfPerConvo)
  const cu=Math.ceil(convos*CONV.cuPerConvo)
  const launch=Math.max(0,Math.ceil(mg1/3))
  const contact=Math.ceil(convos/0.6)
  // The goal field itself uses the exact number entered
  const result:Partial<Record<FieldKey,number>>={
    convo:ov.convo??convos, mg1:ov.mg1??mg1, mpa:ov.mpa??mpa,
    catch_up:ov.catch_up??cu, dtm:ov.dtm??dtm, pre_filter:ov.pre_filter??pf,
    launch:ov.launch??launch, contact:ov.contact??contact, interruptions:0,
  }
  result[goals.goalField]=g
  return result
}


export default function Habits({goalOverride=null,level=1}:{goalOverride?:{goalField:string;goalMonthly:number;deadline:string;overrides:Record<string,number>}|null;level?:number}={}){
  const {userId,habits,loadHabits,saveHabit,getMeta,setMeta,resources,loadResources}=useStore()
  const todayStr=brisbaneToday()
  // Level 1 (entry tier) hides interruptions/convo/contact entirely from the UI.
  // Level >= 2 gets full field set. Gate as >= so future levels need no rework.
  const FIELDS = useMemo(
    () => level>=2 ? ALL_FIELDS : ALL_FIELDS.filter(f=>!LEVEL1_HIDDEN.includes(f.key)),
    [level]
  )

  const [selDate,setSelDate]     =useState(todayStr)
  const [form,setForm]           =useState<Record<FieldKey,number>>({convo:0,mg1:0,mpa:0,catch_up:0,dtm:0,pre_filter:0,launch:0,interruptions:0,contact:0})
  const [saving,setSaving]       =useState(false)
  const [saved,setSaved]         =useState(false)
  const [tab,setTab]             =useState<Tab>(level>=2?'log':'trends')
  useEffect(()=>{ if(level<2&&tab==='log')setTab('trends') },[level,tab])
  const [coreGoals,setCoreGoals] =useState<CoreGoals>(EMPTY_CORE)
  const [editCore,setEditCore]   =useState(false)
  const [coreForm,setCoreForm]   =useState<{goalField:FieldKey;goal:string;deadline:string;overrides:Partial<Record<FieldKey,string>>}>({goalField:'mg1',goal:'3',deadline:defaultDeadline(),overrides:{}})
  const [checklist,setChecklist] =useState<{reading:boolean;audio:boolean}>({reading:false,audio:false})
  const [baselineTotals,setBaselineTotals]=useState<Record<string,number>>({})
  const [showOnboarding,setShowOnboarding]=useState(false)
  const [onboardingForm,setOnboardingForm]=useState<Record<string,string>>({interruptions:'',convo:'',mpa:'',contact:'',catch_up:'',dtm:'',pre_filter:'',mg1:'',launch:''})
  const [onboardingSaving,setOnboardingSaving]=useState(false)

  useEffect(()=>{ loadHabits();loadResources() },[]) // eslint-disable-line
  useEffect(()=>{
    if(!userId)return
    getMeta('historical_baseline').then(b=>{
      if(b){try{setBaselineTotals(JSON.parse(b))}catch{}}
      else setShowOnboarding(true)
    })
  },[userId]) // eslint-disable-line
  useEffect(()=>{
    if(!selDate)return
    getMeta('checklist_'+selDate).then(v=>{
      if(v){try{setChecklist(JSON.parse(v))}catch{}} else setChecklist({reading:false,audio:false})
    })
  },[selDate]) // eslint-disable-line
  useEffect(()=>{
    if(goalOverride){
      // Use admin's goals passed from parent (tracker page)
      setCoreGoals(goalOverride as any)
      return
    }
    getMeta('core_goals_v4').then(v=>{
      if(v)try{const g=JSON.parse(v);setCoreGoals(g);setCoreForm({goalField:g.goalField??'mg1',goal:String(g.goalMonthly??3),deadline:g.deadline,overrides:{}})}catch{}
      else getMeta('core_goals_v3').then(old=>{if(old)try{const g=JSON.parse(old);const ng={goalField:'mg1' as FieldKey,goalMonthly:g.goalMonthly??3,deadline:g.deadline,overrides:g.overrides??{}};setCoreGoals(ng)}catch{}})
    })
  },[goalOverride]) // eslint-disable-line
  useEffect(()=>{
    const h=habits[selDate] as HabitEntry|undefined
    if(h) setForm({convo:h.convo??0,mg1:h.mg1??0,mpa:h.mpa??0,catch_up:h.catch_up??0,dtm:h.dtm??0,pre_filter:h.pre_filter??0,launch:h.launch??0,interruptions:h.interruptions??0,contact:(h as any).contact??0})
    else  setForm({convo:0,mg1:0,mpa:0,catch_up:0,dtm:0,pre_filter:0,launch:0,interruptions:0,contact:0})
  },[selDate,habits])

  // Auto-save debounce ref
  const saveTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null)

  // ── OFFLINE QUEUE ──────────────────────────────────────
  const [isOffline,setIsOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine)
  const [queueCount,setQueueCount]=useState(0)

  function getOfflineQueue():any[]{try{return JSON.parse(localStorage.getItem('habits_offline_queue')||'[]')}catch{return[]}}
  function setOfflineQueue(q:any[]){localStorage.setItem('habits_offline_queue',JSON.stringify(q));setQueueCount(q.length)}

  async function flushQueue(){
    if(!userId)return
    const q=getOfflineQueue()
    if(!q.length)return
    const failed:any[]=[]
    for(const entry of q){
      try{
        const ex=habits[entry.date] as HabitEntry|undefined
        await saveHabit({...entry,user_id:userId,id:ex?.id??entry.id??uid(),created_at:ex?.created_at??entry.created_at??now(),updated_at:now()} as any)
      }catch{failed.push(entry)}
    }
    setOfflineQueue(failed)
    if(failed.length===0){setSaved(true);setTimeout(()=>setSaved(false),2000)}
  }

  useEffect(()=>{
    function handleOnline(){setIsOffline(false);flushQueue()}
    function handleOffline(){setIsOffline(true)}
    window.addEventListener('online',handleOnline)
    window.addEventListener('offline',handleOffline)
    // flush on load in case there's a queue from a previous offline session
    flushQueue()
    setQueueCount(getOfflineQueue().length)
    return()=>{window.removeEventListener('online',handleOnline);window.removeEventListener('offline',handleOffline)}
  },[userId]) // eslint-disable-line

  const autoSave=useCallback((f:Record<FieldKey,number>,date:string)=>{
    if(!userId)return
    if(saveTimerRef.current)clearTimeout(saveTimerRef.current)
    saveTimerRef.current=setTimeout(async()=>{
      setSaving(true)
      const ex=habits[date] as HabitEntry|undefined
      try{
        await saveHabit({id:ex?.id??uid(),user_id:userId,date,...f,created_at:ex?.created_at??now(),updated_at:now()} as any)
        setSaved(true);setTimeout(()=>setSaved(false),1500)
      }catch{
        // offline or network error: queue it for later
        const q=getOfflineQueue().filter((e:any)=>e.date!==date)
        q.push({id:ex?.id??uid(),user_id:userId,date,...f,created_at:ex?.created_at??now(),updated_at:now()})
        setOfflineQueue(q)
      }
      setSaving(false)
    },800)
  },[userId,habits,saveHabit])

  async function saveChecklist(key:'reading'|'audio',val:boolean){
    const next={...checklist,[key]:val};setChecklist(next)
    setMeta('checklist_'+selDate,JSON.stringify(next))
  }
  async function saveCoreGoals(){
    const g:CoreGoals={goalField:coreForm.goalField,goalMonthly:parseInt(coreForm.goal)||3,deadline:coreForm.deadline||defaultDeadline(),overrides:{}}
    Object.entries(coreForm.overrides).forEach(([k,v])=>{const n=parseInt(v as string)||0;if(n>0)(g.overrides as any)[k]=n})
    setCoreGoals(g);await setMeta('core_goals_v4',JSON.stringify(g));setEditCore(false)
  }
  async function saveBaseline(skip=false){
    setOnboardingSaving(true)
    const totals:Record<string,number>={}
    if(!skip)Object.entries(onboardingForm).forEach(([k,v])=>{const n=parseInt(v)||0;if(n>0)totals[k]=n})
    await setMeta('historical_baseline',JSON.stringify(totals))
    setBaselineTotals(totals)
    setShowOnboarding(false)
    setOnboardingSaving(false)
  }
  // ── DATA ─────────────────────────────────────────────
  const allDates=useMemo(()=>Object.keys(habits).sort(),[habits])
  const liveTotals=useMemo(()=>{
    const t:Record<string,number>={convo:0,mg1:0,mpa:0,catch_up:0,dtm:0,pre_filter:0,launch:0,interruptions:0,contact:0}
    allDates.forEach(d=>{const h=habits[d] as any;if(h)Object.keys(t).forEach(k=>{t[k]+=(h[k]??0)})})
    return t
  },[habits,allDates])
  const allTimeTotals=useMemo(()=>{
    const t:Record<string,number>={...liveTotals}
    Object.entries(baselineTotals).forEach(([k,v])=>{t[k]=(t[k]??0)+v})
    return t
  },[liveTotals,baselineTotals])
  const targets=useMemo(()=>deriveTargets(coreGoals),[coreGoals])
  const dailyTargets=useMemo(()=>{
    const daysInMonth=new Date(parseInt(todayStr.slice(0,4)),parseInt(todayStr.slice(5,7)),0).getDate()
    const result:Partial<Record<FieldKey,number>>={};Object.entries(targets).forEach(([k,v])=>{if(v&&v!==0)result[k as FieldKey]=Math.round(v/daysInMonth*10)/10});return result
  },[targets,todayStr])
  const monthProgress=useMemo(()=>{
    const mS=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7)+'-01'
    const days=allDates.filter(d=>d>=mS);const result:Record<string,number>={}
    FIELDS.forEach(f=>{result[f.key]=days.reduce((s,d)=>s+getV(habits[d] as HabitEntry|undefined,f.key),0)});return result
  },[habits,allDates,FIELDS])
  const calcScore=useCallback((h:Record<FieldKey,number>,checkBonus=0):number=>{
    const maxScore=FIELDS.filter(f=>f.key!=='interruptions').reduce((s,f)=>s+f.weight*15,0)
    const score=FIELDS.filter(f=>f.key!=='interruptions').reduce((s,f)=>{
      const t=dailyTargets[f.key]??0;const v=(h as any)[f.key]??0
      if(!t)return s+(v>0?f.weight*8:0);return s+Math.min(1,v/t)*f.weight*15
    },0)
    return Math.max(0,Math.min(100,Math.round((score/maxScore)*100)-Math.min(20,((h as any).interruptions??0)*4)+checkBonus))
  },[dailyTargets])
  const checklistBonus=useMemo(()=>(checklist.reading?3:0)+(checklist.audio?3:0),[checklist])
  const todayScore=useMemo(()=>calcScore(form,checklistBonus),[form,calcScore,checklistBonus])
  const streak=useMemo(()=>{
    let s=0;const d=new Date()
    while(s<1825){const ds=d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});const h=habits[ds] as HabitEntry|undefined;const any=h&&FIELDS.some(f=>((h as any)[f.key]??0)>0);if(!any)break;s++;d.setDate(d.getDate()-1)}
    return s
  },[habits,FIELDS])
  const consistency=useMemo(()=>{
    const last30:string[]=[];for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);last30.push(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}))}
    return Math.round(last30.filter(d=>{const h=habits[d] as HabitEntry|undefined;return h&&FIELDS.some(f=>(h as any)[f.key]>0)}).length/30*100)
  },[habits,FIELDS])
  const conv=useMemo(()=>({
    mg1Rate:allTimeTotals.convo>0?Math.round((allTimeTotals.mg1??0)/allTimeTotals.convo*100):0,
    convoToMpa:allTimeTotals.convo>0?Math.round((allTimeTotals.mpa??0)/allTimeTotals.convo*100):0,
    mpaToMg1:allTimeTotals.mpa>0?Math.round((allTimeTotals.mg1??0)/allTimeTotals.mpa*100):0,
  }),[allTimeTotals])
  const personalBests=useMemo(()=>{
    const b:Partial<Record<FieldKey,{val:number;date:string}>>={};FIELDS.forEach(f=>{let best=0;let bd='';allDates.forEach(d=>{const v=getV(habits[d] as HabitEntry|undefined,f.key);if(v>best){best=v;bd=d}});if(best>0)b[f.key]={val:best,date:bd}});return b
  },[habits,allDates])

  // Activity breakdown data for trends (computed outside render to avoid IIFE JSX issues)
  const BDFIELDS=[
    {k:'convo',c:GOLD,l:'Convos'},{k:'mpa',c:BLUE,l:'MPA'},{k:'contact',c:'#5B9BD5',l:'Contacts'},
    {k:'catch_up',c:PURPLE,l:'CatchUp'},{k:'dtm',c:TEAL,l:'DTM'},{k:'pre_filter',c:'#E8913A',l:'PF'},{k:'mg1',c:GREEN,l:'MG1'},
  ] as const
  const actData=useMemo(()=>{
    const months:string[]=[];const d=new Date();d.setDate(1)
    for(let i=0;i<12;i++){months.unshift(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7));d.setMonth(d.getMonth()-1)}
    return months.map(mo=>{
      const days=Object.keys(habits).filter((dd:string)=>dd.startsWith(mo))
      const t:{[k:string]:number}={convo:0,mpa:0,mg1:0,catch_up:0,dtm:0,pre_filter:0,contact:0,interruptions:0}
      days.forEach(dd=>{const h=(habits as any)[dd] as any;if(h)Object.keys(t).forEach(k=>{t[k]+=(h[k]??0)})})
      return{mo,total:t.convo+t.mpa+t.mg1+t.catch_up+t.dtm+t.pre_filter+t.contact,...t}
    })
  },[habits])
  const actMaxTotal=useMemo(()=>Math.max(...actData.map(d=>d.total),1),[actData])

  // Get the goal field definition
  const goalFieldDef = FIELDS.find(f=>f.key===coreGoals.goalField)??FIELDS.find(f=>f.key==='mg1')!

  const TABS=([{id:'log' as Tab,label:'📝 Log'},{id:'trends' as Tab,label:'📈 Trends'},{id:'core' as Tab,label:'🎯 Core Run'}]).filter(t=>!(level<2&&t.id==='log'))
  const scoreColor=todayScore>=80?GREEN:todayScore>=60?TEAL:todayScore>=40?GOLD:RED
  const consColor=consistency>=80?GREEN:consistency>=60?TEAL:consistency>=40?GOLD:RED
  const currMo=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7)

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>

      {/* Header */}
      <div style={{marginBottom:16}}>
        {/* Date nav */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <button onClick={()=>{const d=new Date(selDate+'T12:00:00');d.setDate(d.getDate()-1);setSelDate(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}))}}
            style={{width:32,height:32,borderRadius:'50%',border:'1px solid var(--br)',background:'var(--s1)',color:'var(--text)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:13,fontWeight:700,color:selDate===todayStr?GOLD:'var(--text2)'}}>
              {selDate===todayStr?'Today':selDate===(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})})()? 'Yesterday':selDate}
            </div>
            {habits[selDate]&&<div style={{fontSize:9,color:GREEN,marginTop:2}}>✓ logged</div>}
          </div>
          <button
            onClick={()=>{const d=new Date(selDate+'T12:00:00');d.setDate(d.getDate()+1);const next=d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});if(next<=todayStr)setSelDate(next)}}
            disabled={selDate>=todayStr}
            style={{width:32,height:32,borderRadius:'50%',border:'1px solid var(--br)',background:'var(--s1)',color:selDate>=todayStr?'var(--text4)':'var(--text)',cursor:selDate>=todayStr?'default':'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
          {selDate!==todayStr&&<button onClick={()=>setSelDate(todayStr)} style={{padding:'5px 10px',borderRadius:'var(--r)',border:'1px solid rgba(200,162,74,0.3)',background:'rgba(200,162,74,0.06)',color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Today</button>}
        </div>
        {/* Score + streak */}
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <div style={{display:'flex',gap:8,alignItems:'center',flex:1}}>
            {streak>0&&<span style={{fontSize:10,color:GOLD,fontWeight:700,padding:'4px 10px',background:'rgba(200,162,74,0.08)',borderRadius:'var(--r)',border:'1px solid rgba(200,162,74,0.2)'}}>🔥 {streak}d</span>}
            <span style={{fontSize:10,color:consColor,padding:'4px 10px',background:'var(--s2)',borderRadius:'var(--r)'}}>{consistency}% active</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{position:'relative',width:48,height:48,flexShrink:0}}>
              <ScoreRing score={todayScore} size={48}/>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="mono" style={{fontSize:12,fontWeight:800,color:scoreColor,lineHeight:1}}>{todayScore}</span>
              </div>
            </div>
            <div style={{fontSize:9,color:'var(--text4)',lineHeight:1.3}}>today<br/>score</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:3,marginBottom:16,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)',overflowX:'auto'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:'8px 6px',borderRadius:'var(--r)',border:'none',background:tab===t.id?'var(--s3)':'transparent',color:tab===t.id?GOLD:'var(--text3)',fontSize:10,fontWeight:tab===t.id?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",transition:'all 0.15s',whiteSpace:'nowrap',flexShrink:0}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LOG TAB ──────────────────────────────────── */}
      {tab==='log'&&(
        <div>
          {/* Monthly pace strip — shows ONLY the chosen Core Run goal field */}
          {coreGoals.goalMonthly>0&&(()=>{
            const daysInMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()
            const dayOfMonth=new Date().getDate()
            const daysRemaining=daysInMonth-dayOfMonth
            const goalField=coreGoals.goalField  // the ONE field they chose e.g. 'mpa', 'mg1'
            const goalLabel=FIELDS.find(f=>f.key===goalField)?.label??goalField
            const goalColor=FIELDS.find(f=>f.key===goalField)?.color??GOLD
            const done=monthProgress[goalField]??0
            const goalTotal=coreGoals.goalMonthly
            const expectedByNow=Math.round(goalTotal*(dayOfMonth/daysInMonth)*10)/10
            const pct=goalTotal>0?Math.min(100,Math.round(done/goalTotal*100)):0
            const paceColor=done>=expectedByNow?GREEN:done>=expectedByNow*0.7?GOLD:RED
            const onPace=done>=expectedByNow
            return(
              <div style={{marginBottom:12,padding:'12px 14px',background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,textTransform:'uppercase' as const}}>This Month</span>
                  <span style={{fontSize:9,color:paceColor,fontWeight:700}}>{onPace?'On pace ✓':'Behind pace'}</span>
                </div>
                <div style={{display:'flex',gap:12,alignItems:'baseline',marginBottom:8}}>
                  <div>
                    <span className="mono" style={{fontSize:26,fontWeight:800,color:paceColor,lineHeight:1}}>{done}</span>
                    <span style={{fontSize:11,color:'var(--text4)',marginLeft:4}}>/ {goalTotal} {goalLabel}</span>
                  </div>
                  <span style={{fontSize:10,color:paceColor,fontWeight:600}}>{pct}%</span>
                </div>
                <div style={{height:5,background:'var(--s3)',borderRadius:3,overflow:'hidden',marginBottom:6}}>
                  <div style={{height:'100%',width:pct+'%',background:paceColor,borderRadius:3,transition:'width 0.8s'}}/>
                </div>
                <div style={{fontSize:9,color:'var(--text4)'}}>{daysRemaining}d left to hit {goalTotal}</div>
              </div>
            )
          })()}

          {/* Counter grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:10}}>
            {FIELDS.map(f=>{
              const val=form[f.key]
              const daily=dailyTargets[f.key]??0
              const pb=personalBests[f.key]
              const isNewRecord=pb&&val>pb.val&&val>0
              const pct=daily>0?Math.min(100,Math.round(val/daily*100)):0
              return(
                <div key={f.key} style={{...CARD,marginBottom:0,padding:'16px',borderTop:`3px solid ${f.color}`,position:'relative',overflow:'hidden'}}>
                  {isNewRecord&&<div style={{position:'absolute',top:4,right:4,fontSize:8,color:GOLD,fontWeight:700}}>NEW PB!</div>}
                  <div style={{fontSize:10,fontWeight:700,color:f.color,marginBottom:4}}>{f.label}</div>
                  {pb&&<div style={{fontSize:8,color:'var(--text4)',marginBottom:6}}>PB: {pb.val}</div>}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <button onClick={()=>{const next={...form,[f.key]:Math.max(0,form[f.key]-1)};setForm(next);autoSave(next,selDate)}} style={{width:44,height:44,borderRadius:'var(--r)',border:'1px solid var(--br2)',background:'var(--s2)',color:'var(--text3)',cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                    <input type="number" min={0} value={val}
                      onChange={e=>{const next={...form,[f.key]:Math.max(0,parseInt(e.target.value,10)||0)};setForm(next);autoSave(next,selDate)}}
                      style={{...INP,width:60,padding:'8px 4px',fontSize:24,fontWeight:800,textAlign:'center',color:f.key==='interruptions'&&val>0?RED:f.color}}/>
                    <button onClick={()=>{const next={...form,[f.key]:form[f.key]+1};setForm(next);autoSave(next,selDate)}}
                      style={{width:44,height:44,borderRadius:'var(--r)',border:'1px solid var(--br2)',background:'var(--s2)',color:'var(--text3)',cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                  </div>
                  {daily>0&&(
                    <div style={{height:4,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:pct+'%',background:f.color,borderRadius:2,transition:'width 0.5s'}}/>
                    </div>
                  )}
                  {daily>0&&<div style={{fontSize:8,color:'var(--text4)',marginTop:3,textAlign:'center'}}>goal {daily}/day</div>}
                </div>
              )
            })}
          </div>

          {/* Offline queue banner */}
          {(isOffline||queueCount>0)&&(
            <div style={{marginBottom:10,padding:'8px 12px',background:isOffline?'rgba(224,85,85,0.08)':'rgba(200,162,74,0.08)',border:`1px solid ${isOffline?'rgba(224,85,85,0.3)':'rgba(200,162,74,0.3)'}`,borderRadius:'var(--r)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11,color:isOffline?RED:GOLD,fontWeight:600}}>{isOffline?'Offline':'Back online'} {queueCount>0?`— ${queueCount} entry${queueCount>1?'s':''} queued`:''}</span>
              {!isOffline&&queueCount>0&&<button onClick={flushQueue} style={{fontSize:10,padding:'3px 10px',borderRadius:'var(--r)',border:'1px solid rgba(200,162,74,0.4)',background:'rgba(200,162,74,0.1)',color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:700}}>Sync now</button>}
            </div>
          )}
          {/* Auto-save indicator */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginBottom:12,height:28}}>
            {saving&&<span style={{fontSize:11,color:'var(--text4)'}}>saving…</span>}
            {!saving&&saved&&<span style={{fontSize:11,color:'var(--green)',fontWeight:600}}>✓ saved</span>}
            {!saving&&!saved&&<span style={{fontSize:10,color:'var(--text4)'}}>changes save automatically</span>}
          </div>

          {/* Daily checklist */}
          {(()=>{
            const currentBook=(resources as any[]).find((r:any)=>r.status==='reading'&&r.type==='Book')
            return(
              <div style={{...CARD,marginBottom:10}}>
                <div style={SL}>Daily Accountability</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div onClick={()=>saveChecklist('reading',!checklist.reading)}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:checklist.reading?'rgba(76,175,125,0.06)':'var(--s2)',border:'1px solid '+(checklist.reading?'rgba(76,175,125,0.3)':'var(--br2)'),borderRadius:'var(--r)',cursor:'pointer',transition:'all 0.2s'}}>
                    <div style={{width:22,height:22,borderRadius:6,border:'2px solid '+(checklist.reading?GREEN:'var(--br2)'),background:checklist.reading?GREEN:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s'}}>
                      {checklist.reading&&<span style={{color:'#000',fontSize:12,fontWeight:700}}>✓</span>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:checklist.reading?GREEN:'var(--text2)'}}>📖 Read today</div>
                      {currentBook?<div style={{fontSize:10,color:'var(--text4)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentBook.title}</div>:<div style={{fontSize:10,color:'var(--text4)',marginTop:1}}>No book currently being tracked</div>}
                    </div>
                  </div>
                  <div onClick={()=>saveChecklist('audio',!checklist.audio)}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:checklist.audio?'rgba(76,175,125,0.06)':'var(--s2)',border:'1px solid '+(checklist.audio?'rgba(76,175,125,0.3)':'var(--br2)'),borderRadius:'var(--r)',cursor:'pointer',transition:'all 0.2s'}}>
                    <div style={{width:22,height:22,borderRadius:6,border:'2px solid '+(checklist.audio?GREEN:'var(--br2)'),background:checklist.audio?GREEN:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s'}}>
                      {checklist.audio&&<span style={{color:'#000',fontSize:12,fontWeight:700}}>✓</span>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:checklist.audio?GREEN:'var(--text2)'}}>🎧 Listen to audio training</div>
                      <div style={{fontSize:10,color:'var(--text4)',marginTop:1}}>Podcast, training call, or keynote</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

        </div>
      )}

      {/* ── TRENDS TAB ────────────────────────────────── */}
      {tab==='trends'&&(
        <div>
          {/* Daily Accountability Grid — 30 days */}
          <div style={CARD}>
            <div style={SL}>Daily Accountability — Last 30 Days</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
              {(()=>{
                const days:string[]=[]
                for(let i=29;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}))}
                return days.map(d=>{
                  const hasHabit=!!(habits[d] as any)
                  const isToday=d===todayStr
                  const both=isToday&&checklist.reading&&checklist.audio
                  const partial=isToday&&(checklist.reading||checklist.audio)
                  const color=both?GREEN:partial?GOLD:hasHabit?'var(--s3)':'var(--s2)'
                  return(
                    <div key={d} title={d} style={{width:20,height:20,borderRadius:4,background:color,border:isToday?`2px solid ${GOLD}`:'1px solid var(--br)',flexShrink:0,cursor:'pointer'}}
                      onClick={()=>{setSelDate(d);setTab('log')}}/>
                  )
                })
              })()}
            </div>
            <div style={{display:'flex',gap:12,fontSize:9,color:'var(--text4)'}}>
              <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:GREEN,display:'inline-block'}}/>Both done</span>
              <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:GOLD,display:'inline-block'}}/>Partial</span>
              <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:'var(--s3)',display:'inline-block'}}/>Habit logged</span>
            </div>
            <div style={{marginTop:8,fontSize:10,color:'var(--text4)'}}>+3 score per checklist item completed · tap any day to view</div>
          </div>

          {/* Conversion funnel */}
          <div style={CARD}>
            <div style={SL}>Conversion Funnel — All Time</div>
            <div style={{fontSize:10,color:'var(--text4)',marginBottom:14}}>Where are you losing people at each stage</div>
            {(()=>{
              const steps=[
                {l:'Interruptions',     v:allTimeTotals.interruptions??0, c:RED},
                {l:'Conversations',     v:allTimeTotals.convo??0,         c:GOLD},
                {l:'MPAs done',         v:allTimeTotals.mpa??0,           c:BLUE},
                {l:'Contacts made',     v:allTimeTotals.contact??0,       c:'#5B9BD5'},
                {l:'Catch Ups',         v:allTimeTotals.catch_up??0,      c:PURPLE},
                {l:'DTMs',             v:allTimeTotals.dtm??0,           c:TEAL},
                {l:'Pre-Filters',       v:allTimeTotals.pre_filter??0,    c:'#E8913A'},
                {l:'MG1s run',          v:allTimeTotals.mg1??0,           c:GREEN},
                {l:'Launches',          v:allTimeTotals.launch??0,        c:GOLD},
              ]
              const maxVal=Math.max(...steps.map(s=>s.v),1)
              const flowSteps=steps.slice(1)
              let bigDrop={l:'',drop:0}
              flowSteps.forEach((s,i)=>{if(i===0)return;const prev=flowSteps[i-1].v;const drop=prev>0?Math.round((1-s.v/prev)*100):0;if(drop>bigDrop.drop)bigDrop={l:s.l,drop}})
              return(
                <div>
                  {steps.map((s,i)=>{
                    const isInt=s.l==='Interruptions'
                    const prev=i>1?steps[i-1].v:0
                    const dropPct=prev>0&&i>1?Math.round((1-s.v/prev)*100):0
                    const w=Math.round((s.v/maxVal)*100)
                    return(
                      <div key={s.l} style={{paddingBottom:isInt?10:0,marginBottom:isInt?6:0,borderBottom:isInt?'1px solid var(--br)':'none'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700,color:s.c}}>{s.l}</span>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            {dropPct>0&&<span style={{fontSize:9,fontWeight:700,color:dropPct>60?RED:dropPct>30?GOLD:'var(--text4)',padding:'1px 5px',borderRadius:4,background:dropPct>60?'rgba(224,85,85,0.1)':dropPct>30?'rgba(200,162,74,0.1)':'transparent'}}>▼ {dropPct}%</span>}
                            <span className="mono" style={{fontSize:13,fontWeight:800,color:s.c,minWidth:32,textAlign:'right'}}>{s.v}</span>
                          </div>
                        </div>
                        <div style={{height:10,background:'var(--s3)',borderRadius:5,overflow:'hidden'}}>
                          <div style={{height:'100%',width:w+'%',background:s.c,borderRadius:5,transition:'width 0.8s ease'}}/>
                        </div>
                      </div>
                    )
                  })}
                  {bigDrop.drop>20&&(
                    <div style={{marginTop:12,padding:'10px 12px',background:'rgba(200,162,74,0.06)',border:'1px solid rgba(200,162,74,0.25)',borderRadius:'var(--r)',borderLeft:'3px solid '+(bigDrop.drop>50?RED:GOLD)}}>
                      <div style={{fontSize:10,fontWeight:700,color:bigDrop.drop>50?RED:GOLD,marginBottom:2}}>⚠ Biggest bottleneck: {bigDrop.l}</div>
                      <div style={{fontSize:10,color:'var(--text4)'}}>{bigDrop.drop}% drop — this is where most people fall out</div>
                    </div>
                  )}
                  <div style={{marginTop:10,fontSize:9,color:'var(--text4)',borderTop:'1px solid var(--br)',paddingTop:8}}>All-time · {allDates.length} days logged{Object.keys(baselineTotals).length>0?' + historical baseline':''}</div>
                </div>
              )
            })()}
          </div>

          {/* Activity breakdown */}
          <div style={CARD}>
            <div style={SL}>Activity Breakdown — Monthly (Last 12 months)</div>
            <div style={{fontSize:10,color:'var(--text4)',marginBottom:12}}>How your activity splits each month</div>
            {(()=>{
              const data=actData
              const maxTotal=actMaxTotal
              const cm=currMo
              return(
                <div>
                  {/* Stacked bar chart */}
                  <div style={{display:'flex',gap:3,alignItems:'flex-end',height:90,marginBottom:6}}>
                    {data.map((m,i)=>{
                      const totalH=Math.max(3,(m.total/maxTotal)*86)
                      return(
                        <div key={i} title={m.mo+': '+m.total+' total'} style={{flex:1,height:totalH,display:'flex',flexDirection:'column',justifyContent:'flex-end',borderRadius:'2px 2px 0 0',overflow:'hidden',outline:m.mo===cm?'2px solid var(--gold)':'none',outlineOffset:1}}>
                          {BDFIELDS.map(f=>{
                            const val=(m as any)[f.k]??0
                            const bh=m.total>0?(val/m.total)*totalH:0
                            if(bh<=0.5)return null
                            return <div key={f.k} style={{width:'100%',height:bh,background:f.c,flexShrink:0}}/>
                          })}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{display:'flex',gap:3,marginBottom:10}}>
                    {data.map((m,i)=>(
                      <div key={i} style={{flex:1,textAlign:'center'}}>
                        <div style={{fontSize:7,color:m.mo===cm?GOLD:'var(--text4)',fontWeight:m.mo===cm?700:400}}>{m.mo.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
                    {BDFIELDS.map(f=>(
                      <div key={f.k} style={{display:'flex',alignItems:'center',gap:4}}>
                        <div style={{width:8,height:8,borderRadius:2,background:f.c,flexShrink:0}}/>
                        <span style={{fontSize:9,color:'var(--text3)',fontWeight:600}}>{f.l}</span>
                      </div>
                    ))}
                  </div>
                  {/* Data rows (div-based, avoids table/thead issues) */}
                  <div style={{overflowX:'auto'}}>
                    <div style={{display:'flex',borderBottom:'2px solid var(--br)',paddingBottom:4,marginBottom:2}}>
                      <div style={{width:52,flexShrink:0,fontSize:9,color:'var(--text4)',fontWeight:600}}>Month</div>
                      {BDFIELDS.map(f=>(
                        <div key={f.k} style={{flex:1,textAlign:'center',fontSize:9,color:f.c,fontWeight:700,minWidth:32}}>{f.l}</div>
                      ))}
                      <div style={{width:28,textAlign:'center',fontSize:9,color:'var(--text4)',fontWeight:600}}>Int</div>
                      <div style={{width:32,textAlign:'center',fontSize:9,color:'var(--text4)',fontWeight:600}}>Tot</div>
                    </div>
                    {[...data].reverse().map(m=>{
                      const isCurr=m.mo===cm
                      return(
                        <div key={m.mo} style={{display:'flex',borderBottom:'1px solid var(--br)',padding:'4px 0',background:isCurr?'rgba(200,162,74,0.04)':'transparent'}}>
                          <div style={{width:52,flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:isCurr?GOLD:'var(--text3)',fontWeight:isCurr?700:400}}>{m.mo.slice(2)}</div>
                          {BDFIELDS.map(f=>{
                            const v=(m as any)[f.k]??0
                            return(
                              <div key={f.k} style={{flex:1,textAlign:'center',minWidth:32}}>
                                <span className="mono" style={{fontSize:10,color:v>0?f.c:'var(--text4)',fontWeight:v>0?700:400}}>{v||'·'}</span>
                              </div>
                            )
                          })}
                          <div style={{width:28,textAlign:'center'}}>
                            <span className="mono" style={{fontSize:10,color:(m as any).interruptions>0?RED:'var(--text4)'}}>{(m as any).interruptions||'·'}</span>
                          </div>
                          <div style={{width:32,textAlign:'center'}}>
                            <span className="mono" style={{fontSize:11,fontWeight:700,color:m.total>0?'var(--text2)':'var(--text4)'}}>{m.total||'·'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Monthly history */}
          <div style={CARD}>
            <div style={SL}>Monthly History — All Time</div>
            <div style={{overflowX:'auto'}}>
              <div style={{display:'flex',borderBottom:'2px solid var(--br)',paddingBottom:4,marginBottom:2}}>
                {['Month','Convos','MG1','MPA','DTM','Contacts','Score'].map(h=>(
                  <div key={h} style={{flex:1,minWidth:40,fontSize:9,color:'var(--text4)',fontWeight:600,padding:'2px 4px'}}>{h}</div>
                ))}
              </div>
              {(()=>{
                const months:string[]=[];const d=new Date();d.setDate(1)
                for(let i=0;i<24;i++){months.unshift(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7));d.setMonth(d.getMonth()-1)}
                return months.map(mo=>{
                  const days=Object.keys(habits).filter((d:string)=>d.startsWith(mo))
                  if(days.length===0)return null
                  const totals={convo:0,mg1:0,mpa:0,dtm:0,contact:0}
                  days.forEach(d=>{const h=(habits as any)[d] as any;if(h){totals.convo+=h.convo??0;totals.mg1+=h.mg1??0;totals.mpa+=h.mpa??0;totals.dtm+=h.dtm??0;totals.contact+=(h as any).contact??0}})
                  const scores=days.map(d=>{const h=(habits as any)[d] as any;return h?calcScore({convo:h.convo??0,mg1:h.mg1??0,mpa:h.mpa??0,catch_up:h.catch_up??0,dtm:h.dtm??0,pre_filter:h.pre_filter??0,launch:h.launch??0,interruptions:h.interruptions??0,contact:(h as any).contact??0}):0})
                  const pos=scores.filter(s=>s>0);const avgScore=pos.length?Math.round(pos.reduce((a,b)=>a+b,0)/pos.length):0
                  const isCurrent=mo===currMo
                  return(
                    <div key={mo} style={{display:'flex',borderBottom:'1px solid var(--br)',background:isCurrent?'rgba(200,162,74,0.04)':'transparent',padding:'5px 0'}}>
                      {[mo,totals.convo,totals.mg1,totals.mpa,totals.dtm,totals.contact,avgScore].map((v,i)=>(
                        <div key={i} style={{flex:1,minWidth:40,padding:'0 4px'}}>
                          <span className="mono" style={{fontSize:10,fontWeight:isCurrent?700:400,color:isCurrent&&i===0?GOLD:i===0?'var(--text3)':typeof v==='number'&&v>0?[GOLD,GREEN,BLUE,TEAL,'#5B9BD5',GOLD][i-1]??GOLD:'var(--text4)'}}>{v||'·'}</span>
                        </div>
                      ))}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── CORE RUN TAB ──────────────────────────────── */}
      {tab==='core'&&(
        <div>
          {/* Goal hero */}
          {(()=>{
            const gf=goalFieldDef
            const done=monthProgress[gf.key]??0
            const pct=Math.min(100,coreGoals.goalMonthly>0?Math.round(done/coreGoals.goalMonthly*100):0)
            const remaining=Math.max(0,coreGoals.goalMonthly-done)
            return(
              <div style={{...CARD,borderTop:'3px solid '+gf.color,textAlign:'center'}}>
                <div style={{fontSize:9,color:gf.color,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',marginBottom:8}}>Monthly {gf.label} Goal</div>
                <div className="mono" style={{fontSize:56,fontWeight:800,color:gf.color,lineHeight:1,marginBottom:4}}>{coreGoals.goalMonthly}</div>
                <div style={{fontSize:11,color:'var(--text4)',marginBottom:12}}>by {fmtDate(coreGoals.deadline)} · {daysLeft(coreGoals.deadline)}d left</div>
                <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:12}}>
                  <div style={{textAlign:'center'}}>
                    <div className="mono" style={{fontSize:24,fontWeight:800,color:done>0?GREEN:RED}}>{done}</div>
                    <div style={{fontSize:9,color:'var(--text4)'}}>done this month</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div className="mono" style={{fontSize:24,fontWeight:800,color:GOLD}}>{remaining}</div>
                    <div style={{fontSize:9,color:'var(--text4)'}}>remaining</div>
                  </div>
                </div>
                <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden',marginBottom:8}}>
                  <div style={{height:'100%',width:pct+'%',background:pct>=100?GREEN:gf.color,borderRadius:3,transition:'width 0.8s'}}/>
                </div>
                {goalOverride
                  ?<div style={{fontSize:10,color:'var(--text4)',marginTop:8,textAlign:'center'}}>Goal set by your leader</div>
                  :<button onClick={()=>setEditCore(true)} style={{padding:'8px 20px',borderRadius:'var(--r)',border:'1px solid '+gf.color+'40',background:gf.color+'10',color:gf.color,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>Edit Goal</button>
                }
              </div>
            )
          })()}

          {/* New month notice */}
          {(()=>{
            const day=new Date().getDate()
            const thisMonthDays=Object.keys(habits).filter((d:string)=>d.startsWith(currMo))
            if(day>5||thisMonthDays.length>0)return null
            return(
              <div style={{marginBottom:12,padding:'10px 14px',background:'rgba(91,213,155,0.05)',border:'1px solid rgba(91,213,155,0.2)',borderRadius:'var(--r2)',borderLeft:'3px solid '+TEAL}}>
                <div style={{fontSize:11,fontWeight:700,color:TEAL,marginBottom:3}}>🌱 New month — targets reset</div>
                <div style={{fontSize:10,color:'var(--text3)'}}>Goal: {coreGoals.goalMonthly} {goalFieldDef.label} by {fmtDate(coreGoals.deadline)}. Log your first habit to start the month.</div>
              </div>
            )
          })()}

          {/* Level badge */}
          <div style={{marginBottom:12,padding:'8px 14px',background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:10,color:'var(--text4)'}}>Your level</span>
            <span style={{fontSize:10,fontWeight:700,color:level>=2?GOLD:TEAL,padding:'3px 10px',background:level>=2?'rgba(200,162,74,0.1)':'rgba(91,155,213,0.1)',borderRadius:'var(--r)',border:`1px solid ${level>=2?'rgba(200,162,74,0.3)':'rgba(91,155,213,0.3)'}`}}>
              Level {level} — {level>=2?'Full Access':'Entry Tier'}
            </span>
          </div>

          {/* Derived daily targets */}
          <div style={CARD}>
            <div style={SL}>Daily Targets (derived from {coreGoals.goalMonthly} {goalFieldDef.label}/month)</div>
            <div style={{fontSize:10,color:'var(--text4)',marginBottom:12}}>Based on your historical conversion rates</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8}}>
              {FIELDS.filter(f=>f.key!=='interruptions').map(f=>{
                const monthly=targets[f.key]??0
                const daily=dailyTargets[f.key]??0
                const todayVal=getV(habits[todayStr] as HabitEntry|undefined,f.key)
                const hit=daily>0&&todayVal>=daily
                const monthVal=monthProgress[f.key]??0
                return(
                  <div key={f.key} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'10px',border:'1px solid var(--br)'}}>
                    <div style={{fontSize:10,fontWeight:700,color:monthly>0?f.color:'var(--text4)',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      {f.label}
                      {hit&&<span style={{fontSize:8,color:GREEN,fontWeight:700}}>✓</span>}
                    </div>
                    {monthly>0?(
                      <>
                        <div className="mono" style={{fontSize:14,fontWeight:800,color:f.color,lineHeight:1}}>{monthly}<span style={{fontSize:10,fontWeight:400,color:'var(--text4)'}}>/mo</span></div>
                        <div style={{fontSize:10,color:'var(--text4)',marginTop:2}}>{daily}/day</div>
                        <div style={{marginTop:5,height:3,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}>
                          <div style={{height:'100%',width:Math.min(100,monthly>0?Math.round(monthVal/monthly*100):0)+'%',background:f.color,borderRadius:2}}/>
                        </div>
                        <div style={{fontSize:8,color:'var(--text4)',marginTop:2}}>{monthVal} this month</div>
                      </>
                    ):(
                      <div style={{fontSize:11,color:'var(--text4)',fontStyle:'italic'}}>not tracked</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Conversion rates */}
          <div style={CARD}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:0}}>
              <div style={SL}>Your Conversion Rates — All Time</div>
              <button onClick={()=>{
                const pre:Record<string,string>={interruptions:'',convo:'',mpa:'',contact:'',catch_up:'',dtm:'',pre_filter:'',mg1:'',launch:''}
                Object.entries(baselineTotals).forEach(([k,v])=>{if(v>0)pre[k]=String(v)})
                setOnboardingForm(pre);setShowOnboarding(true)
              }} style={{fontSize:9,color:'var(--text4)',background:'none',border:'none',cursor:'pointer',fontFamily:"'Sora',sans-serif",textDecoration:'underline',padding:0,marginBottom:8}}>Edit baseline</button>
            </div>
            <div style={{fontSize:10,color:'var(--text4)',marginBottom:12}}>{allTimeTotals.convo>0?`Based on ${allTimeTotals.convo} total conversations`:'Log conversations to see your rates'}{Object.keys(baselineTotals).length>0?' (inc. baseline)':''}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[{l:'Convo → MG1',v:conv.mg1Rate+'%',c:TEAL},{l:'Convo → MPA',v:conv.convoToMpa+'%',c:BLUE},{l:'MPA → MG1',v:conv.mpaToMg1+'%',c:PURPLE}].map(r=>(
                <div key={r.l} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'10px',textAlign:'center'}}>
                  <div className="mono" style={{fontSize:18,fontWeight:800,color:r.c,lineHeight:1}}>{r.v}</div>
                  <div style={{fontSize:9,color:'var(--text3)',marginTop:4}}>{r.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* ── HISTORICAL BASELINE ONBOARDING ─────────────── */}
      {showOnboarding&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.96)',zIndex:700,display:'flex',flexDirection:'column',backdropFilter:'blur(12px)'}}>
          <div style={{background:'var(--s1)',borderBottom:'1px solid var(--br)',padding:'20px 20px 16px',flexShrink:0}}>
            <div style={{fontSize:17,fontWeight:800,color:GOLD,marginBottom:4}}>{Object.keys(baselineTotals).length>0?'Edit your historical baseline':'Welcome — set up your history'}</div>
            <div style={{fontSize:11,color:'var(--text4)',lineHeight:1.6}}>Enter your <strong style={{color:'var(--text2)'}}>total activity before this app</strong>. This makes conversion rates accurate from day one. Leave 0 to start fresh.</div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'16px 20px 20px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {ALL_FIELDS.map(f=>(
                <div key={f.key} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:'var(--r)',borderLeft:`3px solid ${f.color}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:f.color}}>{f.label}</div>
                    <div style={{fontSize:10,color:'var(--text4)',marginTop:1}}>{f.desc}</div>
                  </div>
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={onboardingForm[f.key]??''}
                    placeholder="0"
                    onChange={e=>setOnboardingForm(p=>({...p,[f.key]:e.target.value}))}
                    style={{...INP,width:80,fontSize:18,fontWeight:800,color:f.key==='interruptions'&&parseInt(onboardingForm[f.key]||'0')>0?RED:f.color,padding:'8px 6px'}}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{background:'var(--s1)',borderTop:'1px solid var(--br)',padding:'16px 20px',flexShrink:0,display:'flex',gap:10}}>
            <button onClick={()=>saveBaseline(false)} disabled={onboardingSaving}
              style={{flex:1,padding:'13px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:800,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>
              {onboardingSaving?'Saving…':'Save History'}
            </button>
            <button onClick={()=>saveBaseline(true)} disabled={onboardingSaving}
              style={{padding:'13px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>
              Starting fresh
            </button>
          </div>
        </div>
      )}

      {/* ── EDIT CORE GOAL MODAL ─────────────────────── */}
      {editCore&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(8px)'}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:440,padding:28}}>
            <div style={{fontSize:16,fontWeight:700,color:'var(--text2)',marginBottom:4}}>Set Monthly Goal</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:16}}>Choose one habit as your primary goal. All targets derive from it.</div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>Goal Habit</div>
              <select value={coreForm.goalField} onChange={e=>setCoreForm(p=>({...p,goalField:e.target.value as FieldKey}))}
                style={{...INP,textAlign:'left',fontWeight:600,fontSize:14,padding:'10px 12px'}}>
                {FIELDS.filter(f=>f.key!=='interruptions').map(f=>(
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>Target per month</div>
              <input type="number" min={1} value={coreForm.goal}
                onChange={e=>setCoreForm(p=>({...p,goal:e.target.value}))}
                style={{...INP,fontSize:32,fontWeight:800,color:FIELDS.find(f=>f.key===coreForm.goalField)?.color??TEAL,padding:'12px'}}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>Monthly deadline</div>
              <input type="date" value={coreForm.deadline} min={todayStr}
                onChange={e=>setCoreForm(p=>({...p,deadline:e.target.value}))}
                style={{...INPL,textAlign:'center'}}/>
            </div>
            {parseInt(coreForm.goal)>0&&(()=>{
              const preview=deriveTargets({goalField:coreForm.goalField,goalMonthly:parseInt(coreForm.goal)||3,deadline:coreForm.deadline,overrides:{}})
              const daysInMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()
              return(
                <div style={{padding:'12px',background:'var(--s2)',borderRadius:'var(--r)',marginBottom:20}}>
                  <div style={{fontSize:10,color:'var(--text4)',marginBottom:8}}>Preview — daily targets:</div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
                    {FIELDS.filter(f=>f.key!=='interruptions'&&f.key!=='contact').map(f=>{
                      const m=preview[f.key]??0
                      const d=m>0?Math.round(m/daysInMonth*10)/10:0
                      if(m===0)return null
                      return(
                        <div key={f.key}>
                          <div className="mono" style={{fontSize:14,fontWeight:800,color:f.color}}>{m}<span style={{fontSize:9,color:'var(--text4)'}}>/mo</span></div>
                          <div style={{fontSize:8,color:'var(--text4)'}}>{f.label}: {d}/d</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            <div style={{display:'flex',gap:8}}>
              <button onClick={saveCoreGoals} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--teal),var(--teal2))',color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>Save Goal</button>
              <button onClick={()=>setEditCore(false)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
