'use client'
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now, today as brisbaneToday, calcStreak, isHabitDayActive } from '@/lib/utils'
import type { HabitEntry } from '@/lib/stores'
import Analytics from './Analytics'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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
// Fields that are auto-logged only (via advancing prospects/candidates) — never manually entered.
const AUTO_ONLY: readonly FieldKey[] = ['pre_filter','mg1','launch']
type Tab = 'log'|'core'|'analytics'

const CONV = { mg1PerConvo:0.034, mpaPerConvo:0.83, mg1PerMpa:0.041, dtmPerConvo:0.22, pfPerConvo:0.067, cuPerConvo:0.33 }

function getV(h:HabitEntry|undefined,k:string):number{ return h?(h as any)[k]??0:0 }
function fmtDate(d:string){ return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}) }
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
function brisbaneYearMonth(){const [y,m]=brisbaneToday().split('-').map(Number);return {y,m}}
const defaultDeadline=()=>{const {y,m}=brisbaneYearMonth();return new Date(y,m,0).toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})}
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
  // Level 1 (Training): interruptions/convo/contact hidden — these are noise at this stage.
  // Level 2+ (Active): full field set is shown.
  const FIELDS = useMemo(
    () => level>=2 ? ALL_FIELDS : ALL_FIELDS.filter(f=>!LEVEL1_HIDDEN.includes(f.key)),
    [level]
  )

  const [selDate,setSelDate]     =useState(todayStr)
  const [form,setForm]           =useState<Record<FieldKey,number>>({convo:0,mg1:0,mpa:0,catch_up:0,dtm:0,pre_filter:0,launch:0,interruptions:0,contact:0})
  const [saving,setSaving]       =useState(false)
  const [saved,setSaved]         =useState(false)
  const [tab,setTab]             =useState<Tab>('log')
  const [coreGoals,setCoreGoals] =useState<CoreGoals>(EMPTY_CORE)
  const [editCore,setEditCore]   =useState(false)
  const [coreForm,setCoreForm]   =useState<{goalField:FieldKey;goal:string;deadline:string;overrides:Partial<Record<FieldKey,string>>}>({goalField:'mg1',goal:'3',deadline:defaultDeadline(),overrides:{}})
  const [checklist,setChecklist] =useState<{reading:boolean;audio:boolean}>({reading:false,audio:false})
  const [pdGoals,setPdGoals]     =useState<{id:string;text:string;done?:boolean;action_steps:{id:string;text:string}[]}[]>([])
  const [actionCheckins,setActionCheckins]=useState<Record<string,Record<string,boolean>>>({})
  const [baselineTotals,setBaselineTotals]=useState<Record<string,number>>({})
  const [showOnboarding,setShowOnboarding]=useState(false)
  const [onboardingForm,setOnboardingForm]=useState<Record<string,string>>({interruptions:'',convo:'',mpa:'',contact:'',catch_up:'',dtm:'',pre_filter:'',mg1:'',launch:''})
  const [onboardingSaving,setOnboardingSaving]=useState(false)

  useEffect(()=>{
    loadHabits();loadResources()
    getMeta('pd_goals').then(v=>{if(v)try{setPdGoals(JSON.parse(v))}catch{}}).catch(e=>console.error('getMeta pd_goals',e))
    getMeta('pd_action_checkins').then(v=>{if(v)try{setActionCheckins(JSON.parse(v))}catch{}}).catch(e=>console.error('getMeta pd_action_checkins',e))
  },[]) // eslint-disable-line
  useEffect(()=>{
    if(!userId)return
    getMeta('historical_baseline').then(b=>{
      if(b){try{setBaselineTotals(JSON.parse(b))}catch{}}
      else setShowOnboarding(true)
    }).catch(e=>console.error('getMeta historical_baseline',e))
  },[userId]) // eslint-disable-line
  useEffect(()=>{
    if(!selDate)return
    getMeta('checklist_'+selDate).then(v=>{
      if(v){try{setChecklist(JSON.parse(v))}catch{}} else setChecklist({reading:false,audio:false})
    }).catch(e=>console.error('getMeta checklist',e))
  },[selDate]) // eslint-disable-line
  useEffect(()=>{
    if(goalOverride){
      // Use admin's goals passed from parent (tracker page)
      setCoreGoals(goalOverride as any)
      return
    }
    getMeta('core_goals_v4').then(v=>{
      if(v)try{const g=JSON.parse(v);setCoreGoals(g);setCoreForm({goalField:g.goalField??'mg1',goal:String(g.goalMonthly??3),deadline:g.deadline,overrides:{}})}catch{}
      else getMeta('core_goals_v3').then(old=>{if(old)try{const g=JSON.parse(old);const ng={goalField:'mg1' as FieldKey,goalMonthly:g.goalMonthly??3,deadline:g.deadline,overrides:g.overrides??{}};setCoreGoals(ng);setCoreForm({goalField:ng.goalField,goal:String(ng.goalMonthly),deadline:ng.deadline,overrides:{}})}catch{}}).catch(e=>console.error('getMeta core_goals_v3',e))
    }).catch(e=>console.error('getMeta core_goals_v4',e))
  },[goalOverride]) // eslint-disable-line
  useEffect(()=>{
    const h=habits[selDate] as HabitEntry|undefined
    if(h) setForm({convo:h.convo??0,mg1:h.mg1??0,mpa:h.mpa??0,catch_up:h.catch_up??0,dtm:h.dtm??0,pre_filter:h.pre_filter??0,launch:h.launch??0,interruptions:h.interruptions??0,contact:h.contact??0})
    else  setForm({convo:0,mg1:0,mpa:0,catch_up:0,dtm:0,pre_filter:0,launch:0,interruptions:0,contact:0})
  },[selDate,habits])

  // Auto-save debounce ref
  const saveTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>()=>{if(saveTimerRef.current)clearTimeout(saveTimerRef.current)},[])

  // ── OFFLINE QUEUE ──────────────────────────────────────
  const [isOffline,setIsOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine)
  const [queueCount,setQueueCount]=useState(0)

  // If sync keeps failing (expired session, RLS) entries never get flushed
  // and this queue would otherwise grow without limit -- cap it so a
  // long-stuck queue degrades to "oldest entries silently drop" instead of
  // unbounded localStorage growth. 90 covers three months of daily entries,
  // far beyond how long anyone would plausibly stay offline/broken before
  // noticing the queue badge (which is already shown above) and refreshing.
  const OFFLINE_QUEUE_CAP=90
  function getOfflineQueue():any[]{try{return JSON.parse(localStorage.getItem('habits_offline_queue')||'[]')}catch{return[]}}
  function setOfflineQueue(q:any[]){const capped=q.slice(-OFFLINE_QUEUE_CAP);localStorage.setItem('habits_offline_queue',JSON.stringify(capped));setQueueCount(capped.length)}

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
  // Keep a stable ref so the online handler always calls the latest version of flushQueue
  const flushQueueRef=useRef(flushQueue)
  flushQueueRef.current=flushQueue

  useEffect(()=>{
    function handleOnline(){setIsOffline(false);flushQueueRef.current()}
    function handleOffline(){setIsOffline(true)}
    window.addEventListener('online',handleOnline)
    window.addEventListener('offline',handleOffline)
    // flush on load in case there's a queue from a previous offline session
    flushQueueRef.current()
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
      }finally{
        setSaving(false)
      }
    },800)
  },[userId,habits,saveHabit])

  async function saveChecklist(key:'reading'|'audio',val:boolean){
    const prev=checklist
    const next={...checklist,[key]:val};setChecklist(next)
    try{await setMeta('checklist_'+selDate,JSON.stringify(next))}catch(e){setChecklist(prev);console.error('saveChecklist error:',e)}
  }
  async function saveActionCheckin(stepId:string,val:boolean){
    const prev=actionCheckins
    const next={...actionCheckins,[selDate]:{...(actionCheckins[selDate]||{}),[stepId]:val}}
    setActionCheckins(next)
    try{await setMeta('pd_action_checkins',JSON.stringify(next))}catch(e){setActionCheckins(prev);console.error('saveActionCheckin error:',e)}
  }
  async function saveCoreGoals(){
    const g:CoreGoals={goalField:coreForm.goalField,goalMonthly:parseInt(coreForm.goal,10)||3,deadline:coreForm.deadline||defaultDeadline(),overrides:{}}
    Object.entries(coreForm.overrides).forEach(([k,v])=>{const n=parseInt(v as string,10)||0;if(n>0)(g.overrides as any)[k]=n})
    setCoreGoals(g)
    try{await setMeta('core_goals_v4',JSON.stringify(g));setEditCore(false)}catch(e:any){console.error('saveCoreGoals failed:',e)}
  }
  async function saveBaseline(skip=false){
    setOnboardingSaving(true)
    const totals:Record<string,number>={}
    if(!skip)Object.entries(onboardingForm).forEach(([k,v])=>{const n=parseInt(v,10)||0;if(n>0)totals[k]=n})
    try{
      await setMeta('historical_baseline',JSON.stringify(totals))
      setBaselineTotals(totals)
      setShowOnboarding(false)
    }catch(e){console.error('saveBaseline failed:',e)}finally{
      setOnboardingSaving(false)
    }
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
    const daysInMonth=new Date(parseInt(todayStr.slice(0,4),10),parseInt(todayStr.slice(5,7),10),0).getDate()
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
      const t=dailyTargets[f.key]??0;const v=h[f.key]??0
      if(!t)return s+(v>0?f.weight*8:0);return s+Math.min(1,v/t)*f.weight*15
    },0)
    return Math.max(0,Math.min(100,Math.round((score/maxScore)*100)-Math.min(20,(h.interruptions??0)*4)+checkBonus))
  },[dailyTargets])
  const checklistBonus=useMemo(()=>(checklist.reading?3:0)+(checklist.audio?3:0),[checklist])
  const todayScore=useMemo(()=>calcScore(form,checklistBonus),[form,calcScore,checklistBonus])
  const streak=useMemo(()=>{
    const dAgo=(n:number)=>{const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})}
    return calcStreak(habits,dAgo,1825)
  },[habits])
  const consistency=useMemo(()=>{
    const last30:string[]=[];for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);last30.push(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}))}
    return Math.round(last30.filter(d=>isHabitDayActive(habits[d])).length/30*100)
  },[habits])
  const conv=useMemo(()=>({
    mg1Rate:allTimeTotals.convo>0?Math.round((allTimeTotals.mg1??0)/allTimeTotals.convo*100):0,
    convoToMpa:allTimeTotals.convo>0?Math.round((allTimeTotals.mpa??0)/allTimeTotals.convo*100):0,
    mpaToMg1:allTimeTotals.mpa>0?Math.round((allTimeTotals.mg1??0)/allTimeTotals.mpa*100):0,
  }),[allTimeTotals])
  const personalBests=useMemo(()=>{
    const b:Partial<Record<FieldKey,{val:number;date:string}>>={};FIELDS.forEach(f=>{let best=0;let bd='';allDates.forEach(d=>{const v=getV(habits[d] as HabitEntry|undefined,f.key);if(v>best){best=v;bd=d}});if(best>0)b[f.key]={val:best,date:bd}});return b
  },[habits,allDates])

  // Get the goal field definition
  const goalFieldDef = FIELDS.find(f=>f.key===coreGoals.goalField)??FIELDS.find(f=>f.key==='mg1')!

  const TABS=[{id:'log' as Tab,label:'📝 Log'},{id:'core' as Tab,label:'🎯 Core Run'},{id:'analytics' as Tab,label:'📊 Analytics'}]
  const scoreColor=todayScore>=80?GREEN:todayScore>=60?TEAL:todayScore>=40?GOLD:RED
  const consColor=consistency>=80?GREEN:consistency>=60?TEAL:consistency>=40?GOLD:RED
  const currMo=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7)

  return(
    <ErrorBoundary label="Habits">
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
            const {y:_bY,m:_bM}=brisbaneYearMonth()
            const daysInMonth=new Date(_bY,_bM,0).getDate()
            const dayOfMonth=Number(brisbaneToday().split('-')[2])
            const daysRemaining=daysInMonth-dayOfMonth
            const goalField=coreGoals.goalField  // the ONE field they chose e.g. 'mpa', 'mg1'
            const goalLabel=FIELDS.find(f=>f.key===goalField)?.label??goalField
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

          {/* Counter grid — excludes auto-only fields (pre_filter, mg1, launch) */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:10}}>
            {FIELDS.filter(f=>!AUTO_ONLY.includes(f.key)).map(f=>{
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

          {/* Goal Actions */}
          {pdGoals.filter(g=>!g.done&&(g.action_steps||[]).length>0).length>0&&(
            <div style={{...CARD,marginBottom:10}}>
              <div style={SL}>Today's Goal Actions</div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {pdGoals.filter(g=>!g.done&&(g.action_steps||[]).length>0).map(g=>(
                  <div key={g.id}>
                    <div style={{fontSize:10,color:GOLD,fontWeight:700,marginBottom:6,letterSpacing:'0.5px'}}>{g.text}</div>
                    {(g.action_steps||[]).map(s=>{
                      const done=actionCheckins[selDate]?.[s.id]===true
                      return(
                        <div key={s.id} onClick={()=>saveActionCheckin(s.id,!done)}
                          style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:done?'rgba(76,175,125,0.06)':'var(--s2)',border:'1px solid '+(done?'rgba(76,175,125,0.3)':'var(--br2)'),borderRadius:'var(--r)',cursor:'pointer',transition:'all 0.2s',marginBottom:5}}>
                          <div style={{width:20,height:20,borderRadius:5,border:'2px solid '+(done?GREEN:'var(--br2)'),background:done?GREEN:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s'}}>
                            {done&&<span style={{color:'#000',fontSize:11,fontWeight:700}}>✓</span>}
                          </div>
                          <span style={{fontSize:12,color:done?GREEN:'var(--text2)',textDecoration:done?'line-through':'none'}}>{s.text}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

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
            const day=Number(brisbaneToday().split('-')[2])
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
          {(()=>{
            const lvName=level>=2?'Active':'Training'
            const lvColor=level>=2?GREEN:TEAL
            const lvNext=level===1?'100 active prospects → Level 2':'Maximum level'
            return(
              <div style={{marginBottom:12,padding:'10px 14px',background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:10,color:'var(--text4)'}}>Your level</span>
                  <span style={{fontSize:10,fontWeight:700,color:lvColor,padding:'3px 10px',background:lvColor+'18',borderRadius:'var(--r)',border:`1px solid ${lvColor}40`}}>
                    L{level} · {lvName}
                  </span>
                </div>
                <div style={{fontSize:9,color:'var(--text4)'}}>{lvNext}</div>
              </div>
            )
          })()}

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


      {/* ── ANALYTICS TAB ────────────────────────────── */}
      {tab==='analytics'&&<Analytics level={level}/>}

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
                    style={{...INP,width:80,fontSize:18,fontWeight:800,color:f.key==='interruptions'&&parseInt(onboardingForm[f.key]||'0',10)>0?RED:f.color,padding:'8px 6px'}}
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
            {parseInt(coreForm.goal,10)>0&&(()=>{
              const preview=deriveTargets({goalField:coreForm.goalField,goalMonthly:parseInt(coreForm.goal,10)||3,deadline:coreForm.deadline,overrides:{}})
              const {y:_pbY,m:_pbM}=brisbaneYearMonth()
              const daysInMonth=new Date(_pbY,_pbM,0).getDate()
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
    </ErrorBoundary>
  )
}
