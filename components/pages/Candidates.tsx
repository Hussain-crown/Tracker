'use client'
import React, { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { buildPreCallBrief } from '@/lib/aiText'
import type { Candidate, ContactLog } from '@/lib/stores/types'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { today } from '@/lib/utils'

// ── STAGES ────────────────────────────────────────────────
const STAGES = ['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer'] as const
type Stage = typeof STAGES[number]
const STAGE_CFG: Record<Stage,{color:string;bg:string;next:Stage|null;nextAction:string}> = {
  'Pre-Filter':{color:'var(--blue)',   bg:'rgba(91,155,213,0.12)',  next:'MG1', nextAction:'Run Pre-Filter call'},
  'MG1':       {color:'var(--purple)', bg:'rgba(155,91,213,0.12)', next:'MG2', nextAction:'Run MG1'},
  'MG2':       {color:'var(--teal)',   bg:'rgba(91,213,155,0.12)', next:'FU1', nextAction:'Run MG2'},
  'FU1':       {color:'var(--gold)',   bg:'rgba(200,162,74,0.12)', next:'FU2', nextAction:'First follow-up call'},
  'FU2':       {color:'var(--gold)',   bg:'rgba(200,162,74,0.10)', next:'FU3', nextAction:'Second follow-up call'},
  'FU3':       {color:'var(--orange)', bg:'rgba(232,145,58,0.12)', next:'Offer', nextAction:'Final decision call'},
  'Offer':     {color:'var(--green)',  bg:'rgba(76,175,125,0.12)', next:null,  nextAction:'Run offer call'},
}
const FU_STAGES: Stage[] = ['FU1','FU2','FU3']
const DQ_REASONS = ['Not interested','Wrong timing','Did not follow through','Ghosted','Chose another opportunity','Other']
const OBJECTION_REASONS = ['No time','No money','Need to think','Partner not on board','Not sure about products','Other']

// ── STYLE CONSTANTS ───────────────────────────────────────
const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const PURPLE='var(--purple)';const ORANGE='var(--orange)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',boxSizing:'border-box'}
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:400,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px',backdropFilter:'blur(8px)',overflowY:'auto'}

// ── HELPERS ───────────────────────────────────────────────
function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function fmtDate(d:string){return new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'Australia/Brisbane'})}
function normaliseStage(s:string):Stage{
  const map:Record<string,Stage>={'Pre-Filter':'Pre-Filter','PF Completed':'Pre-Filter','MG1 Booked':'MG1','MG1 Completed':'MG1','MG1':'MG1','MG2 Booked':'MG2','MG2 Completed':'MG2','MG2':'MG2','FU1':'FU1','FU2':'FU2','FU3':'FU3','Follow-Up':'FU1','Offer Questions':'Offer','Offer':'Offer','Offer Call':'Offer','Review':'Offer'}
  return map[s]??'Pre-Filter'
}
function getNotes(c:Candidate):string{try{const p=JSON.parse(c.interview_notes||'{}');return p.__notes??''}catch{return c.interview_notes||''}}
function getLaunchedAt(c:Candidate):string{try{return JSON.parse(c.interview_notes||'{}')._launched_at??''}catch{return''}}
function getStageHistory(c:Candidate):{stage:string;date:string}[]{try{return JSON.parse(c.interview_notes||'{}')._stage_history??[]}catch{return[]}}
function getNoShows(c:Candidate):number{try{return JSON.parse(c.interview_notes||'{}')._noshows??0}catch{return 0}}
function getNextMeeting(c:Candidate):{type:string;start_iso:string}|null{try{return JSON.parse(c.interview_notes||'{}')._next_meeting??null}catch{return null}}

function healthScore(c:Candidate, lastContact:string):number{
  const hxl=Math.min(100,(c.hxl_score??((c.hunger??5)*(c.looking??5))))
  const daysSinceContact=lastContact?daysSince(lastContact):daysSince(c.updated_at)
  const recency=Math.max(0,100-daysSinceContact*14)
  const stageDepth=(STAGES.indexOf(normaliseStage(c.stage))+1)*12.5
  return Math.round(hxl*0.5+recency*0.3+stageDepth*0.2)
}
function healthColor(s:number){return s>=70?GREEN:s>=45?GOLD:RED}

const TZ='Australia/Brisbane'
function fmtDay(d:string){return new Date(d+'T12:00:00+10:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:TZ})}
function fmtTime(iso:string){return new Date(iso).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:TZ})}

type Tab = 'active'|'funnel'|'archive'
type DetailTab = 'profile'|'history'|'timeline'|'brief'

// ── CANDIDATE CARD ────────────────────────────────────────
interface CardProps{
  c:Candidate
  contactLogs:ContactLog[]
  scores:Record<string,number>
  onView:(c:Candidate)=>void
  nextDue?:string
  touchCount?:number
  level?:number
  onLog?:(c:Candidate)=>void
  onAdvance?:(c:Candidate)=>void
  onDq?:(c:Candidate)=>void
  onLaunch?:(c:Candidate)=>void
  isDupe?:boolean
}
function CandCard({c,contactLogs,scores,onView,nextDue,touchCount,level=1,onLog,onAdvance,onDq,onLaunch,isDupe}:CardProps){
  const todayStr=today()
  const stage=normaliseStage(c.stage)
  const cfg=STAGE_CFG[stage]
  const score=scores[c.id]??0
  const logs=contactLogs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))
  const lastLog=logs[0]
  const daysInStage=daysSince(lastLog?.created_at??c.created_at)
  const isStalling=FU_STAGES.includes(stage)&&daysSince(lastLog?.created_at??c.updated_at)>=21
  const nextMeeting=getNextMeeting(c)
  const idx=STAGES.indexOf(stage)
  return(
    <div style={{...CARD,borderLeft:`3px solid ${cfg.color}`}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:4,display:'flex',alignItems:'center',gap:8}}>
            <span>{c.name}</span>
            {lastLog&&<span style={{width:6,height:6,borderRadius:'50%',background:GREEN,display:'inline-block',flexShrink:0}}/>}
            {isDupe&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:6,background:'rgba(249,115,22,0.15)',color:'#f97316',fontWeight:700,letterSpacing:'0.5px'}}>DUPE</span>}
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {isStalling&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.12)',color:RED,fontWeight:700}}>⚠ Stalling</span>}
            {getNoShows(c)>0&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(232,145,58,0.15)',color:ORANGE,fontWeight:700}}>✗ {getNoShows(c)} no-show{getNoShows(c)>1?'s':''}</span>}
            {nextMeeting&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(200,162,74,0.1)',color:GOLD,fontWeight:600}}>📅 {nextMeeting.type} · {fmtDay(nextMeeting.start_iso.slice(0,10))} {fmtTime(nextMeeting.start_iso)}</span>}
            {nextDue&&(()=>{
              const overdue=nextDue<todayStr;const dueToday=nextDue===todayStr
              const col=overdue?RED:dueToday?GOLD:'var(--text4)'
              const label=overdue?`${daysSince(nextDue)}d overdue`:dueToday?'Due today':`Due ${fmtDate(nextDue)}`
              return<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${col}15`,color:col,fontWeight:overdue||dueToday?700:400}}>{label}</span>
            })()}
            {touchCount!==undefined&&touchCount>0&&<span style={{fontSize:10,color:'var(--text4)'}}>{touchCount}c</span>}
          </div>
        </div>
        <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}>
          <div className="mono" style={{fontSize:20,fontWeight:800,color:healthColor(score),lineHeight:1}}>{score}</div>
          <div style={{fontSize:8,color:'var(--text4)'}}>health</div>
        </div>
      </div>
      <div style={{fontSize:9.5,color:cfg.color,fontWeight:700,letterSpacing:0.3,textTransform:'uppercase',marginBottom:6}}>{stage} · {daysInStage}d</div>
      <div style={{height:4,borderRadius:2,background:'var(--s3)',marginBottom:12,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${((idx+1)/STAGES.length)*100}%`,background:cfg.color,borderRadius:2,transition:'width 0.3s ease'}}/>
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        <button onClick={()=>onView(c)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>View →</button>
        {level>=2&&onLog&&<button onClick={e=>{e.stopPropagation();onLog(c)}} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:`${GOLD}10`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>Log</button>}
        {level>=2&&stage==='Offer'&&onLaunch
          ?<button onClick={e=>{e.stopPropagation();onLaunch(c)}} style={{padding:'7px 14px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GREEN},#3da872)`,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>🚀 Launch</button>
          :level>=2&&onAdvance&&STAGE_CFG[stage].next&&<button onClick={e=>{e.stopPropagation();onAdvance(c)}} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}10`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>Advance →</button>
        }
        {level>=2&&onDq&&<button onClick={e=>{e.stopPropagation();onDq(c)}} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${RED}40`,background:`${RED}10`,color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>DQ</button>}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────
export default function Candidates({level=1}:{level?:number}={}){
  const [candidates,setCandidates] = useState<Candidate[]>([])
  const [allLogs,setAllLogs]       = useState<ContactLog[]>([])
  const [loading,setLoading]       = useState(true)
  const [tab,setTab]               = useState<Tab>('active')
  const [archiveFilter,setArchiveFilter] = useState('all')
  const [detail,setDetail]         = useState<Candidate|null>(null)
  const [detailTab,setDetailTab]   = useState<DetailTab>('profile')
  const [briefText,setBriefText]   = useState('')
  const [briefLoading,setBriefLoading] = useState(false)
  const [refreshKey,setRefreshKey] = useState(0)
  const [logModal,setLogModal]     = useState<Candidate|null>(null)
  const [advanceModal,setAdvanceModal] = useState<Candidate|null>(null)
  const [dqModal,setDqModal]       = useState<Candidate|null>(null)
  const [logForm,setLogForm]       = useState({outcome:'Neutral',logNotes:'',nextDate:'',objection:'None'})
  const [dqReason,setDqReason]     = useState('')
  const [actionLoading,setActionLoading] = useState(false)
  const [loadErr,setLoadErr]           = useState('')
  const [notesValue,setNotesValue]     = useState('')
  const [notesSaving,setNotesSaving]   = useState(false)
  const [notesSaveErr,setNotesSaveErr] = useState('')
  const [launchConfirm,setLaunchConfirm] = useState<Candidate|null>(null)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{
    async function load(){
      setLoading(true); setLoadErr('')
      try{
        const {data:{session}}=await supabase.auth.getSession()
        const token=session?.access_token||''
        const resp=await fetch('/api/team/my-candidates',{headers:{Authorization:`Bearer ${token}`}})
        if(!resp.ok){ setLoadErr(`Failed to load candidates (${resp.status})`); return }
        const {candidates:data,logs}=await resp.json()
        setCandidates((data||[]) as Candidate[])
        setAllLogs((logs||[]) as ContactLog[])
      }catch(e){setLoadErr('Failed to load candidates')}finally{setLoading(false)}
    }
    load()
  },[refreshKey])

  useEffect(()=>{
    if(notesTimerRef.current){clearTimeout(notesTimerRef.current);notesTimerRef.current=null}
    setNotesValue(detail?getNotes(detail):'')
    return ()=>{ if(notesTimerRef.current)clearTimeout(notesTimerRef.current) }
  },[detail?.id]) // eslint-disable-line

  useEffect(()=>{
    if(detail){const fresh=candidates.find(c=>c.id===detail.id);if(fresh)setDetail(fresh)}
  },[candidates]) // eslint-disable-line

  function handleNotesChange(val:string){
    setNotesValue(val)
    if(notesTimerRef.current)clearTimeout(notesTimerRef.current)
    notesTimerRef.current=setTimeout(async()=>{
      if(!detail)return
      setNotesSaving(true)
      setNotesSaveErr('')
      try{await callAction('update_notes',detail.id,{notes:val})}catch{setNotesSaveErr('Notes failed to save — please try again')}
      setNotesSaving(false)
      notesTimerRef.current=null
    },1200)
  }

  async function callAction(action:string,candidateId:string,payload:Record<string,unknown>){
    const {data:{session}}=await supabase.auth.getSession()
    const token=session?.access_token||''
    const res=await fetch('/api/team/candidates/action',{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({action,candidateId,...payload})
    })
    if(!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  const todayStr=today()

  const active   = useMemo(()=>candidates.filter(c=>c.status==='active'),[candidates])
  const archived = useMemo(()=>candidates.filter(c=>c.status==='disqualified'),[candidates])
  const launched = useMemo(()=>candidates.filter(c=>c.status==='launched'),[candidates])

  const dupeSet = useMemo(()=>{
    const seen=new Set<string>()
    const phoneGroups:Record<string,string[]>={}
    const nameGroups:Record<string,string[]>={}
    active.forEach(c=>{
      const p=(c.phone||'').replace(/\D/g,'')
      if(p.length>=8){if(!phoneGroups[p])phoneGroups[p]=[];phoneGroups[p].push(c.id)}
      const n=c.name.toLowerCase().trim()
      if(n){if(!nameGroups[n])nameGroups[n]=[];nameGroups[n].push(c.id)}
    })
    Object.values(phoneGroups).forEach(ids=>{if(ids.length>1)ids.forEach(id=>seen.add(id))})
    Object.values(nameGroups).forEach(ids=>{if(ids.length>1)ids.forEach(id=>seen.add(id))})
    return seen
  },[active])

  const scores=useMemo(()=>{
    const m:Record<string,number>={}
    candidates.forEach(c=>{
      const last=allLogs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
      m[c.id]=healthScore(c,last?.created_at??c.updated_at)
    })
    return m
  },[candidates,allLogs])

  const stageCounts=useMemo(()=>{const m:Record<string,number>={};STAGES.forEach(s=>{m[s]=active.filter(c=>normaliseStage(c.stage)===s).length});return m},[active])

  const nextDueMap=useMemo(()=>{
    const m:Record<string,string>={}
    candidates.forEach(c=>{
      const nd=allLogs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).find(l=>l.next_date)?.next_date??''
      if(nd)m[c.id]=nd
    })
    return m
  },[candidates,allLogs])

  const touchCountMap=useMemo(()=>{
    const m:Record<string,number>={}
    allLogs.forEach(l=>{m[l.entity_id]=(m[l.entity_id]||0)+1})
    return m
  },[allLogs])

  const displayList=useMemo(()=>{
    return [...active].sort((a,b)=>{
      const as=FU_STAGES.includes(normaliseStage(a.stage))&&daysSince(allLogs.filter(l=>l.entity_id===a.id)[0]?.created_at??a.updated_at)>=21
      const bs=FU_STAGES.includes(normaliseStage(b.stage))&&daysSince(allLogs.filter(l=>l.entity_id===b.id)[0]?.created_at??b.updated_at)>=21
      if(as!==bs)return as?-1:1
      return (scores[b.id]??0)-(scores[a.id]??0)
    })
  },[active,scores,allLogs])

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
    allLogs.filter(l=>(l as any).objection&&(l as any).objection!=='None').forEach(l=>{
      const o=(l as any).objection as string;m[o]=(m[o]||0)+1
    })
    return Object.entries(m).sort((a,b)=>b[1]-a[1])
  },[allLogs])

  function openView(c:Candidate){setDetail(c);setDetailTab('profile');setBriefText('')}

  async function getBrief(c:Candidate){
    setBriefLoading(true);setBriefText('')
    const logs=allLogs.filter(l=>l.entity_id===c.id).slice(0,5)
    const stage=normaliseStage(c.stage)
    try{
      setBriefText(buildPreCallBrief({
        name:c.name,stageLabel:stage,daysSinceContact:daysSince(c.updated_at),
        driver:c.primary_driver,painPoint:c.pain_point,
        metricLabel:'HxL',metricValue:c.hxl_score,
        notes:getNotes(c).slice(0,200),
        nextAction:STAGE_CFG[stage].nextAction,
        recentOutcomes:logs.map(l=>l.outcome),
      }))
    }catch{setBriefText('Failed.')}
    setBriefLoading(false)
  }

  const cardProps={contactLogs:allLogs,scores,onView:openView,level,onLog:setLogModal,onAdvance:setAdvanceModal,onDq:setDqModal,onLaunch:setLaunchConfirm}

  if(loading)return<div style={{padding:'48px',textAlign:'center',color:'var(--text4)',fontSize:12}}>Loading candidates…</div>

  if(loadErr)return<div style={{padding:'48px',textAlign:'center',color:RED}}>{loadErr}</div>

  return(
    <ErrorBoundary label="Candidates">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:80}}>

      {/* Tabs */}
      <div style={{display:'flex',gap:3,marginBottom:14,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)',overflowX:'auto'}}>
        {([['active',`Active (${active.length})`],['funnel','📊 Funnel'],['archive',`🗄 Archive (${archived.length})`]] as const).map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:'8px 6px',borderRadius:'var(--r)',border:'none',background:tab===id?'var(--s3)':'transparent',color:tab===id?GOLD:'var(--text3)',fontSize:10,fontWeight:tab===id?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",transition:'all 0.15s',whiteSpace:'nowrap',flexShrink:0}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ACTIVE TAB ── */}
      {tab==='active'&&(
        <div>
          {displayList.length===0
            ?<div style={{...CARD,textAlign:'center',padding:'48px',color:'var(--text4)'}}>No candidates assigned yet.</div>
            :displayList.map(c=><CandCard key={c.id} c={c} {...cardProps} isDupe={dupeSet.has(c.id)} nextDue={nextDueMap[c.id]} touchCount={touchCountMap[c.id]}/>)
          }
        </div>
      )}

      {/* ── FUNNEL TAB ── */}
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

          {(()=>{
            const worst=funnel.slice(1).reduce<typeof funnel[number]>((w,f)=>f.convRate<w.convRate?f:w,funnel[1]??funnel[0])
            return worst&&worst.convRate<100?(
              <div style={{...CARD,borderLeft:`3px solid ${RED}`,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:RED}}>⚡ Bottleneck: {worst.stage}</div>
                <div style={{fontSize:11,color:'var(--text4)',marginTop:4}}>Only {worst.convRate}% convert from {funnel[funnel.indexOf(worst)-1]?.stage} → this is your biggest drop-off</div>
              </div>
            ):null
          })()}

          {(()=>{
            const lh=launched.filter(c=>getStageHistory(c).length>0)
            if(lh.length===0)return null
            const avgDays=Math.round(lh.reduce((sum,c)=>{
              const hist=getStageHistory(c)
              const firstDate=hist[0]?.date??c.created_at.slice(0,10)
              const launchDate=getLaunchedAt(c)||c.updated_at.slice(0,10)
              return sum+Math.max(0,daysSince(firstDate)-daysSince(launchDate))
            },0)/lh.length)
            return(
              <div style={{...CARD,marginBottom:12}}>
                <div style={SL}>Pipeline Velocity</div>
                <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                  <div><div style={{fontSize:22,fontWeight:800,color:GOLD,fontFamily:"'JetBrains Mono',monospace"}}>{avgDays}d</div><div style={{fontSize:9,color:'var(--text4)'}}>avg days Pre-Filter → Launch</div></div>
                  <div><div style={{fontSize:22,fontWeight:800,color:GREEN,fontFamily:"'JetBrains Mono',monospace"}}>{launched.length}</div><div style={{fontSize:9,color:'var(--text4)'}}>total launched</div></div>
                </div>
              </div>
            )
          })()}

          {(()=>{
            const src:Record<string,number>={}
            candidates.forEach(c=>{const s=c.source||'Unknown';src[s]=(src[s]||0)+1})
            const sorted=Object.entries(src).sort((a,b)=>b[1]-a[1]).slice(0,6)
            if(!sorted.length)return null
            return(
              <div style={{...CARD,marginBottom:12}}>
                <div style={SL}>Candidate Sources</div>
                {sorted.map(([s,cnt])=>(
                  <div key={s} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--br)',fontSize:12}}>
                    <span style={{color:'var(--text2)'}}>{s}</span>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span className="mono" style={{color:GOLD,fontWeight:700}}>{cnt}</span>
                      <span style={{fontSize:10,color:'var(--text4)'}}>{Math.round(cnt/Math.max(candidates.length,1)*100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Overall Stats</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}}>
              {[{l:'Total',v:candidates.length,c:'var(--text2)'},{l:'Active',v:active.length,c:GOLD},{l:'Launched',v:launched.length,c:GREEN},{l:'Archived',v:archived.length,c:RED},{l:'Conv rate',v:candidates.length>0?Math.round(launched.length/candidates.length*100)+'%':'0%',c:PURPLE}].map(k=>(
                <div key={k.l} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'10px',textAlign:'center'}}>
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

      {/* ── ARCHIVE TAB ── */}
      {tab==='archive'&&(
        <div>
          {archived.length>0&&(
            <div style={{display:'flex',gap:5,overflowX:'auto',marginBottom:12}}>
              {(['all',...DQ_REASONS] as const).map(r=>{
                const count=r==='all'?archived.length:archived.filter(c=>{
                  const log=allLogs.filter(l=>l.entity_id===c.id&&l.event_type==='disqualified')[0]
                  return log?.notes===r
                }).length
                return count>0&&(
                  <div key={r} onClick={()=>setArchiveFilter(r===archiveFilter?'all':r)}
                    style={{padding:'4px 10px',borderRadius:20,border:`1px solid ${archiveFilter===r?RED:'rgba(255,255,255,0.08)'}`,background:archiveFilter===r?'rgba(224,85,85,0.1)':'transparent',cursor:'pointer',flexShrink:0,fontSize:10,color:archiveFilter===r?RED:'var(--text4)'}}>
                    {r==='all'?`All (${count})`:r} {r!=='all'&&`(${count})`}
                  </div>
                )
              })}
            </div>
          )}
          {(()=>{
            const re=archived.filter(c=>daysSince(c.updated_at)>=90)
            if(!re.length)return null
            return(
              <div style={{...CARD,marginBottom:12,borderLeft:`3px solid ${GOLD}`}}>
                <div style={SL}>Re-engagement queue ({re.length})</div>
                <div style={{fontSize:11,color:'var(--text4)',marginBottom:10}}>Archived 90+ days ago — worth a reconnect?</div>
                {re.slice(0,5).map(c=>{
                  const log=allLogs.filter(l=>l.entity_id===c.id&&l.event_type==='disqualified')[0]
                  return(
                    <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderTop:'1px solid var(--br)'}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600}}>{c.name}</div>
                        <div style={{fontSize:10,color:'var(--text4)'}}>{normaliseStage(c.stage)} · DQ'd {daysSince(c.updated_at)}d ago{log?.notes?` · ${log.notes}`:''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
          {(()=>{
            const filtered=archived.filter(c=>{
              if(archiveFilter==='all')return true
              const log=allLogs.filter(l=>l.entity_id===c.id&&l.event_type==='disqualified')[0]
              return log?.notes===archiveFilter
            })
            if(!filtered.length)return<div style={{...CARD,textAlign:'center',padding:'48px',color:'var(--text4)'}}>No archived candidates</div>
            return filtered.map(c=>{
              const log=allLogs.filter(l=>l.entity_id===c.id&&l.event_type==='disqualified')[0]
              return(
                <div key={c.id} style={{...CARD,opacity:0.85}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{c.name}</div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.1)',color:RED}}>DQ at {normaliseStage(c.stage)}</span>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{log?.notes||'Archived'}</span>
                        {daysSince(c.updated_at)>=90&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${GOLD}10`,color:GOLD}}>{daysSince(c.updated_at)}d ago</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>openView(c)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>View →</button>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* ── LOG CONTACT MODAL ── */}
      {logModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setLogModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:480,padding:'24px',margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Log Contact</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:16}}>{logModal.name}</div>
            <div style={{marginBottom:18}}>
              <div style={SL}>Notes</div>
              <textarea value={logForm.logNotes} onChange={e=>setLogForm(f=>({...f,logNotes:e.target.value}))} rows={5} placeholder="What happened? Key moments, commitments…" autoFocus style={{...INP,resize:'vertical',fontSize:12}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button disabled={actionLoading} onClick={async()=>{
                setActionLoading(true)
                try{const r=await callAction('log_contact',logModal.id,{notes:logForm.logNotes});if(r?.error)throw new Error(r.error);setLogModal(null);setLogForm({outcome:'Neutral',logNotes:'',nextDate:'',objection:'None'});setRefreshKey(k=>k+1)}catch(e:any){alert('Save failed: '+(e?.message||'Unknown error'))}finally{setActionLoading(false)}
              }} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontWeight:700,cursor:actionLoading?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,opacity:actionLoading?0.6:1}}>
                {actionLoading?'Saving…':'Save Log'}
              </button>
              <button onClick={()=>setLogModal(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADVANCE MODAL ── */}
      {advanceModal&&(()=>{
        const cur=normaliseStage(advanceModal.stage)
        const next=STAGE_CFG[cur].next
        if(!next)return null
        return(
          <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setAdvanceModal(null)}}>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:420,padding:'24px',margin:'auto'}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Advance Stage</div>
              <div style={{fontSize:11,color:'var(--text4)',marginBottom:20}}>{advanceModal.name}</div>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24,padding:'12px 14px',background:'var(--s2)',borderRadius:'var(--r)'}}>
                <span style={{fontSize:12,padding:'3px 10px',borderRadius:8,background:STAGE_CFG[cur].bg,color:STAGE_CFG[cur].color,fontWeight:600}}>{cur}</span>
                <span style={{color:'var(--text4)',fontSize:14}}>→</span>
                <span style={{fontSize:12,padding:'3px 10px',borderRadius:8,background:STAGE_CFG[next].bg,color:STAGE_CFG[next].color,fontWeight:600}}>{next}</span>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button disabled={actionLoading} onClick={async()=>{
                  setActionLoading(true)
                  try{const r=await callAction('advance_stage',advanceModal.id,{});if(r?.error)throw new Error(r.error);setAdvanceModal(null);setRefreshKey(k=>k+1)}catch(e:any){alert('Advance failed: '+(e?.message||'Unknown error'))}finally{setActionLoading(false)}
                }} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:GREEN,color:'#000',fontWeight:700,cursor:actionLoading?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,opacity:actionLoading?0.6:1}}>
                  {actionLoading?'Saving…':'Confirm Advance'}
                </button>
                <button onClick={()=>setAdvanceModal(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── DQ MODAL ── */}
      {dqModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setDqModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:420,padding:'24px',margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Disqualify</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:16}}>{dqModal.name}</div>
            <div style={{marginBottom:16}}>
              <div style={SL}>Reason</div>
              <select value={dqReason} onChange={e=>setDqReason(e.target.value)} style={{...INP,fontSize:12}}>
                <option value="">Select reason…</option>
                {DQ_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button disabled={actionLoading||!dqReason} onClick={async()=>{
                setActionLoading(true)
                try{const r=await callAction('dq',dqModal.id,{reason:dqReason});if(r?.error)throw new Error(r.error);setDqModal(null);setDqReason('');setRefreshKey(k=>k+1)}catch(e:any){alert('Disqualify failed: '+(e?.message||'Unknown error'))}finally{setActionLoading(false)}
              }} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:RED,color:'#fff',fontWeight:700,cursor:(actionLoading||!dqReason)?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,opacity:(actionLoading||!dqReason)?0.5:1}}>
                {actionLoading?'Saving…':'Disqualify'}
              </button>
              <button onClick={()=>setDqModal(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DETAIL DRAWER ── */}
      {detail&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setDetail(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:580,overflow:'hidden',margin:'auto'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid var(--br)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{detail.name}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {(()=>{const cfg=STAGE_CFG[normaliseStage(detail.stage)];return<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:700}}>{normaliseStage(detail.stage)}</span>})()}
                  {detail.primary_driver&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${GOLD}10`,color:GOLD}}>{detail.primary_driver}</span>}
                  <span style={{fontSize:10,color:healthColor(scores[detail.id]??0),fontWeight:700}}>Health {scores[detail.id]??0}</span>
                </div>
              </div>
              <button onClick={()=>setDetail(null)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:22}}>×</button>
            </div>
            <div style={{display:'flex',borderBottom:'1px solid var(--br)',overflowX:'auto'}}>
              {(['profile','history','timeline','brief'] as DetailTab[]).map(t=>(
                <button key={t} onClick={()=>{setDetailTab(t);if(t==='brief')getBrief(detail)}}
                  style={{flex:1,padding:'10px 8px',border:'none',background:'transparent',color:detailTab===t?GOLD:'var(--text4)',fontSize:10,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:detailTab===t?700:400,borderBottom:`2px solid ${detailTab===t?GOLD:'transparent'}`,transition:'all 0.15s',whiteSpace:'nowrap'}}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
            <div style={{padding:'18px 24px',maxHeight:'55vh',overflowY:'auto'}}>

              {/* PROFILE */}
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
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={SL}>Notes</div>
                    {notesSaving&&<span style={{fontSize:9,color:'var(--text4)'}}>Saving…</span>}
                  </div>
                  <textarea value={notesValue} onChange={e=>handleNotesChange(e.target.value)} rows={5} placeholder="Add notes…" style={{...INP,resize:'vertical',fontSize:12}}/>
                  {notesSaveErr&&<div style={{fontSize:10,color:'var(--red,#e05)',marginTop:3}}>{notesSaveErr}</div>}
                </div>
              )}

              {/* HISTORY */}
              {detailTab==='history'&&(
                <div>
                  {allLogs.filter(l=>l.entity_id===detail.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).length===0
                    ?<div style={{fontSize:12,color:'var(--text4)',padding:'24px 0',textAlign:'center'}}>No contact logged yet</div>
                    :allLogs.filter(l=>l.entity_id===detail.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(log=>(
                      <div key={log.id} style={{padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <div style={{display:'flex',gap:6,alignItems:'center'}}>
                            <span style={{fontSize:11,fontWeight:600,color:({Positive:GREEN,Negative:RED,Neutral:GOLD,'No Show':RED,'Not Yet':'var(--text4)'}[log.outcome]??'var(--text4)')}}>{log.outcome||log.event_type.replace(/_/g,' ')}</span>
                            {(log as any).objection&&(log as any).objection!=='None'&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:6,background:'rgba(224,85,85,0.1)',color:RED}}>{(log as any).objection}</span>}
                          </div>
                          <span style={{fontSize:9,color:'var(--text4)'}}>{log.created_at.slice(0,10)}</span>
                        </div>
                        {log.notes&&<div style={{fontSize:11,color:'var(--text3)',lineHeight:1.5}}>{log.notes}</div>}
                        {log.next_action&&<div style={{fontSize:10,color:'var(--text4)',marginTop:2}}>Next: {log.next_action}{log.next_date?` · ${fmtDate(log.next_date)}`:''}</div>}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* TIMELINE */}
              {detailTab==='timeline'&&(()=>{
                const history=getStageHistory(detail)
                const allStages=[...history,{stage:normaliseStage(detail.stage),date:detail.updated_at?.slice(0,10)??''}]
                return(
                  <div>
                    {allStages.length===0
                      ?<div style={{fontSize:12,color:'var(--text4)',padding:'24px 0',textAlign:'center'}}>No stage history yet</div>
                      :allStages.map((h,i)=>{
                          const cfg=STAGE_CFG[normaliseStage(h.stage)]
                          const nextDate=allStages[i+1]?.date
                          const daysAtStage=nextDate?Math.floor((new Date(nextDate).getTime()-new Date(h.date).getTime())/86400000):daysSince(h.date)
                          const isCurrent=i===allStages.length-1
                          return(
                            <div key={i} style={{display:'flex',gap:12,marginBottom:0}}>
                              <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:24,flexShrink:0}}>
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

              {/* BRIEF */}
              {detailTab==='brief'&&(
                <div>
                  <div style={{...SL,marginBottom:10}}>Pre-Call Brief</div>
                  {briefLoading
                    ?<div style={{fontSize:13,color:'var(--text3)',fontStyle:'italic',padding:'20px 0'}}>Generating…</div>
                    :briefText
                      ?<div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,whiteSpace:'pre-wrap'}}>{briefText}</div>
                      :<div style={{fontSize:12,color:'var(--text4)',padding:'12px 0'}}>Generate a stage-specific pre-call brief.</div>
                  }
                  {!briefLoading&&<button onClick={()=>getBrief(detail)} style={{marginTop:12,padding:'7px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:'rgba(200,162,74,0.08)',color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>{briefText?'↻ Refresh':'Generate Brief'}</button>}
                </div>
              )}

            </div>
            {normaliseStage(detail.stage)!=='Pre-Filter'&&(
              <div style={{padding:'14px 24px',borderTop:'1px solid var(--br)',display:'flex'}}>
                <button disabled={actionLoading} onClick={async()=>{
                  setActionLoading(true)
                  try{const r=await callAction('back_stage',detail.id,{});if(r?.error)throw new Error(r.error);setRefreshKey(k=>k+1);setDetail(null)}catch(e:any){alert('Move back failed: '+(e?.message||'Unknown error'))}finally{setActionLoading(false)}
                }} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text2)',cursor:actionLoading?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,opacity:actionLoading?0.6:1}}>
                  ← Move back a stage
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── LAUNCH CONFIRM MODAL ── */}
      {launchConfirm&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setLaunchConfirm(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:420,padding:'24px',margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>🚀 Launch Candidate</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:16}}>{launchConfirm.name}</div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:24,lineHeight:1.6}}>This marks <strong>{launchConfirm.name}</strong> as a launched team member. This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button disabled={actionLoading} onClick={async()=>{
                setActionLoading(true)
                try{const r=await callAction('launch',launchConfirm.id,{});if(r?.error)throw new Error(r.error);setLaunchConfirm(null);setRefreshKey(k=>k+1)}catch(e:any){alert('Launch failed: '+(e?.message||'Unknown error'))}finally{setActionLoading(false)}
              }} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GREEN},#3da872)`,color:'#fff',fontWeight:700,cursor:actionLoading?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,opacity:actionLoading?0.6:1}}>
                {actionLoading?'Launching…':'🚀 Confirm Launch'}
              </button>
              <button onClick={()=>setLaunchConfirm(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
    </ErrorBoundary>
  )
}
