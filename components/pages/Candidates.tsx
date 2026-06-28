'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now } from '@/lib/utils'
import { buildPreCallBrief, suggestFollowUpDays } from '@/lib/aiText'
import type { Candidate, Partner, ContactLog } from '@/lib/stores'

// ── STAGES ────────────────────────────────────────────────
const STAGES = ['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer Questions','Offer Call'] as const
type Stage = typeof STAGES[number]
const STAGE_CFG: Record<Stage,{color:string;bg:string;next:Stage|null;nextAction:string}> = {
  'Pre-Filter':     {color:'var(--blue)',   bg:'rgba(91,155,213,0.12)',  next:'MG1',             nextAction:'Run Pre-Filter call'},
  'MG1':            {color:'var(--purple)', bg:'rgba(155,91,213,0.12)', next:'MG2',             nextAction:'Run MG1'},
  'MG2':            {color:'var(--teal)',   bg:'rgba(91,213,155,0.12)', next:'FU1',             nextAction:'Run MG2'},
  'FU1':            {color:'var(--gold)',   bg:'rgba(200,162,74,0.12)', next:'FU2',             nextAction:'First follow-up call'},
  'FU2':            {color:'var(--gold)',   bg:'rgba(200,162,74,0.10)', next:'FU3',             nextAction:'Second follow-up call'},
  'FU3':            {color:'var(--orange)', bg:'rgba(232,145,58,0.12)', next:'Offer Questions', nextAction:'Final decision call'},
  'Offer Questions':{color:'var(--orange)', bg:'rgba(232,145,58,0.10)', next:'Offer Call',      nextAction:'Complete offer questions'},
  'Offer Call':     {color:'var(--green)',  bg:'rgba(76,175,125,0.12)', next:null,              nextAction:'Run offer call'},
}
const FU_STAGES: Stage[] = ['FU1','FU2','FU3']

function getNextMeeting(c:Candidate):{type:string;start_iso:string}|null{
  try{ return JSON.parse(c.interview_notes||'{}')._next_meeting ?? null }catch{ return null }
}
function normaliseStage(s:string):Stage{
  const map:Record<string,Stage>={'Pre-Filter':'Pre-Filter','PF Completed':'Pre-Filter','MG1 Booked':'MG1','MG1 Completed':'MG1','MG1':'MG1','MG2 Booked':'MG2','MG2 Completed':'MG2','MG2':'MG2','FU1':'FU1','FU2':'FU2','FU3':'FU3','Follow-Up':'FU1','Offer Questions':'Offer Questions','Offer':'Offer Call','Offer Call':'Offer Call','Review':'Offer Call'}
  return map[s]??'Pre-Filter'
}

const OBJECTIONS = ['None','No time','No money','Need to think','Partner not on board','Not sure about products','Other']

const TZ = 'Australia/Brisbane'
function fmtDay(d:string){return new Date(d+'T12:00:00+10:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:TZ})}
function fmtTime(iso:string){return new Date(iso).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:TZ})}

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const ORANGE='var(--orange)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',boxSizing:'border-box' as const}
const SEL:React.CSSProperties={...INP as object,cursor:'pointer'} as React.CSSProperties
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:400,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px',backdropFilter:'blur(8px)',overflowY:'auto'}

function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function fmtDate(d:string){return new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'Australia/Brisbane'})}
function getNotes(c:Candidate):string{try{const p=JSON.parse(c.interview_notes||'{}');return p.__notes??''}catch{return c.interview_notes||''}}
function getOfferAnswers(c:Candidate):Record<number,string>{try{const p=JSON.parse(c.interview_notes||'{}');return p.__offers??{}}catch{return{}}}
function getSponsorIbo(c:Candidate):string{try{return JSON.parse(c.interview_notes||'{}')._sponsor_ibo??''}catch{return''}}
function getLaunchedAt(c:Candidate):string{try{return JSON.parse(c.interview_notes||'{}')._launched_at??''}catch{return''}}
function getStageHistory(c:Candidate):{stage:string;date:string}[]{try{return JSON.parse(c.interview_notes||'{}')._stage_history??[]}catch{return[]}}
function getNoShows(c:Candidate):number{try{return JSON.parse(c.interview_notes||'{}')._noshows??0}catch{return 0}}
function buildNotes(c:Candidate,patch:object):string{
  try{const p=JSON.parse(c.interview_notes||'{}');return JSON.stringify({...p,...patch})}catch{return JSON.stringify(patch)}
}
function healthScore(c:Candidate,lastContact:string):number{
  const hxl=Math.min(100,(c.hxl_score??((c.hunger??5)*(c.looking??5))))
  const daysSinceContact=lastContact?daysSince(lastContact):daysSince(c.updated_at)
  const recency=Math.max(0,100-daysSinceContact*14)
  const stageDepth=(STAGES.indexOf(normaliseStage(c.stage))+1)*12.5
  return Math.round(hxl*0.5+recency*0.3+stageDepth*0.2)
}
function healthColor(s:number){return s>=70?GREEN:s>=45?GOLD:RED}

type Tab = 'active'|'funnel'|'launched'|'archive'
type DetailTab = 'profile'|'history'|'timeline'|'brief'
interface GEvent{id:string;summary:string;start:{dateTime?:string;date?:string};attendees?:{email:string}[]}

// ── CANDIDATE CARD ────────────────────────────────────────
interface CardProps{
  c:Candidate; contactLogs:ContactLog[]; calEvents:GEvent[]
  scores:Record<string,number>
  onAdvance:(c:Candidate,dir?:'forward'|'back')=>void
  onDq:(c:Candidate)=>void
  onView:(c:Candidate)=>void
  onLaunch:(c:Candidate)=>void
}
function CandCard({c,contactLogs,calEvents,scores,onAdvance,onDq,onView,onLaunch}:CardProps){
  const stage=normaliseStage(c.stage)
  const cfg=STAGE_CFG[stage]
  const score=scores[c.id]??0
  const logs=contactLogs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))
  const lastLog=logs[0]
  const daysInStage=daysSince(lastLog?.created_at??c.created_at)
  const stageAlertColor=daysInStage>=14?RED:daysInStage>=7?GOLD:null
  const isStalling=FU_STAGES.includes(stage)&&daysSince(lastLog?.created_at??c.updated_at)>=21
  const isOfferCall=stage==='Offer Call'
  const name=c.name.toLowerCase();const first=name.split(' ')[0]
  const nextCalEvent=calEvents.filter(e=>{
    const sum=(e.summary||'').toLowerCase()
    if(c.email&&e.attendees?.some(a=>a.email?.toLowerCase()===c.email?.toLowerCase()))return true
    if(sum.includes(name))return true
    if(first.length>2&&sum.includes(first))return true
    return false
  }).filter(e=>new Date(e.start.dateTime||e.start.date||'')>new Date())[0]
  const outColor:{[k:string]:string}={Positive:GREEN,Negative:RED,Neutral:GOLD,'No Show':RED,'Not Yet':'var(--text4)'}
  const objection=(logs[0] as any)?.objection
  const nextMeeting=getNextMeeting(c)
  return(
    <div style={{...CARD,borderLeft:`3px solid ${cfg.color}`}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:4,display:'flex',alignItems:'center',gap:8}}>
            <span>{c.name}</span>
            {lastLog&&<span style={{width:6,height:6,borderRadius:'50%',background:outColor[lastLog.outcome]??'var(--text4)',display:'inline-block',flexShrink:0}}/>}
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap' as const}}>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{stage}</span>
            {stageAlertColor&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:stageAlertColor+'15',color:stageAlertColor,fontWeight:600}}>{daysInStage}d in stage</span>}
            {isStalling&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.12)',color:RED,fontWeight:700}}>⚠ Stalling</span>}
            {getNoShows(c)>0&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(232,145,58,0.15)',color:ORANGE,fontWeight:700}}>✗ {getNoShows(c)} no-show{getNoShows(c)>1?'s':''}</span>}
          </div>
        </div>
        <div style={{textAlign:'right' as const,flexShrink:0,marginLeft:8}}>
          <div className="mono" style={{fontSize:20,fontWeight:800,color:healthColor(score),lineHeight:1}}>{score}</div>
          <div style={{fontSize:8,color:'var(--text4)'}}>health</div>
        </div>
      </div>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:8,fontWeight:600}}>→ {cfg.nextAction}</div>
      {nextMeeting&&<div style={{fontSize:10,color:GOLD,marginBottom:6,padding:'2px 8px',background:'rgba(200,162,74,0.1)',borderRadius:'var(--r)',display:'inline-block'}}>📅 {nextMeeting.type} · {fmtDay(nextMeeting.start_iso.slice(0,10))} {fmtTime(nextMeeting.start_iso)}</div>}
      {objection&&objection!=='None'&&<div style={{fontSize:10,color:RED,marginBottom:6,padding:'2px 8px',background:'rgba(224,85,85,0.08)',borderRadius:'var(--r)',display:'inline-block'}}>Objection: {objection}</div>}
      {c.pain_point&&<div style={{fontSize:11,color:'var(--text4)',marginBottom:6,fontStyle:'italic'}}>"{c.pain_point.slice(0,70)}{c.pain_point.length>70?'…':''}"</div>}
      {nextCalEvent&&<div style={{fontSize:10,color:BLUE,marginBottom:6,padding:'3px 8px',background:'rgba(91,155,213,0.08)',borderRadius:'var(--r)'}}>📅 {nextCalEvent.summary} — {fmtDate(nextCalEvent.start.dateTime||nextCalEvent.start.date||'')}</div>}
      {lastLog&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:8}}>Last: <span style={{color:outColor[lastLog.outcome]??'var(--text4)',fontWeight:600}}>{lastLog.outcome}</span>{lastLog.notes?` · "${lastLog.notes.slice(0,50)}"`:''}</div>}
      <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
        {isOfferCall?(
          <button onClick={()=>onLaunch(c)} style={{flex:1,padding:'8px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GREEN},var(--green2))`,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>🚀 Launch</button>
        ):(
          <>
            <button onClick={()=>onAdvance(c,'forward')} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${cfg.color}40`,background:`${cfg.color}0C`,color:cfg.color,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>→ {cfg.next??'Launch'}</button>
            {stage!=='Pre-Filter'&&<button onClick={()=>onAdvance(c,'back')} style={{padding:'7px 9px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>←</button>}
          </>
        )}
        <button onClick={()=>onView(c)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>View →</button>
        <button onClick={()=>onDq(c)} style={{padding:'7px 10px',borderRadius:'var(--r)',border:`1px solid ${RED}30`,background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>DQ</button>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────
export default function Candidates(){
  const {userId,candidates,upsertCandidate,deleteCandidate,loadCandidates,
         partners,loadPartners,upsertPartner,
         addContactLog,loadContactLogs,contactLogs} = useStore()

  const [tab,setTab]             = useState<Tab>('active')
  const [search,setSearch]       = useState('')
  const [detail,setDetail]       = useState<Candidate|null>(null)
  const [detailTab,setDetailTab] = useState<DetailTab>('profile')
  const [advancing,setAdvancing] = useState<Candidate|null>(null)
  const [advDir,setAdvDir]       = useState<'forward'|'back'>('forward')
  const [advNotes,setAdvNotes]   = useState('')
  const [logModal,setLogModal]   = useState<Candidate|null>(null)
  const [logForm,setLogForm]     = useState({outcome:'Positive',notes:'',fathom_link:'',objection:'None',nextAction:'',nextDate:'',rationale:''})
  const [briefText,setBriefText] = useState('')
  const [briefLoading,setBriefLoading] = useState(false)
  const [calEvents,setCalEvents] = useState<GEvent[]>([])

  useEffect(()=>{ loadCandidates();loadPartners();loadContactLogs();loadCalEvents() },[]) // eslint-disable-line

  async function loadCalEvents(){
    if(!userId)return
    try{
      const tMin=new Date(Date.now()-30*86400000).toISOString()
      const tMax=new Date(Date.now()+60*86400000).toISOString()
      const res=await fetch(`/api/calendar?userId=${userId}&timeMin=${tMin}&timeMax=${tMax}`)
      const data=await res.json()
      if(data.items)setCalEvents(data.items)
    }catch{}
  }

  // ── COMPUTED ──────────────────────────────────────────────
  const active   = useMemo(()=>candidates.filter(c=>c.status==='active'),[candidates])
  const archived = useMemo(()=>candidates.filter(c=>c.status==='disqualified'),[candidates])
  const launched = useMemo(()=>candidates.filter(c=>c.status==='launched'),[candidates])

  const scores=useMemo(()=>{
    const m:Record<string,number>={}
    candidates.forEach(c=>{
      const last=contactLogs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
      m[c.id]=healthScore(c,last?.created_at??c.updated_at)
    })
    return m
  },[candidates,contactLogs])

  const stageCounts=useMemo(()=>{
    const c:Record<string,number>={};STAGES.forEach(s=>{c[s]=active.filter(c=>normaliseStage(c.stage)===s).length});return c
  },[active])

  const displayList=useMemo(()=>{
    let l=active
    if(search)l=l.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()))
    return [...l].sort((a,b)=>{
      const as=FU_STAGES.includes(normaliseStage(a.stage))&&daysSince(contactLogs.filter(l=>l.entity_id===a.id)[0]?.created_at??a.updated_at)>=21
      const bs=FU_STAGES.includes(normaliseStage(b.stage))&&daysSince(contactLogs.filter(l=>l.entity_id===b.id)[0]?.created_at??b.updated_at)>=21
      if(as!==bs)return as?-1:1
      return (scores[b.id]??0)-(scores[a.id]??0)
    })
  },[active,search,scores,contactLogs])

  const iboNames=useMemo(()=>{
    const m:Record<string,string>={};partners.forEach((p:Partner)=>{if(p.ibo_number)m[p.ibo_number]=p.name});return m
  },[partners])

  const funnel=useMemo(()=>{
    const total=active.length||1
    return STAGES.map((s,i)=>({
      stage:s,count:stageCounts[s]||0,
      pct:Math.round((stageCounts[s]||0)/total*100),
      convRate:i>0?Math.round((stageCounts[s]||0)/((stageCounts[STAGES[i-1]]||0)||1)*100):100,
      avgDays:(()=>{const inS=active.filter(c=>normaliseStage(c.stage)===s);return inS.length?Math.round(inS.reduce((a,c)=>a+daysSince(c.updated_at),0)/inS.length):0})()
    }))
  },[active,stageCounts])

  const objectionBreakdown=useMemo(()=>{
    const m:Record<string,number>={}
    contactLogs.filter(l=>l.entity_type==='candidate'&&(l as any).objection&&(l as any).objection!=='None').forEach(l=>{
      const o=(l as any).objection;m[o]=(m[o]||0)+1
    })
    return Object.entries(m).sort((a,b)=>b[1]-a[1])
  },[contactLogs])

  // ── ACTIONS ───────────────────────────────────────────────
  function openLog(c:Candidate){
    setLogModal(c)
    setLogForm({outcome:'Positive',notes:'',fathom_link:'',objection:'None',nextAction:STAGE_CFG[normaliseStage(c.stage)].nextAction,nextDate:'',rationale:''})
  }
  async function saveLog(){
    if(!logModal||!userId)return
    await addContactLog({id:uid(),user_id:userId,entity_type:'candidate',entity_id:logModal.id,entity_name:logModal.name,event_type:'contacted',outcome:logForm.outcome,notes:logForm.notes,fathom_link:logForm.fathom_link||'',next_action:logForm.nextAction,next_date:logForm.nextDate,created_at:new Date().toISOString()} as any)
    await upsertCandidate({...logModal,next_action:logForm.nextAction,updated_at:now()} as any)
    setLogModal(null)
  }

  function openAdvance(c:Candidate,dir:'forward'|'back'='forward'){
    setAdvancing(c);setAdvDir(dir);setAdvNotes('')
  }

  async function confirmAdvance(){
    if(!advancing||!userId)return
    const c=advancing
    if(advDir==='back'){
      const curIdx=STAGES.indexOf(normaliseStage(c.stage))
      if(curIdx<=0){setAdvancing(null);return}
      const prev=STAGES[curIdx-1]
      const stageHistory=[...getStageHistory(c),{stage:normaliseStage(c.stage),date:new Date().toISOString().slice(0,10)}]
      const notes=buildNotes(c,{__notes:getNotes(c),__offers:getOfferAnswers(c),_stage_history:stageHistory})
      const updated={...c,stage:prev,interview_notes:notes,updated_at:now()}
      await upsertCandidate(updated as any)
      await addContactLog({id:uid(),user_id:userId,entity_type:'candidate',entity_id:c.id,entity_name:c.name,event_type:'stage_back',outcome:'Neutral',notes:advNotes||`Moved back to ${prev}`,fathom_link:'',next_action:STAGE_CFG[prev as Stage]?.nextAction??'',next_date:'',created_at:new Date().toISOString()} as any)
      if(detail?.id===c.id)setDetail(updated as any)
    } else {
      const cur=normaliseStage(c.stage);const cfg=STAGE_CFG[cur];const ns=cfg.next??cur
      const stageHistory=[...getStageHistory(c),{stage:cur,date:new Date().toISOString().slice(0,10)}]
      const notes=buildNotes(c,{__notes:getNotes(c),__offers:getOfferAnswers(c),_stage_history:stageHistory})
      const updated={...c,stage:ns,interview_notes:notes,updated_at:now()}
      await upsertCandidate(updated as any)
      await addContactLog({id:uid(),user_id:userId,entity_type:'candidate',entity_id:c.id,entity_name:c.name,event_type:ns.toLowerCase().replace(/ /g,'_'),outcome:'Positive',notes:advNotes||`Advanced to ${ns}`,fathom_link:'',next_action:STAGE_CFG[ns as Stage]?.nextAction??'',next_date:'',created_at:new Date().toISOString()} as any)
      if(detail?.id===c.id)setDetail(updated as any)
    }
    setAdvancing(null)
  }

  async function launchCandidate(c:Candidate){
    if(!userId)return
    const stageHistory=[...getStageHistory(c),{stage:normaliseStage(c.stage),date:new Date().toISOString().slice(0,10)}]
    const notes=buildNotes(c,{__notes:getNotes(c),__offers:getOfferAnswers(c),_stage_history:stageHistory,_launched_at:new Date().toISOString().slice(0,10)})
    await upsertCandidate({...c,status:'launched',interview_notes:notes,updated_at:now()} as any)
    await addContactLog({id:uid(),user_id:userId,entity_type:'candidate',entity_id:c.id,entity_name:c.name,event_type:'launched',outcome:'Positive',notes:'Launched to Organisation',fathom_link:'',next_action:'Launch Call',next_date:'',created_at:new Date().toISOString()} as any)
    if(detail?.id===c.id)setDetail(null)
  }

  async function addToOrg(c:Candidate){
    if(!userId||partners.find((p:Partner)=>p.name===c.name))return
    await upsertPartner({id:uid(),user_id:userId,name:c.name,ibo_number:'',phone:c.phone||'',email:c.email||'',stage:'Launch',gpv:0,ppv:0,bonus:0,group_size:0,sponsoring:0,gpv_goal:0,notes:c.primary_driver?`Driver: ${c.primary_driver}\nPain: ${c.pain_point||''}`:'',last_contact:'',next_call:'',activation_done:'[]',archived:false,parent_id:'',created_at:now(),updated_at:now()} as any)
  }

  async function disqualify(c:Candidate){
    if(!userId)return
    await upsertCandidate({...c,status:'disqualified',updated_at:now()} as any)
    await addContactLog({id:uid(),user_id:userId,entity_type:'candidate',entity_id:c.id,entity_name:c.name,event_type:'disqualified',outcome:'Negative',notes:'Disqualified',fathom_link:'',next_action:'',next_date:'',created_at:new Date().toISOString()} as any)
    if(detail?.id===c.id)setDetail(null)
  }

  async function saveNotes(c:Candidate,val:string){
    const n=buildNotes(c,{__notes:val,__offers:getOfferAnswers(c)})
    const up={...c,interview_notes:n,updated_at:now()}
    await upsertCandidate(up as any);if(detail?.id===c.id)setDetail(up as any)
  }

  async function getBrief(c:Candidate){
    setBriefLoading(true);setBriefText('')
    const logs=contactLogs.filter(l=>l.entity_id===c.id).slice(0,5)
    const stage=normaliseStage(c.stage)
    try{
      const text=buildPreCallBrief({name:c.name,stageLabel:stage,daysSinceContact:daysSince(c.updated_at),driver:c.primary_driver,painPoint:c.pain_point,metricLabel:'HxL',metricValue:c.hxl_score,notes:getNotes(c).slice(0,200),nextAction:STAGE_CFG[stage].nextAction,recentOutcomes:logs.map(l=>l.outcome)})
      setBriefText(text)
    }catch{setBriefText('Failed.')}
    setBriefLoading(false)
  }

  const cardProps={contactLogs,calEvents,scores,
    onAdvance:(c:Candidate,dir?:'forward'|'back')=>openAdvance(c,dir||'forward'),
    onDq:disqualify,
    onView:(c:Candidate)=>{setDetail(c);setDetailTab('profile');setBriefText('')},
    onLaunch:launchCandidate,
  }

  // ── RENDER ────────────────────────────────────────────────
  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:80}}>

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
        {[
          {l:'Active',   v:active.length,c:GOLD},
          {l:'Hot (70+)',v:active.filter(c=>(scores[c.id]??0)>=70).length,c:GREEN},
          {l:'Stalling', v:active.filter(c=>FU_STAGES.includes(normaliseStage(c.stage))&&daysSince(contactLogs.filter(l=>l.entity_id===c.id)[0]?.created_at??c.updated_at)>=21).length,c:RED},
          {l:'At Offer', v:active.filter(c=>normaliseStage(c.stage)==='Offer Call').length,c:GREEN},
        ].map(k=>(
          <div key={k.l} style={{background:'var(--s1)',border:`1px solid ${k.c}20`,borderRadius:'var(--r2)',padding:'10px',textAlign:'center' as const}}>
            <div className="mono" style={{fontSize:20,fontWeight:800,color:k.c,lineHeight:1}}>{k.v}</div>
            <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:3,marginBottom:14,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)',overflowX:'auto' as const}}>
        {([['active',`🎯 Active (${active.length})`],['funnel','📊 Funnel'],['launched',`✅ Launched (${launched.length})`],['archive',`🗄 Archive (${archived.length})`]] as const).map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:'8px 6px',borderRadius:'var(--r)',border:'none',background:tab===id?'var(--s3)':'transparent',color:tab===id?GOLD:'var(--text3)',fontSize:10,fontWeight:tab===id?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",transition:'all 0.15s',whiteSpace:'nowrap' as const,flexShrink:0}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ACTIVE TAB ──────────────────────────────────────── */}
      {tab==='active'&&(
        <div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search candidates…" style={{...INP,marginBottom:12}}/>
          <div style={{display:'flex',gap:5,overflowX:'auto' as const,marginBottom:12,paddingBottom:4}}>
            {(['all',...STAGES] as const).map(s=>{
              const col=s==='all'?GOLD:(STAGE_CFG[s as Stage]?.color??GOLD)
              const count=s==='all'?active.length:active.filter(c=>normaliseStage(c.stage)===s).length
              return(
                <div key={s} style={{padding:'4px 10px',borderRadius:20,border:'1px solid rgba(255,255,255,0.08)',background:'transparent',flexShrink:0,display:'flex',gap:5,alignItems:'center'}}>
                  <span className="mono" style={{fontSize:10,fontWeight:700,color:col}}>{count}</span>
                  <span style={{fontSize:9,color:'var(--text4)'}}>{s}</span>
                </div>
              )
            })}
          </div>
          {displayList.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No candidates yet. They appear here when booked from Pipeline or Calendar.</div>
            :displayList.map(c=><CandCard key={c.id} c={c} {...cardProps}/>)
          }
        </div>
      )}

      {/* ── FUNNEL TAB ──────────────────────────────────────── */}
      {tab==='funnel'&&(
        <div>
          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Conversion Funnel</div>
            {funnel.map((f,i)=>{
              const cfg=STAGE_CFG[f.stage as Stage]
              return(
                <div key={f.stage} style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12,fontWeight:600,color:cfg.color}}>{f.stage}</span>
                      <span className="mono" style={{fontSize:11,color:'var(--text4)'}}>{f.count}</span>
                      {i>0&&<span style={{fontSize:10,color:'var(--text4)'}}>{f.convRate}% from prev</span>}
                      {f.avgDays>0&&<span style={{fontSize:10,color:f.avgDays>=14?RED:f.avgDays>=7?GOLD:'var(--text4)',fontWeight:f.avgDays>=14?600:400}}>avg {f.avgDays}d</span>}
                    </div>
                    <span style={{fontSize:10,color:'var(--text4)'}}>{f.pct}%</span>
                  </div>
                  <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${f.pct}%`,background:cfg.color,borderRadius:3,transition:'width 0.8s'}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Overall Stats</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}}>
              {[{l:'Total',v:candidates.length,c:'var(--text2)'},{l:'Active',v:active.length,c:GOLD},{l:'Launched',v:launched.length,c:GREEN},{l:'Archived',v:archived.length,c:RED},{l:'Conv rate',v:candidates.length>0?Math.round(launched.length/candidates.length*100)+'%':'0%',c:'var(--purple)'}].map(k=>(
                <div key={k.l} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'10px',textAlign:'center' as const}}>
                  <div className="mono" style={{fontSize:18,fontWeight:800,color:k.c,lineHeight:1}}>{k.v}</div>
                  <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>{k.l}</div>
                </div>
              ))}
            </div>
          </div>
          {objectionBreakdown.length>0&&(
            <div style={CARD}>
              <div style={SL}>Common Objections</div>
              {objectionBreakdown.map(([obj,count])=>(
                <div key={obj} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br)',fontSize:12}}>
                  <span style={{color:'var(--text2)'}}>{obj}</span>
                  <span className="mono" style={{color:RED,fontWeight:700}}>{count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LAUNCHED TAB ────────────────────────────────────── */}
      {tab==='launched'&&(
        <div>
          {launched.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No launched candidates yet</div>
            :launched.map(c=>{
              const launchedAt=getLaunchedAt(c)
              const alreadyInOrg=partners.some((p:Partner)=>p.name===c.name)
              return(
                <div key={c.id} style={CARD}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{c.name}</div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(76,175,125,0.12)',color:GREEN,fontWeight:600}}>🚀 Launched</span>
                        {launchedAt&&<span style={{fontSize:10,color:'var(--text4)'}}>on {fmtDate(launchedAt)}</span>}
                        {c.primary_driver&&<span style={{fontSize:10,color:GOLD}}>{c.primary_driver}</span>}
                      </div>
                    </div>
                    <div className="mono" style={{fontSize:18,fontWeight:800,color:GREEN}}>{c.hxl_score??((c.hunger??5)*(c.looking??5))}</div>
                  </div>
                  {c.pain_point&&<div style={{fontSize:11,color:'var(--text4)',marginBottom:8,fontStyle:'italic'}}>"{c.pain_point}"</div>}
                  <div style={{display:'flex',gap:6}}>
                    {!alreadyInOrg
                      ?<button onClick={()=>addToOrg(c)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>+ Add to Organisation</button>
                      :<span style={{fontSize:11,color:GREEN,padding:'7px 0',fontWeight:600}}>✓ In Organisation</span>
                    }
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── ARCHIVE TAB ─────────────────────────────────────── */}
      {tab==='archive'&&(
        <div>
          {archived.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No archived candidates</div>
            :archived.map(c=>{
              const logs=contactLogs.filter(l=>l.entity_id===c.id&&l.event_type==='disqualified')
              const reason=logs[0]?.notes||'Archived'
              return(
                <div key={c.id} style={{...CARD,opacity:0.85}}>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{c.name}</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                      <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.1)',color:RED}}>{normaliseStage(c.stage)}</span>
                      <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{reason}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={async()=>{await upsertCandidate({...c,status:'active',updated_at:now()} as any)}} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>↩ Restore</button>
                    <button onClick={()=>deleteCandidate(c.id)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${RED}30`,background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>Delete</button>
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── DETAIL DRAWER ───────────────────────────────────── */}
      {detail&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setDetail(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:580,overflow:'hidden',margin:'auto'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid var(--br)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{detail.name}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                  {(()=>{const cfg=STAGE_CFG[normaliseStage(detail.stage)];return<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:700}}>{normaliseStage(detail.stage)}</span>})()}
                  {detail.primary_driver&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${GOLD}10`,color:GOLD}}>{detail.primary_driver}</span>}
                  <span style={{fontSize:10,color:healthColor(scores[detail.id]??0),fontWeight:700}}>Health {scores[detail.id]??0}</span>
                </div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>openLog(detail)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>✓ Log</button>
                <button onClick={()=>openAdvance(detail)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${STAGE_CFG[normaliseStage(detail.stage)].color}40`,background:`${STAGE_CFG[normaliseStage(detail.stage)].color}0C`,color:STAGE_CFG[normaliseStage(detail.stage)].color,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>→ Advance</button>
                <button onClick={()=>setDetail(null)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:22}}>×</button>
              </div>
            </div>
            <div style={{display:'flex',borderBottom:'1px solid var(--br)',overflowX:'auto' as const}}>
              {(['profile','history','timeline','brief'] as DetailTab[]).map(t=>(
                <button key={t} onClick={()=>{setDetailTab(t);if(t==='brief')getBrief(detail)}}
                  style={{flex:1,padding:'10px 8px',border:'none',background:'transparent',color:detailTab===t?GOLD:'var(--text4)',fontSize:10,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:detailTab===t?700:400,borderBottom:`2px solid ${detailTab===t?GOLD:'transparent'}`,transition:'all 0.15s',whiteSpace:'nowrap' as const}}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
            <div style={{padding:'18px 24px',maxHeight:'55vh',overflowY:'auto' as const}}>

              {detailTab==='profile'&&(
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                    {[
                      {l:'HxL Score',v:`H${detail.hunger??5}×L${detail.looking??5} = ${detail.hxl_score??((detail.hunger??5)*(detail.looking??5))}`,c:healthColor(scores[detail.id]??0)},
                      {l:'Relationship',v:detail.relationship||'—',c:'var(--text2)'},
                      {l:'Age Range',v:detail.age_range||'—',c:'var(--text2)'},
                      {l:'Life Stage',v:detail.life_stage||'—',c:'var(--text2)'},
                      {l:'Source',v:detail.source||'—',c:'var(--text2)'},
                      {l:'Phone',v:detail.phone||'—',c:'var(--text2)'},
                    ].map(x=>(
                      <div key={x.l}><div style={{fontSize:9,color:'var(--text4)',marginBottom:2}}>{x.l}</div><div style={{fontSize:12,fontWeight:600,color:x.c}}>{x.v}</div></div>
                    ))}
                  </div>
                  {detail.pain_point&&<div style={{marginBottom:12,padding:'10px 12px',background:'var(--s2)',borderRadius:'var(--r)',borderLeft:`3px solid ${GOLD}`}}><div style={{fontSize:9,color:'var(--text4)',marginBottom:4}}>PAIN POINT</div><div style={{fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>"{detail.pain_point}"</div></div>}
                  {getSponsorIbo(detail)&&<div style={{marginBottom:12,fontSize:11,color:'var(--text4)'}}>Booked by: {iboNames[getSponsorIbo(detail)]??getSponsorIbo(detail)}</div>}
                  <div style={SL}>Notes</div>
                  <textarea value={getNotes(detail)} onChange={e=>saveNotes(detail,e.target.value)} rows={5} placeholder="Notes, observations, key moments…" style={{...INP,resize:'vertical' as const,fontSize:12}}/>
                </div>
              )}

              {detailTab==='history'&&(
                <div>
                  {contactLogs.filter(l=>l.entity_id===detail.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).length===0
                    ?<div style={{fontSize:12,color:'var(--text4)',padding:'24px 0',textAlign:'center' as const}}>No contact logged yet</div>
                    :contactLogs.filter(l=>l.entity_id===detail.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(log=>(
                      <div key={log.id} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <div style={{display:'flex',gap:6,alignItems:'center'}}>
                            <span style={{fontSize:11,fontWeight:600,color:{Positive:GREEN,Negative:RED,Neutral:GOLD,'No Show':RED,'Not Yet':'var(--text4)'}[log.outcome]??'var(--text4)'}}>{log.outcome||log.event_type.replace(/_/g,' ')}</span>
                            {(log as any).objection&&(log as any).objection!=='None'&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:6,background:'rgba(224,85,85,0.1)',color:RED}}>{(log as any).objection}</span>}
                          </div>
                          <span style={{fontSize:9,color:'var(--text4)'}}>{log.created_at.slice(0,10)}</span>
                        </div>
                        {log.notes&&<div style={{fontSize:11,color:'var(--text3)',lineHeight:1.5}}>{log.notes}</div>}
                        {log.fathom_link&&<a href={log.fathom_link} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:'#8B5CF6',textDecoration:'none',marginTop:2,display:'block'}}>▶ Fathom recording</a>}
                        {log.next_action&&<div style={{fontSize:10,color:'var(--text4)',marginTop:2}}>Next: {log.next_action}{log.next_date?` · ${fmtDate(log.next_date)}`:''}</div>}
                      </div>
                    ))
                  }
                </div>
              )}

              {detailTab==='timeline'&&(()=>{
                const history=getStageHistory(detail)
                const allStages=[...history,{stage:normaliseStage(detail.stage),date:detail.updated_at?.slice(0,10)??''}]
                return(
                  <div>
                    {allStages.length===0
                      ?<div style={{fontSize:12,color:'var(--text4)',padding:'24px 0',textAlign:'center' as const}}>No stage history yet</div>
                      :allStages.map((h,i)=>{
                        const cfg=STAGE_CFG[normaliseStage(h.stage)]
                        const nextDate=allStages[i+1]?.date
                        const daysAtStage=nextDate?Math.floor((new Date(nextDate).getTime()-new Date(h.date).getTime())/86400000):daysSince(h.date)
                        const isCurrent=i===allStages.length-1
                        return(
                          <div key={i} style={{display:'flex',gap:12}}>
                            <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center',width:24,flexShrink:0}}>
                              <div style={{width:12,height:12,borderRadius:'50%',background:isCurrent?cfg.color:'var(--s3)',border:`2px solid ${cfg.color}`,flexShrink:0,marginTop:4}}/>
                              {i<allStages.length-1&&<div style={{width:2,flex:1,background:'var(--br)',margin:'2px 0'}}/>}
                            </div>
                            <div style={{flex:1,paddingBottom:16}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontSize:12,fontWeight:600,color:isCurrent?cfg.color:'var(--text2)'}}>{h.stage}</span>
                                <span style={{fontSize:9,color:'var(--text4)'}}>{fmtDate(h.date)}</span>
                              </div>
                              <div style={{fontSize:10,color:'var(--text4)',marginTop:2}}>{isCurrent?`${daysAtStage}d so far`:`${daysAtStage}d`}</div>
                            </div>
                          </div>
                        )
                      })
                    }
                  </div>
                )
              })()}

              {detailTab==='brief'&&(
                <div>
                  <div style={{...SL,marginBottom:10}}>Pre-Call Brief</div>
                  {briefLoading
                    ?<div style={{fontSize:13,color:'var(--text3)',fontStyle:'italic',padding:'20px 0'}}>Generating…</div>
                    :briefText
                      ?<div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,whiteSpace:'pre-wrap' as const}}>{briefText}</div>
                      :<div style={{fontSize:12,color:'var(--text4)',padding:'12px 0'}}>Generate a stage-specific pre-call brief.</div>
                  }
                  {!briefLoading&&<button onClick={()=>getBrief(detail)} style={{marginTop:12,padding:'7px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:'rgba(200,162,74,0.08)',color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>{briefText?'↻ Refresh':'Generate Brief'}</button>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOG CONTACT MODAL ───────────────────────────────── */}
      {logModal&&(
        <div style={{...OVERLAY,zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)setLogModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:420,padding:28,margin:'auto'}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Log Contact — {logModal.name}</div>
            <div style={{marginBottom:12}}>
              <div style={SL}>Outcome</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap' as const}}>
                {['Positive','Neutral','Negative','No Show','Not Yet'].map(o=>(
                  <button key={o} onClick={()=>{
                    const sugg=suggestFollowUpDays(o,7)
                    const d=new Date();d.setDate(d.getDate()+sugg.days)
                    setLogForm(p=>({...p,outcome:o,nextDate:d.toISOString().slice(0,10),rationale:sugg.rationale}))
                  }} style={{padding:'5px 10px',borderRadius:'var(--r)',border:`1px solid ${logForm.outcome===o?GOLD:'var(--br)'}`,background:logForm.outcome===o?'rgba(200,162,74,0.12)':'var(--s2)',color:logForm.outcome===o?GOLD:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10,fontWeight:logForm.outcome===o?700:400}}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={SL}>Objection</div>
              <select value={logForm.objection} onChange={e=>setLogForm(p=>({...p,objection:e.target.value}))} style={SEL}>
                {OBJECTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <div style={SL}>Notes</div>
              <textarea value={logForm.notes} onChange={e=>setLogForm(p=>({...p,notes:e.target.value}))} rows={3} placeholder="Key moments, commitments, energy…" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={SL}>Fathom Recording Link</div>
              <input value={logForm.fathom_link} onChange={e=>setLogForm(p=>({...p,fathom_link:e.target.value}))} placeholder="https://fathom.video/calls/…" style={INP}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
              <div><div style={SL}>Next Action</div><input value={logForm.nextAction} onChange={e=>setLogForm(p=>({...p,nextAction:e.target.value}))} style={INP}/></div>
              <div><div style={SL}>Next Date</div><input type="date" value={logForm.nextDate} onChange={e=>setLogForm(p=>({...p,nextDate:e.target.value}))} style={INP}/></div>
            </div>
            {logForm.rationale&&<div style={{fontSize:11,color:'var(--text4)',fontStyle:'italic',marginBottom:18,marginTop:-10}}>{logForm.rationale}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={saveLog} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GREEN},var(--green2))`,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save Log</button>
              <button onClick={()=>setLogModal(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADVANCE MODAL ───────────────────────────────────── */}
      {advancing&&(
        <div style={{...OVERLAY,zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)setAdvancing(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:400,padding:28,margin:'auto'}}>
            <div style={{display:'flex',gap:6,marginBottom:16,background:'var(--s2)',borderRadius:'var(--r)',padding:4}}>
              <button onClick={()=>setAdvDir('forward')} style={{flex:1,padding:'7px',borderRadius:'var(--r)',border:'none',background:advDir==='forward'?'var(--s3)':'transparent',color:advDir==='forward'?GOLD:'var(--text4)',fontWeight:advDir==='forward'?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>→ Advance</button>
              <button onClick={()=>setAdvDir('back')} disabled={STAGES.indexOf(normaliseStage(advancing.stage))<=0}
                style={{flex:1,padding:'7px',borderRadius:'var(--r)',border:'none',background:advDir==='back'?'var(--s3)':'transparent',color:advDir==='back'?RED:'var(--text4)',fontWeight:advDir==='back'?700:400,cursor:STAGES.indexOf(normaliseStage(advancing.stage))<=0?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,opacity:STAGES.indexOf(normaliseStage(advancing.stage))<=0?0.3:1}}>← Move back</button>
            </div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{advancing.name}</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:18}}>
              {advDir==='forward'
                ?<>{normaliseStage(advancing.stage)} → <strong style={{color:STAGE_CFG[normaliseStage(advancing.stage)].color}}>{STAGE_CFG[normaliseStage(advancing.stage)].next??'Launch'}</strong></>
                :<>{normaliseStage(advancing.stage)} → <strong style={{color:RED}}>{STAGES[Math.max(0,STAGES.indexOf(normaliseStage(advancing.stage))-1)]}</strong></>
              }
            </div>
            <div style={{marginBottom:20}}>
              <div style={SL}>Notes (optional)</div>
              <textarea value={advNotes} onChange={e=>setAdvNotes(e.target.value)} rows={3} placeholder="Key moments, commitments…" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={confirmAdvance}
                style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:advDir==='back'?`1px solid ${RED}40`:'none',background:advDir==='forward'?`linear-gradient(135deg,${GOLD},var(--gold3))`:'transparent',color:advDir==='forward'?'#000':RED,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>
                {advDir==='forward'?'Advance Stage →':'← Move Back'}
              </button>
              <button onClick={()=>setAdvancing(null)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
