'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import type { HabitEntry } from '@/lib/stores/types'
import { uid, now, today } from '@/lib/utils'
import { buildPreCallBrief } from '@/lib/aiText'
import type { Lead, ContactLog } from '@/lib/stores/types'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// ── CONSTANTS ─────────────────────────────────────────────
const STAGES = ['Interruption','Convo','Contact','MPA','Catch-Up','DTM'] as const
type Stage = typeof STAGES[number]

const STAGE_CFG: Record<Stage,{color:string;bg:string;next:Stage|null}> = {
  'Interruption':{color:'var(--red)',    bg:'rgba(224,85,85,0.08)',   next:'Convo'},
  'Convo':    {color:'var(--blue)',   bg:'rgba(91,155,213,0.12)',  next:'Contact'},
  'Contact':  {color:'var(--gold)',   bg:'rgba(200,162,74,0.12)', next:'MPA'},
  'MPA':      {color:'var(--green)',  bg:'rgba(76,175,125,0.12)', next:'Catch-Up'},
  'Catch-Up': {color:'var(--purple)', bg:'rgba(155,91,213,0.12)', next:'DTM'},
  'DTM':      {color:'var(--teal)',   bg:'rgba(91,213,155,0.12)', next:null},
}

const SOURCES    = ['Instagram','Facebook','LinkedIn','Cold Approach','Referral','Event','University','Gym','Work','Church / Community','Online Ad','Other']
const RELATIONS  = ['Close friend','Acquaintance','Stranger','Online only','Family']
const AGE_RANGES = ['Under 25','25-35','35-45','45+']
const LIFE_STAGES= ['Student','Working','Business owner','Parent','Retired']
const DRIVERS    = ['Family','Community','Purpose','Personal Development','Time','Money','Lifestyle']
const HUNGER_ANCHORS = ['Content with life','Mild dissatisfaction','Wants change','Unhappy, exploring','Desperate to change']
const LOOKING_ANCHORS= ['Completely closed','Politely listening','Curious, open','Actively searching','Ready to start now']

// ── HELPERS ────────────────────────────────────────────────
function hxl(h:number,l:number){return Math.round(h*l)}
function hxlColor(s:number){return s>=70?'var(--green)':s>=40?'var(--gold)':'var(--red)'}

// Dynamic health score: HxL (50%) + Recency (30%) + Stage depth (20%)
function healthScore(l:Lead, lastContactDate:string):number{
  const hxlS=Math.min(100,hxl(l.hunger,l.looking))
  const daysSinceContact=lastContactDate?Math.floor((Date.now()-new Date(lastContactDate).getTime())/86400000):daysSince(l.updated_at)
  const recency=Math.max(0,100-daysSinceContact*10)
  const stageDepth=(['Interruption','Convo','Contact','MPA','Catch-Up','DTM'].indexOf(l.stage as Stage)+1)*13
  return Math.round(hxlS*0.5+recency*0.3+stageDepth*0.2)
}
function healthColor(s:number){return s>=70?'var(--green)':s>=50?'var(--gold)':'var(--red)'}
function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function isStale(l:Lead){return daysSince(l.updated_at)>=7}
function isOverdue(l:Lead){return !!(l.next_action_date&&l.next_action_date<today())}
function fmtDate(d:string){return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
function blankLead():Partial<Lead>{return{name:'',phone:'',email:'',instagram:'',contact:'',source:'',stage:'Contact',hunger:5,looking:5,relationship:'',age_range:'',life_stage:'',primary_driver:'',pain_point:'',archived:false,archived_reason:'',notes:'',score:0}}
function csvToList(s?:string):string[]{return(s||'').split(',').map(x=>x.trim()).filter(Boolean)}

function parseCSV(text:string){
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim())
  if(lines.length<2)return{headers:[] as string[],rows:[] as string[][]}
  const parse=(row:string)=>row.split(',').map(c=>c.trim().replace(/^"|"$/g,''))
  return{headers:parse(lines[0]),rows:lines.slice(1).map(parse)}
}
const CSV_FIELD_MAP:Record<string,keyof Lead>={
  name:'name','full name':'name',fullname:'name',
  phone:'phone',mobile:'phone',
  instagram:'instagram',ig:'instagram',
  email:'email',
  source:'source',stage:'stage',notes:'notes',
  contact:'contact','contact method':'contact',
  relationship:'relationship',
  'age range':'age_range',age_range:'age_range',
  'life stage':'life_stage',life_stage:'life_stage',
  'primary driver':'primary_driver',primary_driver:'primary_driver',
  'pain point':'pain_point',pain_point:'pain_point','their why':'pain_point',
}

function todayStr(){return today()}
function daysFromNow(n:number){const d=new Date();d.setDate(d.getDate()+n);return d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})}

// ── STYLES ─────────────────────────────────────────────────
const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px'}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',boxSizing:'border-box' as const}
const SEL:React.CSSProperties={...INP as object,cursor:'pointer'} as React.CSSProperties
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:400,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px',backdropFilter:'blur(8px)',overflowY:'auto'}

type View = 'leads'|'funnel'|'archived'

// ── LEAD CARD — defined OUTSIDE Pipeline so React doesn't recreate it ──
interface LeadCardProps {
  l: Lead
  candidates: {name:string}[]
  contactLogs: ContactLog[]
  setContactModal: (l:Lead)=>void
  setContactLog: (v:{notes:string})=>void
  setBookPFModal: (l:Lead)=>void
  setBriefModal: (v:{lead:Lead;text:string;loading:boolean})=>void
  setDrawerLead: (l:Lead)=>void
  openEdit: (l:Lead)=>void
  changeStage: (l:Lead,newStage:Stage)=>void
  touchCount?: number
  nextDue?: string
  isDupe?: boolean
}
function LeadCard({l,candidates,contactLogs,setContactModal,setContactLog,setBookPFModal,setBriefModal,setDrawerLead,openEdit,changeStage,touchCount,nextDue,isDupe}:LeadCardProps){
  const cfg=STAGE_CFG[l.stage as Stage]??STAGE_CFG['Convo']
  const stale=isStale(l);const overdue=isOverdue(l)
  const days=daysSince(l.updated_at)
  const isDTM=l.stage==='DTM'
  const isCandidate=candidates.some(c=>c.name===l.name)
  const logs=contactLogs.filter(c=>c.entity_id===l.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))
  const lastLog=logs[0]
  // Days in current stage (from last stage-change log or created_at)
  const stageChangeLogs=logs.filter(c=>['convo','contact','mpa','catch_up','dtm','lead_created'].includes(c.event_type))
  const stageChangeDate=stageChangeLogs[0]?.created_at??l.created_at
  const daysInStage=Math.floor((Date.now()-new Date(stageChangeDate).getTime())/86400000)
  const stageAlertColor=daysInStage>=21?RED:daysInStage>=14?GOLD:null
  // Dynamic health score
  const health=healthScore(l, lastLog?.created_at??l.updated_at)
  const outcomeColor:{[k:string]:string}={Positive:GREEN,Neutral:GOLD,Negative:RED,'No Show':RED,'Not Yet':'var(--text4)'}
  const dotColor=outcomeColor[lastLog?.outcome??'']??'var(--text4)'

  // Next due badge color
  const today=todayStr()
  let nextDueColor='var(--text4)'
  if(nextDue){
    if(nextDue<today)nextDueColor=RED
    else if(nextDue===today)nextDueColor=GOLD
  }

  return(
    <div style={{...CARD,marginBottom:10,borderLeft:`3px solid ${cfg.color}`,position:'relative',transition:'all 0.15s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:3,display:'flex',alignItems:'center',gap:8}}>
            <span>{l.name}</span>
            {lastLog&&<span style={{width:6,height:6,borderRadius:'50%',background:dotColor,display:'inline-block',flexShrink:0}}/>}
            {isDupe&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:6,background:'rgba(249,115,22,0.15)',color:'#f97316',fontWeight:700,letterSpacing:'0.5px'}}>DUPE</span>}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{l.stage}</span>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{l.source}</span>
            {l.relationship&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{l.relationship}</span>}
            {overdue&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.15)',color:RED,fontWeight:600}}>⛔ {daysSince(l.next_action_date||'')}d overdue</span>}
            {stale&&!overdue&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(200,162,74,0.1)',color:GOLD}}>{days}d no update</span>}
            {!stale&&!overdue&&<span style={{fontSize:10,color:'var(--text4)'}}>{days===0?'Today':days+'d ago'}</span>}
            {stageAlertColor&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:stageAlertColor+'20',color:stageAlertColor,fontWeight:600}}>{daysInStage}d in {l.stage}</span>}
          </div>
        </div>
        <div style={{textAlign:'right' as const,flexShrink:0}}>
          <div className="mono" style={{fontSize:22,fontWeight:800,color:healthColor(health),lineHeight:1}}>{health}</div>
          <div style={{fontSize:8,color:'var(--text4)'}}>H{l.hunger}×L{l.looking}</div>
        </div>
      </div>
      {(l.primary_driver||l.pain_point)&&(
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:8,lineHeight:1.5}}>
          {l.primary_driver&&<span style={{color:GOLD,fontWeight:600,marginRight:6}}>→ {l.primary_driver}</span>}
          {l.pain_point&&<span>"{l.pain_point.slice(0,60)}{l.pain_point.length>60?'…':''}"</span>}
        </div>
      )}
      {l.next_action&&(
        <div style={{fontSize:11,color:overdue?RED:'var(--text3)',marginBottom:8}}>
          <span style={{color:'var(--text4)'}}>Next: </span>
          <span style={{fontWeight:600}}>{l.next_action}</span>
          {l.next_action_date&&<span style={{color:overdue?RED:'var(--text4)',marginLeft:4}}>{fmtDate(l.next_action_date)}</span>}
        </div>
      )}
      {lastLog?.notes&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:8,fontStyle:'italic'}}>Last: "{lastLog.notes.slice(0,80)}"</div>}

      {/* Touch count + next due badge */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8}}>
        {(touchCount!==undefined&&touchCount>0)&&(
          <span style={{fontSize:10,color:'var(--text4)'}}>{touchCount} touch{touchCount===1?'':'es'}</span>
        )}
        {nextDue&&(
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:nextDueColor+'20',color:nextDueColor,fontWeight:600}}>
            due {fmtDate(nextDue)}
          </span>
        )}
      </div>

      <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
        <button onClick={()=>{setContactModal(l);setContactLog({notes:''})}}
          style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>
          ✓ Log
        </button>
        {STAGES.indexOf(l.stage as Stage)<STAGES.length-1&&(
          <button onClick={()=>changeStage(l,STAGES[STAGES.indexOf(l.stage as Stage)+1])} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>
            → {STAGES[STAGES.indexOf(l.stage as Stage)+1]}
          </button>
        )}
        {isDTM&&!isCandidate&&(
          <button onClick={()=>setBookPFModal(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${TEAL}40`,background:`${TEAL}0C`,color:TEAL,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:700}}>
            🚀 Convert to Candidate
          </button>
        )}
        <button onClick={()=>setBriefModal({lead:l,text:'',loading:false})} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Brief</button>
        <button onClick={()=>setDrawerLead(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>View →</button>
        <button onClick={()=>openEdit(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Edit</button>
      </div>

    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────
// ── MULTI-SELECT DROPDOWN (up to `max` picks, closed by default) ──
function MultiSelectDropdown({label,options,values,onChange,max,invalid}:{label:string;options:string[];values:string[];onChange:(v:string[])=>void;max:number;invalid?:boolean}){
  const [open,setOpen]=useState(false)
  const ref=React.useRef<HTMLDivElement>(null)
  useEffect(()=>{
    function onDoc(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener('mousedown',onDoc)
    return()=>document.removeEventListener('mousedown',onDoc)
  },[])
  function toggle(o:string){
    if(values.includes(o))onChange(values.filter(v=>v!==o))
    else if(values.length<max)onChange([...values,o])
  }
  return(
    <div ref={ref} style={{position:'relative'}}>
      <div style={SL}>{label} {max>1?`(up to ${max})`:''}</div>
      <div onClick={()=>setOpen(o=>!o)} style={{...SEL,display:'flex',justifyContent:'space-between',alignItems:'center',border:`1px solid ${invalid?RED:'var(--br2)'}`}}>
        <span style={{color:values.length?'var(--text)':'var(--text4)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{values.length?values.join(', '):'Select…'}</span>
        <span style={{fontSize:10,color:'var(--text4)',flexShrink:0,marginLeft:6}}>{open?'▲':'▼'}</span>
      </div>
      {open&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,background:'var(--s2)',border:'1px solid var(--br2)',borderRadius:'var(--r)',zIndex:20,maxHeight:200,overflowY:'auto' as const,boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
          {options.map(o=>{
            const checked=values.includes(o)
            const disabled=!checked&&values.length>=max
            return(
              <div key={o} onClick={()=>!disabled&&toggle(o)} style={{padding:'8px 12px',display:'flex',alignItems:'center',gap:8,cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.4:1,fontSize:13,fontFamily:"'Sora',sans-serif"}}>
                <span style={{width:14,height:14,borderRadius:4,border:`1px solid ${checked?GOLD:'var(--br2)'}`,background:checked?GOLD:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {checked&&<span style={{color:'#000',fontSize:10,fontWeight:800}}>✓</span>}
                </span>
                <span>{o}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Pipeline({iboNumber=''}:{iboNumber?:string}){
  const {leads,userId,upsertLead,deleteLead,loadLeads,
         upsertCandidate,loadCandidates,candidates,
         addContactLog,loadContactLogs,contactLogs,
         habits,saveHabit,loadHabits} = useStore()

  const [view,setView]         = useState<View>('leads')
  const [filter,setFilter]     = useState<Stage|'all'|'archived'>('all')
  const [sortBy,setSortBy]     = useState<'overdue'|'score'|'stale'|'date'>('overdue')
  const [search,setSearch]     = useState('')
  const [open,setOpen]         = useState(false)
  const [ed,setEd]             = useState<Lead|null>(null)
  const [form,setForm]         = useState<Partial<Lead>>(blankLead())
  const [err,setErr]           = useState('')
  const [invalidFields,setInvalidFields] = useState<Set<string>>(new Set())
  const [contactModal,setContactModal] = useState<Lead|null>(null)
  const [contactLog,setContactLog]     = useState({notes:''})
  const [bookPFModal,setBookPFModal]   = useState<Lead|null>(null)
  const [converting,setConverting]     = useState(false)
  const [drawerLead,setDrawerLead]     = useState<Lead|null>(null)
  const [briefModal,setBriefModal]     = useState<{lead:Lead;text:string;loading:boolean}|null>(null)
  const [archiveModal,setArchiveModal] = useState<Lead|null>(null)
  const [banner,setBanner]             = useState<{type:'error'|'success';msg:string}|null>(null)
  const [archiveReasonFilter,setArchiveReasonFilter] = useState<string>('all')
  const [dragOver,setDragOver]         = useState(false)
  const [deleteLeadConfirm,setDeleteLeadConfirm] = useState<Lead|null>(null)
  const [csvModal,setCsvModal]         = useState<{headers:string[];rows:string[][];mapping:Record<number,keyof Lead|''>}|null>(null)
  const [csvProgress,setCsvProgress]   = useState<{done:number;total:number;skipped:number}|null>(null)

  useEffect(()=>{
    loadLeads().catch(e=>console.error('loadLeads failed:',e))
    loadCandidates().catch(e=>console.error('loadCandidates failed:',e))
    loadContactLogs().catch(e=>console.error('loadContactLogs failed:',e))
    loadHabits().catch(e=>console.error('loadHabits failed:',e))
  },[]) // eslint-disable-line

  async function safeWrite(fn:()=>Promise<void>, errMsg='Save failed'): Promise<boolean>{
    setBanner(null)
    try{ await fn(); return true }
    catch(e:any){ setBanner({type:'error',msg:errMsg+': '+(e?.message||'unknown error')}); return false }
  }

  // Stage → habit field mapping for auto-log
  const STAGE_HABIT: Record<string,keyof HabitEntry> = {
    'convo':     'convo',
    'contact':   'contact',
    'mpa':       'mpa',
    'catch_up':  'catch_up',
    'dtm':       'dtm',
  }

  async function autoLogHabit(field: keyof HabitEntry){
    if(!userId)return
    const date=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
    const ex=habits[date] as HabitEntry|undefined
    const base:HabitEntry={
      id:ex?.id??uid(),user_id:userId,date,
      interruptions:0,convo:0,mpa:0,contact:0,
      catch_up:0,dtm:0,pre_filter:0,mg1:0,launch:0,
      created_at:ex?.created_at??now(),updated_at:now(),
      ...(ex||{}),
    }
    ;(base as any)[field]=(base[field] as number)+1
    base.updated_at=now()
    try{ await saveHabit(base) }catch(e){ console.error(e) }
  }

  // ── SECURITY: Only show this user's leads ──
  const myLeads  = useMemo(()=>leads.filter(l=>l.user_id===userId),[leads,userId])
  const active   = useMemo(()=>myLeads.filter(l=>!l.archived),[myLeads])
  const archived = useMemo(()=>myLeads.filter(l=>l.archived),[myLeads])

  const dupeSet = useMemo(()=>{
    const seen=new Set<string>()
    const phoneGroups:Record<string,string[]>={}
    const nameGroups:Record<string,string[]>={}
    active.forEach(l=>{
      const p=(l.phone||'').replace(/\D/g,'')
      if(p.length>=8){if(!phoneGroups[p])phoneGroups[p]=[];phoneGroups[p].push(l.id)}
      const n=l.name.toLowerCase().trim()
      if(n){if(!nameGroups[n])nameGroups[n]=[];nameGroups[n].push(l.id)}
    })
    Object.values(phoneGroups).forEach(ids=>{if(ids.length>1)ids.forEach(id=>seen.add(id))})
    Object.values(nameGroups).forEach(ids=>{if(ids.length>1)ids.forEach(id=>seen.add(id))})
    return seen
  },[active])

  const stageCounts = useMemo(()=>{
    const c:Record<string,number>={};STAGES.forEach(s=>{c[s]=active.filter(l=>l.stage===s).length});return c
  },[active])

  // ── touch count and next-due maps ──
  const touchCountMap = useMemo(()=>{
    const m:Record<string,number>={}
    contactLogs.forEach(log=>{
      if(!m[log.entity_id])m[log.entity_id]=0
      m[log.entity_id]++
    })
    return m
  },[contactLogs])

  const nextDueMap = useMemo(()=>{
    const m:Record<string,string>={}
    const byLead:Record<string,ContactLog[]>={}
    contactLogs.forEach(log=>{
      if(!byLead[log.entity_id])byLead[log.entity_id]=[]
      byLead[log.entity_id].push(log)
    })
    Object.entries(byLead).forEach(([leadId,logs])=>{
      const sorted=[...logs].sort((a,b)=>b.created_at.localeCompare(a.created_at))
      const withDate=sorted.find(l=>l.next_date)
      if(withDate)m[leadId]=withDate.next_date
    })
    return m
  },[contactLogs])

  // ── stats strip ──
  const today=todayStr()
  const weekAgo=daysFromNow(-7)
  const weekAhead=daysFromNow(7)

  const statsOverdue  = useMemo(()=>active.filter(l=>l.next_action_date&&l.next_action_date<today),[active,today])
  const statsDTM      = useMemo(()=>active.filter(l=>l.stage==='DTM'),[active])
  const statsHot      = useMemo(()=>active.filter(l=>hxl(l.hunger,l.looking)>=70),[active])

  // ── weekly digest ──
  const weeklyDigest = useMemo(()=>{
    const newLeads=active.filter(l=>l.created_at>=weekAgo).length
    const advances=contactLogs.filter(l=>['convo','contact','mpa','catch_up','dtm'].includes(l.event_type)&&l.created_at>=weekAgo).length
    const dtms=contactLogs.filter(l=>l.event_type==='dtm'&&l.created_at>=weekAgo).length
    const archives=archived.filter(l=>l.updated_at>=weekAgo).length
    return{newLeads,advances,dtms,archives}
  },[active,archived,contactLogs,weekAgo])

  const showDigest=weeklyDigest.newLeads>0||weeklyDigest.advances>0||weeklyDigest.dtms>0||weeklyDigest.archives>0

  const displayed = useMemo(()=>{
    let list=filter==='archived'?archived:active.filter(l=>filter==='all'||l.stage===filter)
    if(search)list=list.filter(l=>l.name.toLowerCase().includes(search.toLowerCase())||l.phone?.includes(search)||l.instagram?.includes(search))
    return [...list].sort((a,b)=>{
      if(sortBy==='overdue')return(isOverdue(b)?1:0)-(isOverdue(a)?1:0)||daysSince(b.next_action_date||b.updated_at)-daysSince(a.next_action_date||a.updated_at)
      if(sortBy==='score')return hxl(b.hunger,b.looking)-hxl(a.hunger,a.looking)
      if(sortBy==='stale')return daysSince(b.updated_at)-daysSince(a.updated_at)
      return b.created_at.localeCompare(a.created_at)
    })
  },[active,archived,filter,sortBy,search])

  // ── funnel with avgDays ──
  const funnel = useMemo(()=>{
    const total=active.length||1
    return STAGES.map((s,i)=>{
      const stageLeads=active.filter(l=>l.stage===s)
      const avgDays=stageLeads.length>0?Math.round(stageLeads.reduce((acc,l)=>acc+daysSince(l.updated_at),0)/stageLeads.length):0
      return{stage:s,count:stageCounts[s]||0,pct:Math.round((stageCounts[s]||0)/total*100),convRate:i>0?Math.round((stageCounts[s]||0)/(stageCounts[STAGES[i-1]]||1)*100):100,avgDays}
    })
  },[active,stageCounts])

  // ── bottleneck ──
  const bottleneck = useMemo(()=>{
    let worst:{stage:string;convRate:number;prevStage:string}|null=null
    funnel.forEach((f,i)=>{
      if(i===0||f.count===0)return
      if(!worst||f.convRate<worst.convRate)worst={stage:f.stage,convRate:f.convRate,prevStage:STAGES[i-1]}
    })
    return worst
  },[funnel])

  const sourceBreakdown = useMemo(()=>{
    const map:Record<string,{total:number;dtm:number;score:number}>={};active.forEach(l=>{const s=l.source||'Other';if(!map[s])map[s]={total:0,dtm:0,score:0};map[s].total++;if(l.stage==='DTM'||l.stage==='Catch-Up')map[s].dtm++;map[s].score+=hxl(l.hunger,l.looking)});return Object.entries(map).map(([src,v])=>({src,total:v.total,dtm:v.dtm,avgScore:Math.round(v.score/v.total),convRate:Math.round(v.dtm/v.total*100)})).sort((a,b)=>b.dtm-a.dtm)
  },[active])

  // ── archive computed ──
  const archiveReasons = useMemo(()=>['all',...Array.from(new Set(archived.map(l=>l.archived_reason||'Archived').filter(Boolean)))]  ,[archived])
  const filteredArchive = useMemo(()=>archiveReasonFilter==='all'?archived:archived.filter(l=>(l.archived_reason||'Archived')===archiveReasonFilter),[archived,archiveReasonFilter])
  const reEngageLeads  = useMemo(()=>archived.filter(l=>(l.archived_reason||'')===('Wrong timing')&&daysSince(l.updated_at)>=90),[archived])

  function leadLogs(id:string){return contactLogs.filter(c=>c.entity_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
  function openAdd(){setEd(null);setForm(blankLead());setErr('');setInvalidFields(new Set());setBanner(null);setOpen(true)}
  function openEdit(l:Lead){setEd(l);setForm({...l});setErr('');setInvalidFields(new Set());setBanner(null);setOpen(true)}

  async function saveLead(force=false){
    if(!userId)return
    const missing=new Set<string>()
    if(!form.name?.trim())missing.add('name')
    if(!form.phone?.trim())missing.add('phone')
    if(!form.source)missing.add('source')
    if(!form.relationship)missing.add('relationship')
    if(!form.age_range)missing.add('age_range')
    if(csvToList(form.life_stage).length===0)missing.add('life_stage')
    if(csvToList(form.primary_driver).length===0)missing.add('primary_driver')
    if(missing.size>0){setInvalidFields(missing);return setErr('Missing required fields')}
    setInvalidFields(new Set())
    if(!ed&&!force){
      const normName=form.name!.trim().toLowerCase()
      const normPhone=(form.phone||'').replace(/\D/g,'')
      const dupe=active.find(l=>l.name.toLowerCase().trim()===normName||(normPhone.length>=8&&(l.phone||'').replace(/\D/g,'')===normPhone))
      if(dupe){setErr(`⚠ Duplicate: "${dupe.name}" already in pipeline. Tap Save again to add anyway.`);return}
    }
    setErr('')
    const score=hxl(form.hunger??5,form.looking??5)
    const l:Lead={id:ed?.id??uid(),user_id:userId,name:form.name!.trim(),phone:form.phone||'',email:form.email||'',instagram:form.instagram||'',contact:form.phone||form.email||form.contact||'',source:form.source||'',stage:form.stage||'Contact',hunger:form.hunger??5,looking:form.looking??5,score,relationship:form.relationship||'',age_range:form.age_range||'',life_stage:form.life_stage||'',primary_driver:form.primary_driver||'',pain_point:form.pain_point||'',archived:false,archived_reason:'',notes:form.notes||'',next_action:form.next_action||'',next_action_date:form.next_action_date||'',created_at:ed?.created_at??now(),updated_at:now()}
    const ok=await safeWrite(async()=>{
      await upsertLead(l)
      if(!ed){
        await addContactLog({id:uid(),user_id:userId,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'lead_created',outcome:'',notes:`Added from ${l.source}`,fathom_link:'',next_action:l.next_action,next_date:l.next_action_date,created_at:new Date().toISOString()})
        // Every new prospect always counts as an interruption + convo + contact,
        // regardless of what stage they're entered at — plus anything further
        // along if they're added directly at a later stage (e.g. a backfilled DTM).
        const stageHabits:Record<string,keyof HabitEntry>={Interruption:'interruptions',Convo:'convo',Contact:'contact',MPA:'mpa','Catch-Up':'catch_up',DTM:'dtm'}
        const idx=Math.max(STAGES.indexOf(l.stage as Stage),STAGES.indexOf('Contact'))
        for(let i=0;i<=idx;i++){const h=stageHabits[STAGES[i]];if(h)await autoLogHabit(h)}
      }
    },'Save lead failed')
    if(ok)setOpen(false)
  }

  async function archiveLead(l:Lead,reason=''){
    const ok=await safeWrite(async()=>{
      await upsertLead({...l,archived:true,archived_reason:reason,updated_at:now()})
      await addContactLog({id:uid(),user_id:userId!,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'disqualified',outcome:'Negative',notes:reason||'Archived',fathom_link:'',next_action:'',next_date:'',created_at:new Date().toISOString()})
    },'Archive lead failed')
    if(ok&&drawerLead?.id===l.id)setDrawerLead(null)
  }

  async function restoreLead(l:Lead){await safeWrite(()=>upsertLead({...l,archived:false,archived_reason:'',updated_at:now()}),'Restore lead failed')}

  async function changeStage(l:Lead,newStage:Stage){
    if(newStage===l.stage)return
    const oldIdx=STAGES.indexOf(l.stage as Stage)
    const newIdx=STAGES.indexOf(newStage)
    const forward=newIdx>oldIdx
    const eventType=newStage.toLowerCase().replace('-','_').replace(/\s+/g,'_')
    const ok=await safeWrite(async()=>{
      await upsertLead({...l,stage:newStage,updated_at:now()})
      await addContactLog({id:uid(),user_id:userId!,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:eventType,outcome:forward?'Positive':'Negative',notes:forward?`Advanced to ${newStage}`:`Moved back to ${newStage}`,fathom_link:'',next_action:'',next_date:'',created_at:new Date().toISOString()})
    },'Stage change failed')
    if(!ok)return
    // Moving forward credits the habit for every stage skipped over; moving
    // back doesn't take credit away — those contacts already happened.
    if(forward){
      for(let i=oldIdx+1;i<=newIdx;i++){
        const h=STAGE_HABIT[STAGES[i].toLowerCase().replace('-','_')]
        if(h)await autoLogHabit(h)
      }
    }
  }

  async function logContact(){
    if(!contactModal||!userId)return
    const l=contactModal
    const ok=await safeWrite(async()=>{
      await addContactLog({id:uid(),user_id:userId,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'contacted',outcome:'',notes:contactLog.notes,fathom_link:'',next_action:'',next_date:'',created_at:new Date().toISOString()})
    },'Log contact failed')
    if(ok){
      setContactModal(null);setContactLog({notes:''})
    }
  }

  async function convertToCandidate(){
    const l=bookPFModal;if(!l||!userId)return
    if(converting)return
    setConverting(true)
    try{
      const ok=await safeWrite(async()=>{
        await upsertCandidate({id:uid(),user_id:userId,name:l.name,email:l.email||'',phone:l.phone||'',stage:'Pre-Filter',source:l.source,interview_notes:JSON.stringify({}),status:'active',sponsor_ibo:iboNumber,booker_ibo:iboNumber,hxl_score:l.score,hunger:l.hunger,looking:l.looking,relationship:l.relationship||'',age_range:l.age_range||'',life_stage:l.life_stage||'',primary_driver:l.primary_driver||'',pain_point:l.pain_point||'',created_at:now(),updated_at:now()})
        await addContactLog({id:uid(),user_id:userId,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'converted_to_candidate',outcome:'Positive',notes:'Converted from Pipeline to Candidate — Pre-Filter stage',fathom_link:'',next_action:'Book Pre-Filter',next_date:'',created_at:new Date().toISOString()})
        await deleteLead(l.id)
      },'Conversion failed')
      if(ok){await autoLogHabit('pre_filter');setBookPFModal(null)}
    }finally{setConverting(false)}
  }

  async function getPreCallBrief(l:Lead){
    setBriefModal({lead:l,text:'',loading:true})
    const logs=leadLogs(l.id).slice(0,3)
    try{
      const text=buildPreCallBrief({
        name:l.name,
        stageLabel:l.stage,
        daysSinceContact:daysSince(l.updated_at),
        driver:l.primary_driver,
        painPoint:l.pain_point,
        metricLabel:'HxL',metricValue:hxl(l.hunger,l.looking),
        notes:l.notes,
        nextAction:l.next_action,
        recentOutcomes:logs.map(c=>c.outcome),
      })
      setBriefModal(p=>p?{...p,text,loading:false}:null)
    }catch{setBriefModal(p=>p?{...p,text:'Failed.',loading:false}:null)}
  }

  function handleDragOver(e:React.DragEvent){e.preventDefault();setDragOver(true)}
  function handleDragLeave(e:React.DragEvent){if(!e.currentTarget.contains(e.relatedTarget as Node))setDragOver(false)}
  function handleDrop(e:React.DragEvent){
    e.preventDefault();setDragOver(false)
    const file=e.dataTransfer.files[0]
    if(file)openCSVFile(file)
  }
  function openCSVFile(file:File){
    const reader=new FileReader()
    reader.onload=(ev)=>{
      const text=ev.target?.result as string
      const{headers,rows}=parseCSV(text)
      if(!headers.length)return
      const mapping:Record<number,keyof Lead|''>= {}
      headers.forEach((h,i)=>{mapping[i]=CSV_FIELD_MAP[h.toLowerCase().trim()]||''})
      setCsvModal({headers,rows,mapping})
    }
    reader.readAsText(file)
  }
  async function importCSV(){
    if(!csvModal||!userId)return
    const{rows,mapping}=csvModal
    let done=0,skipped=0
    setCsvProgress({done:0,total:rows.length,skipped:0})
    for(const row of rows){
      const base=blankLead() as Lead
      let hasName=false
      Object.entries(mapping).forEach(([colStr,field])=>{
        if(!field)return
        const val=(row[parseInt(colStr,10)]||'').trim()
        if(val)(base as any)[field]=val
        if(field==='name'&&val)hasName=true
      })
      if(!hasName){skipped++;done++;setCsvProgress({done,total:rows.length,skipped});continue}
      const basePhone=(base.phone||'').replace(/\D/g,'')
      if(basePhone&&myLeads.some(l=>(l.phone||'').replace(/\D/g,'')===basePhone)){skipped++;done++;setCsvProgress({done,total:rows.length,skipped});continue}
      const l:Lead={...base,id:uid(),user_id:userId,score:hxl(base.hunger??5,base.looking??5),created_at:now(),updated_at:now()}
      try{await upsertLead(l)}catch(e:any){console.error('importCSV upsertLead failed:',e?.message);skipped++}
      done++;setCsvProgress({done,total:rows.length,skipped})
    }
    setTimeout(()=>{setCsvModal(null);setCsvProgress(null)},1500)
  }

  const cardProps = {candidates,contactLogs,setContactModal,setContactLog,setBookPFModal,setBriefModal,setDrawerLead,openEdit,changeStage}

  return(
    <ErrorBoundary label="Pipeline">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:100}}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

      {/* Status banner */}
      {banner&&(
        <div style={{marginBottom:10,padding:'8px 14px',background:banner.type==='error'?'rgba(224,85,85,0.06)':'rgba(76,175,125,0.06)',border:`1px solid ${banner.type==='error'?RED:GREEN}30`,borderRadius:'var(--r)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <span style={{fontSize:11,color:banner.type==='error'?RED:GREEN}}>{banner.type==='error'?'⚠️ ':'✓ '}{banner.msg}</span>
          <button onClick={()=>setBanner(null)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:14,flexShrink:0}}>×</button>
        </div>
      )}

      {/* ── TABS ──────────────────────────────────────────── */}
      <div style={{marginBottom:10}}>
        <div style={{display:'flex',gap:3,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)',overflowX:'auto' as const}}>
          {(['leads','funnel','archived'] as View[]).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              style={{flex:1,padding:'8px 10px',borderRadius:'var(--r)',border:'none',background:view===v?'var(--s3)':'transparent',color:view===v?GOLD:'var(--text3)',fontSize:11,fontWeight:view===v?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",textTransform:'capitalize' as const,transition:'all 0.15s',whiteSpace:'nowrap' as const}}>
              {v==='leads'?`📋 All (${active.length})`:v==='funnel'?'📊 Funnel':`🗄 Archived (${archived.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── STATS STRIP (all views) ───────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:10}}>
        {[
          {label:'Active',value:active.length,color:GOLD},
          {label:'Overdue',value:statsOverdue.length,color:RED},
          {label:'DTM Ready',value:statsDTM.length,color:GREEN},
          {label:'Hot HxL≥70',value:statsHot.length,color:GREEN},
        ].map(x=>(
          <div key={x.label} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r)',padding:'8px 10px',textAlign:'center' as const}}>
            <div className="mono" style={{fontSize:20,fontWeight:800,color:x.color,lineHeight:1}}>{x.value}</div>
            <div style={{fontSize:9,color:'var(--text4)',marginTop:2,letterSpacing:'0.5px'}}>{x.label}</div>
          </div>
        ))}
      </div>

      {/* ── WEEKLY DIGEST ─────────────────────────────────── */}
      {showDigest&&(
        <div style={{marginBottom:12,padding:'8px 14px',background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r)',fontSize:11,color:'var(--text3)',display:'flex',gap:12,flexWrap:'wrap' as const,alignItems:'center'}}>
          <span style={{fontSize:9,color:'var(--text4)',letterSpacing:'1.5px',textTransform:'uppercase' as const,fontWeight:700,flexShrink:0}}>7-day</span>
          {weeklyDigest.newLeads>0&&<span style={{color:BLUE}}>+{weeklyDigest.newLeads} new</span>}
          {weeklyDigest.advances>0&&<span style={{color:GREEN}}>↑{weeklyDigest.advances} advanced</span>}
          {weeklyDigest.dtms>0&&<span style={{color:GOLD}}>{weeklyDigest.dtms} DTMs</span>}
          {weeklyDigest.archives>0&&<span style={{color:'var(--text4)'}}>✗{weeklyDigest.archives} archived</span>}
        </div>
      )}

      {/* ── LEADS VIEW ────────────────────────────────────── */}
      {view==='leads'&&(
        <div>
          {/* Stage filter pills */}
          <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto' as const,paddingBottom:4}}>
            {(['all',...STAGES] as (Stage|'all')[]).map(s=>{
              const count=s==='all'?active.length:(stageCounts[s]||0)
              const active_=filter===s
              return(
                <button key={s} onClick={()=>setFilter(s)}
                  style={{padding:'5px 12px',borderRadius:999,border:`1px solid ${active_?GOLD:'var(--br)'}`,background:active_?'rgba(200,162,74,0.15)':'var(--s1)',color:active_?GOLD:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:active_?700:400,flexShrink:0,whiteSpace:'nowrap' as const}}>
                  {s==='all'?'All':s} {count}
                </button>
              )
            })}
          </div>
          {/* Search row */}
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' as const,alignItems:'center'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, Instagram…" style={{flex:1,minWidth:160,...INP}}/>
            <button onClick={()=>{const i=document.createElement('input');i.type='file';i.accept='.csv';i.onchange=(e)=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)openCSVFile(f)};i.click()}}
              style={{padding:'9px 12px',borderRadius:'var(--r)',border:`1px solid ${BLUE}50`,background:'transparent',color:BLUE,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:700,flexShrink:0}}>↑ CSV</button>
            <button onClick={openAdd} style={{padding:'9px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:700,flexShrink:0}}>+ Add Prospect</button>
          </div>
          {displayed.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No prospects in this view</div>
            :displayed.map(l=><LeadCard key={l.id} l={l} {...cardProps} isDupe={dupeSet.has(l.id)} touchCount={touchCountMap[l.id]??0} nextDue={nextDueMap[l.id]}/>)
          }
        </div>
      )}

      {/* ── FUNNEL VIEW ───────────────────────────────────── */}
      {view==='funnel'&&(
        <div>
          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Stage Funnel</div>
            {funnel.map((f,i)=>{
              const cfg=STAGE_CFG[f.stage as Stage]
              return(
                <div key={f.stage} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12,fontWeight:600,color:cfg.color}}>{f.stage}</span>
                      <span className="mono" style={{fontSize:11,color:'var(--text4)'}}>{f.count}</span>
                      {i>0&&f.count>0&&<span style={{fontSize:10,color:'var(--text4)'}}>({f.convRate}% from prev)</span>}
                      {f.count>0&&<span style={{fontSize:10,color:'var(--text4)',fontStyle:'italic'}}>~{f.avgDays}d avg</span>}
                    </div>
                    <span style={{fontSize:10,color:'var(--text4)'}}>{f.pct}% of pipeline</span>
                  </div>
                  <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${f.pct}%`,background:cfg.color,borderRadius:3,transition:'width 0.8s'}}/>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottleneck card */}
          {bottleneck&&(
            <div style={{...CARD,marginBottom:12,borderLeft:`3px solid ${RED}`}}>
              <div style={SL}>Bottleneck</div>
              <div style={{fontSize:12,color:'var(--text2)'}}>
                ⚡ <span style={{fontWeight:700,color:RED}}>{bottleneck.stage}</span> — only <span style={{fontWeight:700,color:RED}}>{bottleneck.convRate}%</span> convert from {bottleneck.prevStage}
              </div>
            </div>
          )}

          {/* Source performance with conv rate */}
          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Source Performance</div>
            {sourceBreakdown.length===0
              ?<div style={{fontSize:12,color:'var(--text4)'}}>No data yet</div>
              :sourceBreakdown.map(s=>(
                <div key={s.src} style={{paddingBottom:10,borderBottom:'1px solid var(--br)',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                    <div style={{fontSize:12,fontWeight:600,flex:1}}>{s.src}</div>
                    <div style={{fontSize:10,color:'var(--text4)'}}>{s.total} leads</div>
                    <div style={{fontSize:10,color:GOLD,fontWeight:600}}>{s.dtm} warm</div>
                    <div style={{fontSize:10,color:TEAL,fontWeight:600}}>avg HxL {s.avgScore}</div>
                    <div style={{fontSize:10,color:GREEN,fontWeight:700}}>{s.convRate}% conv</div>
                  </div>
                  <div style={{height:4,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${Math.min(100,s.convRate)}%`,background:`linear-gradient(90deg,${GREEN},${TEAL})`,borderRadius:2,transition:'width 0.8s'}}/>
                  </div>
                </div>
              ))
            }
          </div>

        </div>
      )}

      {/* ── LEAD DRAWER ───────────────────────────────────── */}
      {drawerLead&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setDrawerLead(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:560,overflow:'hidden'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid var(--br)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{drawerLead.name}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:(STAGE_CFG[drawerLead.stage as Stage]??STAGE_CFG['Convo']).bg,color:(STAGE_CFG[drawerLead.stage as Stage]??STAGE_CFG['Convo']).color,fontWeight:600}}>{drawerLead.stage}</span>
                  <span style={{fontSize:10,color:'var(--text4)'}}>{drawerLead.source}</span>
                  {drawerLead.phone&&<span style={{fontSize:10,color:'var(--text4)'}}>{drawerLead.phone}</span>}
                  {drawerLead.instagram&&<span style={{fontSize:10,color:PURPLE}}>@{drawerLead.instagram}</span>}
                </div>
              </div>
              <button onClick={()=>setDrawerLead(null)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:22}}>×</button>
            </div>
            <div style={{padding:'18px 24px',maxHeight:'70vh',overflowY:'auto' as const}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                {[{l:'HxL Score',v:`${hxl(drawerLead.hunger,drawerLead.looking)} (H${drawerLead.hunger}×L${drawerLead.looking})`,c:hxlColor(hxl(drawerLead.hunger,drawerLead.looking))},{l:'Relationship',v:drawerLead.relationship||'—',c:'var(--text2)'},{l:'Age Range',v:drawerLead.age_range||'—',c:'var(--text2)'},{l:'Primary Driver',v:drawerLead.primary_driver||'—',c:GOLD},{l:'Source',v:drawerLead.source,c:'var(--text2)'}].map(x=>(
                  <div key={x.l}>
                    <div style={{fontSize:9,color:'var(--text4)',marginBottom:2}}>{x.l}</div>
                    <div style={{fontSize:12,fontWeight:600,color:x.c}}>{x.v}</div>
                  </div>
                ))}
              </div>
              {drawerLead.pain_point&&(
                <div style={{marginBottom:16,padding:'10px 12px',background:'var(--s2)',borderRadius:'var(--r)',borderLeft:`3px solid ${GOLD}`}}>
                  <div style={{fontSize:9,color:'var(--text4)',marginBottom:4}}>THEIR WHY</div>
                  <div style={{fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>"{drawerLead.pain_point}"</div>
                </div>
              )}

              {/* Contact History */}
              <div style={SL}>Contact History</div>
              {leadLogs(drawerLead.id).length===0
                ?<div style={{fontSize:12,color:'var(--text4)',marginBottom:16}}>No contact logged yet</div>
                :leadLogs(drawerLead.id).map(log=>(
                  <div key={log.id} style={{padding:'8px 0',borderBottom:'1px solid var(--br)',marginBottom:4}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                      <span style={{fontSize:10,fontWeight:600,color:{Positive:GREEN,Negative:RED,Neutral:GOLD,'No Show':RED,'Not Yet':'var(--text4)'}[log.outcome]??'var(--text4)'}}>{log.outcome||log.event_type}</span>
                      <span style={{fontSize:9,color:'var(--text4)'}}>{log.created_at.slice(0,10)}</span>
                    </div>
                    {log.notes&&<div style={{fontSize:11,color:'var(--text3)',lineHeight:1.5}}>{log.notes}</div>}
                    {log.next_action&&<div style={{fontSize:10,color:'var(--text4)',marginTop:2}}>Next: {log.next_action}{log.next_date?` · ${fmtDate(log.next_date)}`:''}</div>}
                  </div>
                ))
              }

              {/* Timeline — stage-change events */}
              {(()=>{
                const timelineLogs=leadLogs(drawerLead.id).filter(l=>['convo','contact','mpa','catch_up','dtm','lead_created'].includes(l.event_type))
                if(timelineLogs.length===0)return null
                return(
                  <div style={{marginTop:16}}>
                    <div style={SL}>Stage Timeline</div>
                    <div style={{position:'relative' as const,paddingLeft:14}}>
                      <div style={{position:'absolute' as const,left:4,top:4,bottom:4,width:1,background:'var(--br)'}}/>
                      {timelineLogs.map((log,i)=>{
                        const prev=timelineLogs[i+1]
                        const daysSpent=prev?Math.floor((new Date(log.created_at).getTime()-new Date(prev.created_at).getTime())/86400000):null
                        return(
                          <div key={log.id} style={{marginBottom:10,position:'relative' as const}}>
                            <div style={{position:'absolute' as const,left:-10,top:3,width:7,height:7,borderRadius:'50%',background:GOLD,border:'1px solid var(--s1)'}}/>
                            <div style={{fontSize:11,fontWeight:700,color:'var(--text2)'}}>{log.event_type.replace(/_/g,' ')}</div>
                            <div style={{fontSize:10,color:'var(--text4)'}}>{log.created_at.slice(0,10)}{daysSpent!==null?` · ${daysSpent}d in stage`:''}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap' as const,alignItems:'center'}}>
                <button onClick={()=>{setContactModal(drawerLead);setContactLog({notes:''});setDrawerLead(null)}}
                  style={{padding:'8px 14px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}10`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,fontWeight:600}}>
                  ✓ Log Contact
                </button>
                {STAGES.indexOf(drawerLead.stage as Stage)>0&&(
                  <button onClick={()=>changeStage(drawerLead,STAGES[STAGES.indexOf(drawerLead.stage as Stage)-1])} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text2)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>
                    ← {STAGES[STAGES.indexOf(drawerLead.stage as Stage)-1]}
                  </button>
                )}
                {STAGES.indexOf(drawerLead.stage as Stage)<STAGES.length-1&&(
                  <button onClick={()=>changeStage(drawerLead,STAGES[STAGES.indexOf(drawerLead.stage as Stage)+1])} style={{padding:'8px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,fontWeight:600}}>
                    → {STAGES[STAGES.indexOf(drawerLead.stage as Stage)+1]}
                  </button>
                )}
                <button onClick={()=>{openEdit(drawerLead);setDrawerLead(null)}} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text2)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Edit Profile</button>
                {!drawerLead.archived&&<button onClick={()=>{setArchiveModal(drawerLead);setDrawerLead(null)}} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.3)',background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Archive</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ─────────────────────────────────────── */}
      {open&&(()=>{
        const hxlNow=hxl(form.hunger??5,form.looking??5)
        const SECTION:React.CSSProperties={background:'var(--s2)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px',marginBottom:14}
        const SECTION_HEAD:React.CSSProperties={display:'flex',alignItems:'center',gap:8,marginBottom:14}
        const SECTION_ICON:React.CSSProperties={width:24,height:24,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0}
        const initials=(form.name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()).join('')||'?'
        return(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:560,overflow:'hidden',margin:'auto',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column' as const,maxHeight:'88vh'}}>
            <div style={{padding:'20px 24px',borderBottom:'1px solid var(--br)',display:'flex',alignItems:'center',gap:14,background:'linear-gradient(180deg,var(--s2),var(--s1))',flexShrink:0}}>
              <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${GOLD},var(--gold3))`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:15,color:'#000',flexShrink:0}}>{initials}</div>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:17,fontWeight:800,whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis'}}>{form.name?.trim()||(ed?'Edit Prospect':'New Prospect')}</div>
                <div style={{fontSize:11,color:'var(--text4)',marginTop:2}}>{ed?'Editing existing prospect':'Add to your pipeline'}</div>
              </div>
              <button onClick={()=>setOpen(false)} style={{width:28,height:28,borderRadius:8,border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text3)',cursor:'pointer',fontSize:14,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
            </div>
            <div style={{padding:'20px 24px',overflowY:'auto' as const,flex:1}}>

              <div style={SECTION}>
                <div style={SECTION_HEAD}>
                  <span style={{...SECTION_ICON,background:'rgba(200,162,74,0.15)'}}>🪪</span>
                  <span style={{fontSize:12,fontWeight:800,letterSpacing:'0.5px'}}>Identity</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div style={{gridColumn:'1/-1'}}>
                    <div style={SL}>Name *</div>
                    <input value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Full name" style={{...INP,border:`1px solid ${invalidFields.has('name')?RED:'var(--br2)'}`}}/>
                  </div>
                  <div>
                    <div style={SL}>Phone *</div>
                    <input type="tel" value={form.phone||''} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+61 4XX XXX XXX" style={{...INP,border:`1px solid ${invalidFields.has('phone')?RED:'var(--br2)'}`}}/>
                  </div>
                  <div>
                    <div style={SL}>Email</div>
                    <input type="email" value={form.email||''} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="name@email.com" style={INP}/>
                  </div>
                  <div>
                    <div style={SL}>Relationship *</div>
                    <select value={form.relationship||''} onChange={e=>setForm(p=>({...p,relationship:e.target.value}))} style={{...SEL,border:`1px solid ${invalidFields.has('relationship')?RED:'var(--br2)'}`}}>
                      <option value="">Select…</option>
                      {RELATIONS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={SL}>Stage</div>
                    <select value={form.stage||'Contact'} onChange={e=>setForm(p=>({...p,stage:e.target.value}))} style={SEL}>
                      {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div style={SECTION}>
                <div style={SECTION_HEAD}>
                  <span style={{...SECTION_ICON,background:'rgba(224,85,85,0.15)'}}>🔥</span>
                  <span style={{fontSize:12,fontWeight:800,letterSpacing:'0.5px'}}>Scoring</span>
                  <span className="mono" style={{marginLeft:'auto',fontSize:11,color:'var(--text4)'}}>HxL</span>
                  <span className="mono" style={{fontSize:16,fontWeight:800,color:hxlColor(hxlNow)}}>{hxlNow}</span>
                </div>
                {([{k:'hunger' as const,label:'Hunger',anchors:HUNGER_ANCHORS},{k:'looking' as const,label:'Looking',anchors:LOOKING_ANCHORS}]).map(f=>(
                  <div key={f.k} style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <div style={SL}>{f.label} (1–10)</div>
                      <span className="mono" style={{fontSize:12,fontWeight:700,color:hxlColor((form[f.k]??5)*10)}}>{form[f.k]??5}/10</span>
                    </div>
                    <input type="range" min={1} max={10} value={form[f.k]??5} onChange={e=>setForm(p=>({...p,[f.k]:parseInt(e.target.value,10)}))} style={{width:'100%',accentColor:hxlColor((form[f.k]??5)*10),marginBottom:4}}/>
                    <div style={{fontSize:9,color:'var(--text4)',textAlign:'center' as const}}>{f.anchors[Math.round(((form[f.k]??5)-1)/9*4)]}</div>
                  </div>
                ))}
              </div>

              <div style={SECTION}>
                <div style={SECTION_HEAD}>
                  <span style={{...SECTION_ICON,background:'rgba(91,155,213,0.15)'}}>🧭</span>
                  <span style={{fontSize:12,fontWeight:800,letterSpacing:'0.5px'}}>Context</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                  <div>
                    <div style={SL}>Source *</div>
                    <select value={form.source||''} onChange={e=>setForm(p=>({...p,source:e.target.value}))} style={{...SEL,border:`1px solid ${invalidFields.has('source')?RED:'var(--br2)'}`}}>
                      <option value="">Select…</option>
                      {SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={SL}>Age Range *</div>
                    <select value={form.age_range||''} onChange={e=>setForm(p=>({...p,age_range:e.target.value}))} style={{...SEL,border:`1px solid ${invalidFields.has('age_range')?RED:'var(--br2)'}`}}>
                      <option value="">Select…</option>
                      {AGE_RANGES.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <MultiSelectDropdown label="Life Stage *" options={LIFE_STAGES} max={3} invalid={invalidFields.has('life_stage')}
                    values={csvToList(form.life_stage)} onChange={v=>setForm(p=>({...p,life_stage:v.join(', ')}))}/>
                  <MultiSelectDropdown label="Primary Driver *" options={DRIVERS} max={3} invalid={invalidFields.has('primary_driver')}
                    values={csvToList(form.primary_driver)} onChange={v=>setForm(p=>({...p,primary_driver:v.join(', ')}))}/>
                </div>
                <div style={{marginBottom:0}}>
                  <div style={SL}>Their Why (goal / motivation)</div>
                  <input value={form.pain_point||''} onChange={e=>setForm(p=>({...p,pain_point:e.target.value}))} placeholder="What drives them? What are they moving toward?" style={INP}/>
                </div>
              </div>

              <div style={SECTION}>
                <div style={SECTION_HEAD}>
                  <span style={{...SECTION_ICON,background:'rgba(155,91,213,0.15)'}}>📝</span>
                  <span style={{fontSize:12,fontWeight:800,letterSpacing:'0.5px'}}>Notes</span>
                </div>
                <textarea value={form.notes||''} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={3} placeholder="Anything relevant…" style={{...INP,resize:'vertical' as const}}/>
              </div>

              {err&&<div style={{color:RED,fontSize:12,marginBottom:6,padding:'8px 12px',background:'rgba(224,85,85,0.08)',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.25)'}}>{err}</div>}
            </div>
            <div style={{display:'flex',gap:8,padding:'16px 24px',borderTop:'1px solid var(--br)',background:'var(--s1)',flexShrink:0}}>
              <button onClick={()=>saveLead(err.startsWith('⚠ Duplicate'))} style={{flex:1,padding:'12px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GOLD},var(--gold3))`,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>
                {ed?'Save Changes':err.startsWith('⚠ Duplicate')?'Add Anyway':'Save Prospect'}
              </button>
              <button onClick={()=>setOpen(false)} style={{padding:'12px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              {ed&&<button onClick={()=>{setArchiveModal(ed);setOpen(false)}} style={{padding:'12px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.3)',background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Archive</button>}
            </div>
          </div>
        </div>
        )})()}

      {/* ── LOG CONTACT MODAL ─────────────────────────────── */}
      {contactModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setContactModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:420,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Log Contact — {contactModal.name}</div>
            <div style={{fontSize:10,color:'var(--text4)',marginBottom:18}}>{contactModal.stage} · HxL {hxl(contactModal.hunger,contactModal.looking)} · {contactModal.primary_driver||contactModal.source}</div>
            <div style={{marginBottom:18}}>
              <div style={SL}>Notes</div>
              <textarea value={contactLog.notes} onChange={e=>setContactLog({notes:e.target.value})} rows={5} placeholder="What happened? Key moments, commitments…" autoFocus style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={logContact} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GREEN},var(--green2))`,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save Log</button>
              <button onClick={()=>setContactModal(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOOK PF MODAL ─────────────────────────────────── */}
      {bookPFModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setBookPFModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:380,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Convert to Candidate → {bookPFModal.name}</div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:20,lineHeight:1.6}}>
              This will create a Candidate record from this DTM lead. HxL score {hxl(bookPFModal.hunger,bookPFModal.looking)}, driver, and pain point carry over.
            </div>
            {bookPFModal.primary_driver&&<div style={{padding:'10px 12px',background:'var(--s2)',borderRadius:'var(--r)',marginBottom:20,fontSize:11,color:GOLD}}>Driver: {bookPFModal.primary_driver}{bookPFModal.pain_point?` · "${bookPFModal.pain_point}"`:''}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={convertToCandidate} disabled={converting} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GOLD},var(--gold3))`,color:'#000',fontWeight:700,cursor:converting?'not-allowed':'pointer',opacity:converting?0.6:1,fontFamily:"'Sora',sans-serif"}}>{converting?'Converting…':'🚀 Confirm — Convert to Candidate'}</button>
              <button onClick={()=>setBookPFModal(null)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRE-CALL BRIEF MODAL ──────────────────────────── */}
      {briefModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setBriefModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:460,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:GOLD,marginBottom:4}}>Pre-Call Brief</div>
            <div style={{fontSize:12,color:'var(--text4)',marginBottom:16}}>{briefModal.lead.name} · {briefModal.lead.stage} · HxL {hxl(briefModal.lead.hunger,briefModal.lead.looking)}</div>
            {briefModal.loading
              ?<div style={{fontSize:13,color:'var(--text3)',fontStyle:'italic',padding:'20px 0'}}>Generating…</div>
              :<div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,whiteSpace:'pre-wrap' as const}}>{briefModal.text}</div>
            }
            <div style={{display:'flex',gap:8,marginTop:20}}>
              {!briefModal.loading&&<button onClick={()=>getPreCallBrief(briefModal.lead)} style={{padding:'8px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:'rgba(200,162,74,0.08)',color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>↻ Refresh</button>}
              <button onClick={()=>setBriefModal(null)} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION ───────────────────────────── */}
      {deleteLeadConfirm&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setDeleteLeadConfirm(null)}}>
          <div style={{background:'var(--s1)',border:`1px solid ${RED}40`,borderRadius:'var(--r3)',width:'100%',maxWidth:400,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:RED,marginBottom:8}}>Permanently Delete?</div>
            <div style={{fontSize:13,color:'var(--text3)',marginBottom:20,lineHeight:1.6}}>
              This will permanently delete <strong style={{color:'var(--text)'}}>{deleteLeadConfirm.name}</strong> and all their contact history from Supabase. This cannot be undone.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setDeleteLeadConfirm(null)} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={async()=>{await safeWrite(()=>deleteLead(deleteLeadConfirm.id),'Delete failed');setDeleteLeadConfirm(null)}}
                style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:RED,color:'#fff',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:700}}>
                🗑 Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ARCHIVED VIEW ─────────────────────────────────── */}
      {view==='archived'&&(
        <div>
          {/* Reason filter pills */}
          {archiveReasons.length>1&&(
            <div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto' as const,paddingBottom:4}}>
              {archiveReasons.map(r=>{
                const isActive=archiveReasonFilter===r
                return(
                  <button key={r} onClick={()=>setArchiveReasonFilter(r)}
                    style={{padding:'5px 12px',borderRadius:999,border:`1px solid ${isActive?RED:'var(--br)'}`,background:isActive?'rgba(224,85,85,0.1)':'var(--s1)',color:isActive?RED:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:isActive?700:400,flexShrink:0,whiteSpace:'nowrap' as const}}>
                    {r==='all'?`All (${archived.length})`:r}
                  </button>
                )
              })}
            </div>
          )}

          {archived.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No archived leads</div>
            :(
              <div>
                <div style={{fontSize:11,color:'var(--text4)',marginBottom:12}}>{filteredArchive.length} prospect{filteredArchive.length===1?'':'s'}</div>
                {filteredArchive.map(l=>{
                  const cfg=STAGE_CFG[l.stage as Stage]??STAGE_CFG['Convo']
                  return(
                    <div key={l.id} style={{...CARD,marginBottom:8,opacity:0.85}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{l.name}</div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{l.stage}</span>
                            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.1)',color:RED}}>{l.archived_reason||'Archived'}</span>
                            <span style={{fontSize:10,color:'var(--text4)'}}>{l.source}</span>
                          </div>
                        </div>
                        <div className="mono" style={{fontSize:18,fontWeight:800,color:'var(--text4)',flexShrink:0,marginLeft:8}}>{hxl(l.hunger,l.looking)}</div>
                      </div>
                      {l.notes&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:8,fontStyle:'italic'}}>"{l.notes.slice(0,80)}"</div>}
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>restoreLead(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>↩ Restore</button>
                        <button onClick={()=>setDeleteLeadConfirm(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${RED}30`,background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>🗑 Delete</button>
                      </div>
                    </div>
                  )
                })}

                {/* Re-engagement queue */}
                {reEngageLeads.length>0&&(
                  <div style={{marginTop:20}}>
                    <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                      ↩ Ready to re-engage? <span style={{fontSize:10,fontWeight:400,color:'var(--text4)'}}>Wrong timing · 90+ days</span>
                    </div>
                    {reEngageLeads.map(l=>(
                      <div key={l.id} style={{...CARD,marginBottom:8,borderLeft:`3px solid ${GOLD}`,opacity:0.9}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{l.name}</div>
                            <div style={{fontSize:10,color:'var(--text4)'}}>{daysSince(l.updated_at)}d ago · {l.source}</div>
                          </div>
                          <button onClick={()=>restoreLead(l)} style={{padding:'7px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:700,flexShrink:0}}>↩ Restore</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }
        </div>
      )}

      {/* ── ARCHIVE MODAL ─────────────────────────────────── */}
      {archiveModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setArchiveModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:380,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4,color:RED}}>Archive — {archiveModal.name}</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:20}}>Select a reason:</div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:8,marginBottom:20}}>
              {[
                {r:'Not interested',l:'Not interested'},
                {r:'Wrong timing',l:'Wrong timing — follow up later'},
                {r:'No show x3',l:'No show ×3'},
                {r:'Lost contact',l:'Lost contact'},
                {r:'Converted to candidate',l:'Converted to candidate'},
                {r:'Other',l:'Other'},
              ].map(x=>(
                <button key={x.r} onClick={()=>{archiveLead(archiveModal,x.r);setArchiveModal(null)}}
                  style={{padding:'10px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text2)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,textAlign:'left' as const,transition:'background 0.15s'}}>
                  {x.l}
                </button>
              ))}
            </div>
            <button onClick={()=>setArchiveModal(null)} style={{width:'100%',padding:'10px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
          </div>
        </div>
      )}


      {/* ── DRAG OVERLAY ──────────────────────────────────── */}
      {dragOver&&(
        <div style={{position:'fixed',inset:0,background:'rgba(91,155,213,0.06)',border:`2px dashed ${BLUE}`,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
          <div style={{fontSize:20,fontWeight:700,color:BLUE,background:'var(--s1)',padding:'18px 32px',borderRadius:'var(--r3)',border:`1px solid ${BLUE}40`}}>Drop CSV to import leads</div>
        </div>
      )}

      {/* ── CSV UPLOAD MODAL ──────────────────────────────── */}
      {csvModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget&&!csvProgress)setCsvModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:540,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Import Leads from CSV</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:18}}>{csvModal.rows.length} rows · Map columns then confirm</div>
            <div style={{marginBottom:16}}>
              <div style={SL}>Column Mapping</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {csvModal.headers.map((h,i)=>(
                  <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{fontSize:10,color:'var(--text3)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}} title={h}>{h}</span>
                    <select value={csvModal.mapping[i]||''} onChange={e=>{const m={...csvModal.mapping,[i]:e.target.value as keyof Lead|''};setCsvModal(p=>p?{...p,mapping:m}:null)}}
                      style={{...SEL,fontSize:10,padding:'4px 8px',flex:1}}>
                      <option value="">Ignore</option>
                      {(['name','phone','instagram','source','stage','notes','contact'] as (keyof Lead)[]).map(f=><option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div style={{marginBottom:18,overflowX:'auto' as const}}>
              <div style={SL}>Preview (first 5 rows)</div>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:10,color:'var(--text3)'}}>
                <thead><tr>{csvModal.headers.map((h,i)=><th key={i} style={{padding:'4px 8px',textAlign:'left' as const,borderBottom:'1px solid var(--br)',color:'var(--text4)',fontWeight:600}}>{h}</th>)}</tr></thead>
                <tbody>{csvModal.rows.slice(0,5).map((row,ri)=><tr key={ri}>{csvModal.headers.map((_,i)=><td key={i} style={{padding:'4px 8px',borderBottom:'1px solid var(--br)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{row[i]||''}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {csvProgress&&(
              <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(76,175,125,0.06)',border:`1px solid ${GREEN}30`,borderRadius:'var(--r)'}}>
                <div style={{fontSize:12,color:GREEN,fontWeight:700,marginBottom:6}}>{csvProgress.done}/{csvProgress.total} processed{csvProgress.skipped>0?` · ${csvProgress.skipped} skipped`:''}</div>
                <div style={{height:4,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.round(csvProgress.done/csvProgress.total*100)}%`,background:GREEN,borderRadius:2,transition:'width 0.2s'}}/></div>
              </div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button onClick={importCSV} disabled={!!csvProgress}
                style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${BLUE},#4a8ab0)`,color:'#fff',fontWeight:700,cursor:csvProgress?'wait':'pointer',fontFamily:"'Sora',sans-serif",fontSize:13,opacity:csvProgress?0.7:1}}>
                {csvProgress?`Importing… ${csvProgress.done}/${csvProgress.total}`:`Import ${csvModal.rows.length} Lead${csvModal.rows.length===1?'':'s'}`}
              </button>
              <button onClick={()=>setCsvModal(null)} disabled={!!csvProgress}
                style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:csvProgress?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",opacity:csvProgress?0.5:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
    </ErrorBoundary>
  )
}
